import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(private prisma: PrismaService) {}

  async getPolicies() {
    return this.prisma.dataRetentionPolicy.findMany({
      orderBy: { entityType: 'asc' },
    });
  }

  async upsertPolicy(data: {
    entityType: string;
    retentionDays: number;
    archiveAfterDays?: number;
    purgeAfterDays?: number;
    description?: string;
  }) {
    return this.prisma.dataRetentionPolicy.upsert({
      where: { entityType: data.entityType },
      create: data,
      update: data,
    });
  }

  private async runRetentionForEntity(policy: {
    id: string;
    entityType: string;
    retentionDays: number;
    purgeAfterDays: number | null;
  }) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.retentionDays);

    const job = await this.prisma.dataRetentionJob.create({
      data: {
        policyId: policy.id,
        entityType: policy.entityType,
        action: 'ARCHIVE_OR_PURGE',
        status: 'RUNNING',
      } as any,
    });

    try {
      let recordsAffected = 0;
      const entityMap: Record<string, () => Promise<number>> = {
        auth_attempts: async () => {
          const result = await this.prisma.authAttempt.deleteMany({
            where: { createdAt: { lt: cutoff }, success: false },
          });
          return result.count;
        },
        auth_sessions: async () => {
          const result = await this.prisma.authSession.deleteMany({
            where: { createdAt: { lt: cutoff }, revokedAt: { not: null } },
          });
          return result.count;
        },
        token_blacklist: async () => {
          const result = await this.prisma.tokenBlacklist.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          });
          return result.count;
        },
        audit_logs: async () => {
          if (policy.purgeAfterDays) {
            const purgeCutoff = new Date();
            purgeCutoff.setDate(purgeCutoff.getDate() - policy.purgeAfterDays);
            const result = await this.prisma.auditLog.deleteMany({
              where: {
                createdAt: { lt: purgeCutoff },
                dataClassification: { notIn: ['SENSITIVE_PERSONAL', 'HEALTH'] },
              },
            });
            return result.count;
          }
          return 0;
        },
        notification_deliveries: async () => {
          const result = await this.prisma.notificationDelivery.deleteMany({
            where: { createdAt: { lt: cutoff } },
          });
          return result.count;
        },
        device_status_logs: async () => {
          const result = await this.prisma.deviceStatusLog.deleteMany({
            where: { createdAt: { lt: cutoff } },
          });
          return result.count;
        },
      };

      const handler = entityMap[policy.entityType];
      if (handler) {
        recordsAffected = await handler();
      }

      await this.prisma.dataRetentionJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          recordsAffected,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Retention job completed for ${policy.entityType}: ${recordsAffected} records affected`,
      );
    } catch (error) {
      await this.prisma.dataRetentionJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: (error as Error).message,
          completedAt: new Date(),
        },
      });
      this.logger.error(
        `Retention job failed for ${policy.entityType}: ${(error as Error).message}`,
      );
    }
  }

  async runAllRetention() {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: { isActive: true },
    });
    for (const policy of policies) {
      await this.runRetentionForEntity(policy);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledRetention() {
    this.logger.log('Starting scheduled data retention');
    await this.runAllRetention();
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async scheduledConsentExpiry() {
    this.logger.log('Checking for expired consents');
    const result = await this.prisma.consentRecord.updateMany({
      where: {
        status: 'GIVEN' as any,
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' as any },
    });
    if (result.count > 0) {
      this.logger.log(`${result.count} expired consents updated`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledDsrExpiry() {
    this.logger.log('Checking for expired data subject requests');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.dataSubjectRequest.updateMany({
      where: {
        status: 'PENDING' as any,
        requestedAt: { lte: thirtyDaysAgo },
      },
      data: { status: 'EXPIRED' as any },
    });
    if (result.count > 0) {
      this.logger.log(`${result.count} expired data subject requests updated`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledInactiveSessionCleanup() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.authSession.deleteMany({
      where: {
        revokedAt: { not: null },
        createdAt: { lte: thirtyDaysAgo },
      },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} old revoked sessions`);
    }
  }

  async getJobHistory(limit = 50) {
    return this.prisma.dataRetentionJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { policy: true },
    });
  }
}
