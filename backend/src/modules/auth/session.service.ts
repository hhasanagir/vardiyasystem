import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  isActive: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditLog: AuditLogService,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(params: {
    userId: string;
    jti?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
    expiresAt: Date;
  }): Promise<SessionInfo> {
    const jti = params.jti || randomUUID();
    const session = await this.prisma.authSession.create({
      data: {
        userId: params.userId,
        hashedToken: '',
        jti,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceInfo: params.deviceInfo,
        expiresAt: params.expiresAt,
      },
    });

    this.logger.log(`Session created: ${session.id} for user ${params.userId}`);
    return this.toSessionInfo(session);
  }

  async linkTokenToSession(sessionId: string, rawToken: string): Promise<void> {
    const hashed = this.hashToken(rawToken);
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { hashedToken: hashed },
    });
  }

  async findByToken(rawToken: string): Promise<SessionInfo | null> {
    const hashed = this.hashToken(rawToken);
    const session = await this.prisma.authSession.findFirst({
      where: { hashedToken: hashed },
    });
    return session ? this.toSessionInfo(session) : null;
  }

  async findByUser(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => this.toSessionInfo(s));
  }

  async updateLastUsed(sessionId: string): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }

  async revoke(
    sessionId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (session.revokedAt) {
      return;
    }

    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    try {
      await this.auditLog.log({
        userId,
        action: 'SESSION_REVOKED',
        entityType: 'AUTH_SESSION',
        entityId: sessionId,
        ipAddress: session.ipAddress || undefined,
        userAgent: session.userAgent || undefined,
        reason: reason || 'User initiated revocation',
      });
    } catch {
      this.logger.warn('Failed to log session revocation audit');
    }

    this.logger.warn(
      `Session revoked: ${sessionId} for user ${userId}${reason ? ` (${reason})` : ''}`,
    );
  }

  async revokeAllForUser(
    userId: string,
    excludeSessionId?: string,
  ): Promise<number> {
    const where: any = { userId, revokedAt: null };
    if (excludeSessionId) {
      where.id = { not: excludeSessionId };
    }

    const result = await this.prisma.authSession.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    try {
      await this.auditLog.log({
        userId,
        action: 'ALL_SESSIONS_REVOKED',
        entityType: 'AUTH_SESSION',
        reason: 'User initiated logout from all devices',
        metadata: { count: result.count, excludeSessionId },
      });
    } catch {
      this.logger.warn('Failed to log bulk session revocation audit');
    }

    this.logger.warn(`Revoked ${result.count} sessions for user ${userId}`);
    return result.count;
  }

  async revokeByJti(jti: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async cleanExpired(): Promise<number> {
    const result = await this.prisma.authSession.deleteMany({
      where: {
        revokedAt: { not: null },
        expiresAt: { lt: new Date() },
      },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned ${result.count} expired/revoked sessions`);
    }
    return result.count;
  }

  async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const session = await this.prisma.authSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) return false;
      if (session.revokedAt) return false;
      if (session.expiresAt < new Date()) return false;
      return true;
    } catch {
      return false;
    }
  }

  private toSessionInfo(session: {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceInfo: string | null;
    lastUsedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }): SessionInfo {
    return {
      id: session.id,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceInfo: session.deviceInfo,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
      isActive: !session.revokedAt && session.expiresAt > new Date(),
    };
  }
}
