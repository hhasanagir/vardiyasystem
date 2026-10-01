import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class BreachNotificationService {
  private readonly logger = new Logger(BreachNotificationService.name);

  constructor(private prisma: PrismaService) {}

  async recordBreach(data: {
    detectedBy: string;
    breachType: string;
    severity: string;
    description: string;
    affectedEntities: string[];
    affectedRecords?: number;
  }) {
    return this.prisma.dataBreachRecord.create({
      data: {
        detectedBy: data.detectedBy,
        breachType: data.breachType,
        severity: data.severity,
        description: data.description,
        affectedEntities: data.affectedEntities,
        affectedRecords: data.affectedRecords || 0,
      } as any,
    });
  }

  async containBreach(breachId: string, containmentDescription: string) {
    return this.prisma.dataBreachRecord.update({
      where: { id: breachId },
      data: {
        containmentAt: new Date(),
        remediation: containmentDescription,
        status: 'CONTAINED',
      },
    });
  }

  async notifyAuthority(
    breachId: string,
    data: {
      notifiedTo: string;
      method: string;
      content: string;
    },
  ) {
    const breach = await this.prisma.dataBreachRecord.findUnique({
      where: { id: breachId },
    });
    if (!breach) throw new NotFoundException('Breach record not found');

    const notification = await this.prisma.breachNotification.create({
      data: {
        breachId,
        notifiedTo: data.notifiedTo,
        notificationType: 'AUTHORITY',
        method: data.method,
        content: data.content,
      } as any,
    });

    await this.prisma.dataBreachRecord.update({
      where: { id: breachId },
      data: {
        notifiedAuthorityAt: new Date(),
        status:
          breach.status === 'CONTAINED' ? 'NOTIFIED_AUTHORITY' : breach.status,
      },
    });

    return notification;
  }

  async notifySubjects(
    breachId: string,
    data: {
      notifiedTo: string;
      method: string;
      content: string;
    },
  ) {
    const notification = await this.prisma.breachNotification.create({
      data: {
        breachId,
        notifiedTo: data.notifiedTo,
        notificationType: 'SUBJECT',
        method: data.method,
        content: data.content,
      } as any,
    });

    await this.prisma.dataBreachRecord.update({
      where: { id: breachId },
      data: { notifiedSubjectsAt: new Date(), status: 'NOTIFIED_SUBJECTS' },
    });

    return notification;
  }

  async resolveBreach(
    breachId: string,
    rootCause: string,
    remediation: string,
  ) {
    return this.prisma.dataBreachRecord.update({
      where: { id: breachId },
      data: {
        rootCause,
        remediation,
        status: 'RESOLVED',
        closedAt: new Date(),
      },
    });
  }

  async getBreachRecords(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.dataBreachRecord.findMany({
      where,
      include: { notifications: true },
      orderBy: { detectedAt: 'desc' },
    });
  }

  async getBreachStatistics() {
    const records = await this.prisma.dataBreachRecord.findMany();

    return {
      total: records.length,
      openCount: records.filter((r) => r.status === 'OPEN').length,
      containedCount: records.filter((r) => r.status === 'CONTAINED').length,
      resolvedCount: records.filter((r) => r.status === 'RESOLVED').length,
      bySeverity: this.groupBy(records, 'severity'),
      byType: this.groupBy(records, 'breachType'),
      avgTimeToContain: this.calcAvgHours(
        records,
        'detectedAt',
        'containmentAt',
      ),
      avgTimeToResolve: this.calcAvgHours(records, 'detectedAt', 'closedAt'),
    };
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of items) {
      const val = item[key];
      result[val] = (result[val] || 0) + 1;
    }
    return result;
  }

  private calcAvgHours(
    items: any[],
    startField: string,
    endField: string,
  ): number | null {
    const withEnd = items.filter((i) => i[endField]);
    if (withEnd.length === 0) return null;
    const totalHours = withEnd.reduce((sum, item) => {
      return (
        sum +
        (new Date(item[endField]).getTime() -
          new Date(item[startField]).getTime()) /
          (1000 * 60 * 60)
      );
    }, 0);
    return Math.round((totalHours / withEnd.length) * 10) / 10;
  }
}
