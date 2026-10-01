import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SessionService } from './session.service';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private recentlyUsed = new Map<
    string,
    { usedAt: Date; ipAddress?: string }
  >();
  private readonly IN_MEMORY_TTL_MS = 3600000;

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private configService: ConfigService,
    private sessionService: SessionService,
  ) {
    setInterval(() => this.cleanup(), 300000);
  }

  hashToken(token: string): string {
    return this.sessionService.hashToken(token);
  }

  async markUsed(params: {
    jti: string;
    userId: string;
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    this.recentlyUsed.set(params.jti, {
      usedAt: new Date(),
      ipAddress: params.ipAddress,
    });

    await this.sessionService.updateLastUsed(params.sessionId);

    try {
      await this.prisma.authAttempt.create({
        data: {
          userId: params.userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          attemptType: 'REFRESH_USED',
          success: true,
          jti: params.jti,
          metadata: { sessionId: params.sessionId },
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to record refresh token use',
        (error as Error).message,
      );
    }
  }

  async detectReplay(params: {
    jti: string;
    userId: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ replay: boolean; firstIp?: string }> {
    const inMemoryHit = this.recentlyUsed.get(params.jti);
    if (inMemoryHit) {
      this.logger.warn(
        `Refresh token replay detected (in-memory): jti=${params.jti}, userId=${params.userId}`,
      );
      await this.logReplay(params, inMemoryHit);
      return { replay: true, firstIp: inMemoryHit.ipAddress };
    }

    const dbHit = await this.prisma.authAttempt.findFirst({
      where: {
        jti: params.jti,
        attemptType: 'REFRESH_USED',
      },
    });

    if (dbHit) {
      this.logger.warn(
        `Refresh token replay detected (DB): jti=${params.jti}, userId=${params.userId}`,
      );
      await this.logReplay(params, {
        usedAt: dbHit.createdAt,
        ipAddress: dbHit.ipAddress || undefined,
      });
      return { replay: true, firstIp: dbHit.ipAddress || undefined };
    }

    return { replay: false };
  }

  private async logReplay(
    params: {
      jti: string;
      userId: string;
      ipAddress?: string;
      userAgent?: string;
    },
    firstUse: { usedAt: Date; ipAddress?: string },
  ) {
    try {
      await this.prisma.authAttempt.create({
        data: {
          userId: params.userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          attemptType: 'REFRESH_REPLAY',
          success: false,
          jti: params.jti,
          metadata: {
            userId: params.userId,
            firstUsed: firstUse.usedAt.toISOString(),
            previousIp: firstUse.ipAddress,
          },
        },
      });

      await this.auditLog.log({
        userId: params.userId,
        action: 'REFRESH_REPLAY',
        entityType: 'REFRESH_TOKEN',
        entityId: params.jti,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          jti: params.jti,
          firstUsed: firstUse.usedAt.toISOString(),
          previousIp: firstUse.ipAddress,
        },
        reason: 'Refresh token replay detected — possible token theft',
      });
    } catch (error) {
      this.logger.error(
        'Failed to log replay detection',
        (error as Error).message,
      );
    }
  }

  async checkPriorRefresh(params: {
    userId: string;
    sinceMs: number;
  }): Promise<number> {
    const since = new Date(Date.now() - params.sinceMs);
    try {
      return await this.prisma.authAttempt.count({
        where: {
          attemptType: 'REFRESH_USED',
          userId: params.userId,
          createdAt: { gte: since },
        },
      });
    } catch {
      let count = 0;
      for (const [, record] of this.recentlyUsed) {
        if (record.usedAt >= since) {
          count++;
        }
      }
      return count;
    }
  }

  private cleanup() {
    const cutoff = Date.now() - this.IN_MEMORY_TTL_MS;
    for (const [jti, record] of this.recentlyUsed) {
      if (record.usedAt.getTime() < cutoff) {
        this.recentlyUsed.delete(jti);
      }
    }
    this.sessionService.cleanExpired().catch(() => {});
  }
}
