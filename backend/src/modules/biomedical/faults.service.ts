import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class FaultsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    status?: string;
    severity?: string;
    assetId?: string;
  }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.assetId) where.deviceId = filters.assetId;

    const [data, total] = await Promise.all([
      this.prisma.deviceIncident.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
          device: { select: { id: true, name: true, code: true } },
        },
        orderBy: { reportedAt: 'desc' },
        take: 50,
      }),
      this.prisma.deviceIncident.count({ where }),
    ]);

    return { data, total };
  }

  async getStats() {
    const maintenanceAgg = await this.prisma.maintenanceRecord.aggregate({
      _avg: { mtbf: true, mttr: true },
      where: { type: { in: ['corrective', 'breakdown'] } },
    });

    const faultTypeCounts = await this.prisma.deviceIncident.groupBy({
      by: ['issueType'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const severityCounts = await this.prisma.deviceIncident.groupBy({
      by: ['severity'],
      _count: { id: true },
    });

    const statusCounts = await this.prisma.deviceIncident.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    return {
      mtbf: maintenanceAgg._avg.mtbf || 0,
      mttr: maintenanceAgg._avg.mttr || 0,
      topFaultTypes: faultTypeCounts.map((f) => ({
        issueType: f.issueType,
        count: f._count.id,
      })),
      bySeverity: severityCounts.reduce(
        (acc, s) => ({ ...acc, [s.severity]: s._count.id }),
        {},
      ),
      byStatus: statusCounts.reduce(
        (acc, s) => ({ ...acc, [s.status]: s._count.id }),
        {},
      ),
    };
  }
}
