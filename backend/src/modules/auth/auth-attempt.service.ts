import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AuthAttemptService {
  private readonly logger = new Logger(AuthAttemptService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditLog: AuditLogService,
  ) {}

  async recordAttempt(params: {
    email?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    attemptType: string;
    success: boolean;
    jti?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.authAttempt.create({
        data: {
          email: params.email?.toLowerCase(),
          userId: params.userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          attemptType: params.attemptType,
          success: params.success,
          jti: params.jti,
          metadata: params.metadata as any,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to record auth attempt',
        (error as Error).message,
      );
    }
  }

  async getRecentFailures(params: {
    email?: string;
    ipAddress?: string;
    windowMs: number;
  }): Promise<number> {
    const since = new Date(Date.now() - params.windowMs);

    const where: any[] = [{ success: false, createdAt: { gte: since } }];

    if (params.email) {
      where.push({ email: params.email.toLowerCase() });
    }
    if (params.ipAddress) {
      where.push({ ipAddress: params.ipAddress });
    }

    try {
      const count = await this.prisma.authAttempt.count({
        where: {
          AND: [
            { success: false, createdAt: { gte: since } },
            {
              OR: [
                ...(params.email
                  ? [{ email: params.email.toLowerCase() }]
                  : []),
                ...(params.ipAddress ? [{ ipAddress: params.ipAddress }] : []),
              ],
            },
          ],
        },
      });
      return count;
    } catch {
      return 0;
    }
  }

  async isLockedOut(params: {
    email?: string;
    ipAddress?: string;
  }): Promise<{ locked: boolean; remainingMs: number; reason?: string }> {
    const email = params.email?.toLowerCase();
    const emailLock = email
      ? await this.prisma.authAttempt.findFirst({
          where: {
            email,
            lockoutUntil: { gt: new Date() },
          },
          orderBy: { lockoutUntil: 'desc' },
        })
      : null;

    const ipLock = params.ipAddress
      ? await this.prisma.authAttempt.findFirst({
          where: {
            ipAddress: params.ipAddress,
            lockoutUntil: { gt: new Date() },
          },
          orderBy: { lockoutUntil: 'desc' },
        })
      : null;

    const latestLockout = emailLock || ipLock;
    if (latestLockout?.lockoutUntil) {
      const remainingMs = latestLockout.lockoutUntil.getTime() - Date.now();
      return {
        locked: true,
        remainingMs: Math.max(0, remainingMs),
        reason: emailLock
          ? 'Too many failed login attempts for this account'
          : 'Too many failed login attempts from this IP',
      };
    }

    return { locked: false, remainingMs: 0 };
  }

  async applyLockout(params: {
    email?: string;
    ipAddress?: string;
    failureCount: number;
    userAgent?: string;
  }) {
    const threshold = this.configService.get<number>(
      'AUTH_LOCKOUT_THRESHOLD',
      5,
    );
    if (params.failureCount < threshold) {
      return null;
    }

    const baseDuration = this.configService.get<number>(
      'AUTH_LOCKOUT_DURATION_MS',
      900000,
    );
    const progressiveFactor = this.configService.get<number>(
      'AUTH_LOCKOUT_PROGRESSIVE_FACTOR',
      1.5,
    );
    const maxDuration = this.configService.get<number>(
      'AUTH_LOCKOUT_MAX_DURATION_MS',
      86400000,
    );

    const excessFailures = params.failureCount - threshold + 1;
    const duration = Math.min(
      Math.floor(
        baseDuration * Math.pow(progressiveFactor, excessFailures - 1),
      ),
      maxDuration,
    );

    const lockoutUntil = new Date(Date.now() + duration);

    try {
      await this.prisma.authAttempt.create({
        data: {
          email: params.email?.toLowerCase(),
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          attemptType: 'LOCKOUT',
          success: false,
          lockoutUntil,
          metadata: { failureCount: params.failureCount, durationMs: duration },
        },
      });

      const targetId = params.email || params.ipAddress || 'unknown';
      try {
        // Resolve a real userId (a lockout often targets a user that does not
        // exist yet). Writing a fake 'system' userId violates the audit FK.
        let auditUserId: string | null = null;
        if (params.email) {
          const targetUser = await this.prisma.user.findFirst({
            where: { email: params.email.toLowerCase() },
            select: { id: true },
          });
          auditUserId = targetUser?.id ?? null;
        }

        if (auditUserId) {
          await this.auditLog.log({
            userId: auditUserId,
            action: 'LOCKOUT',
            entityType: 'AUTH',
            entityId: targetId,
            metadata: {
              email: params.email,
              ipAddress: params.ipAddress,
              failureCount: params.failureCount,
              lockoutDurationMs: duration,
            },
            reason: `Account locked for ${duration}ms after ${params.failureCount} failures`,
          });
        }
      } catch {
        this.logger.warn('Failed to log lockout audit event');
      }

      this.logger.warn(
        `Lockout applied to ${params.email || params.ipAddress} for ${duration}ms after ${params.failureCount} failures`,
      );
    } catch (error) {
      this.logger.error('Failed to apply lockout', (error as Error).message);
    }

    return lockoutUntil;
  }

  async getConsecutiveFailures(params: {
    email?: string;
    ipAddress?: string;
  }): Promise<number> {
    const since = new Date(Date.now() - 86400000);

    const where: any = {
      success: false,
      createdAt: { gte: since },
    };

    if (params.email) {
      where.email = params.email.toLowerCase();
    }
    if (params.ipAddress) {
      where.ipAddress = params.ipAddress;
    }

    try {
      const recentFailures = await this.prisma.authAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      let count = 0;
      for (const attempt of recentFailures) {
        if (attempt.attemptType === 'LOGIN' && !attempt.success) {
          count++;
        } else if (attempt.success) {
          break;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  async unlockAccount(params: {
    email?: string;
    ipAddress?: string;
  }): Promise<boolean> {
    const email = params.email?.toLowerCase();
    let unlocked = false;

    if (email) {
      const result = await this.prisma.authAttempt.updateMany({
        where: { email, lockoutUntil: { gt: new Date() } },
        data: { lockoutUntil: new Date(0) },
      });
      if (result.count > 0) unlocked = true;
    }

    if (params.ipAddress) {
      const result = await this.prisma.authAttempt.updateMany({
        where: {
          ipAddress: params.ipAddress,
          lockoutUntil: { gt: new Date() },
        },
        data: { lockoutUntil: new Date(0) },
      });
      if (result.count > 0) unlocked = true;
    }

    if (unlocked) {
      const targetId = email || params.ipAddress || 'unknown';
      try {
        let auditUserId: string | null = null;
        if (email) {
          const targetUser = await this.prisma.user.findFirst({
            where: { email },
            select: { id: true },
          });
          auditUserId = targetUser?.id ?? null;
        }
        if (auditUserId) {
          await this.auditLog.log({
            userId: auditUserId,
            action: 'ACCOUNT_UNLOCKED',
            entityType: 'AUTH',
            entityId: targetId,
            metadata: { email, ipAddress: params.ipAddress },
          });
        }
      } catch {
        this.logger.warn('Failed to log unlock audit event');
      }
      this.logger.warn(`Account unlocked: ${targetId}`);
    }

    return unlocked;
  }
}
