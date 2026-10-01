import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class BiomedicalKpiService {
  constructor(private prisma: PrismaService) {}

  async getKpis(filters?: {
    hospitalId?: string;
    departmentId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();

    const baseWhere: any = {};
    if (filters?.hospitalId) baseWhere.hospitalId = filters.hospitalId;
    if (filters?.departmentId) baseWhere.departmentId = filters.departmentId;

    const dateWhere: any = {
      ...baseWhere,
      createdAt: { gte: startDate, lte: endDate },
    };
    const assetWhere: any = { ...baseWhere, isActive: true };

    const [
      totalAssets,
      activeAssets,
      maintenanceAgg,
      maintenanceRecords,
      calibrationCostAgg,
      calibrations,
      overdueCalibrations,
      maintenanceByType,
      incidentsByMonth,
    ] = await Promise.all([
      this.prisma.enterpriseAsset.count({ where: { ...baseWhere } }),
      this.prisma.enterpriseAsset.count({ where: assetWhere }),
      this.prisma.maintenanceRecord.aggregate({
        _avg: { mtbf: true, mttr: true },
        _sum: { cost: true, downtimeHours: true },
        where: { ...dateWhere },
      }),
      this.prisma.maintenanceRecord.count({ where: dateWhere }),
      this.prisma.calibrationRecord.aggregate({
        _sum: { cost: true },
        where: { ...dateWhere },
      }),
      this.prisma.calibrationRecord.count({ where: dateWhere }),
      this.prisma.calibrationRecord.count({
        where: {
          ...dateWhere,
          status: { in: ['overdue'] },
        },
      }),
      this.prisma.maintenanceRecord.groupBy({
        by: ['type'],
        _count: { id: true },
        _sum: { cost: true },
        where: dateWhere,
      }),
      this.prisma.deviceIncident.groupBy({
        by: ['reportedAt'],
        _count: { id: true },
        where: { ...dateWhere },
      }),
    ]);

    const totalAvailable = activeAssets * 24 * 30;
    const downtimeHours = Number(maintenanceAgg._sum.downtimeHours) || 0;
    const uptimeRate =
      totalAvailable > 0
        ? Math.round(((totalAvailable - downtimeHours) / totalAvailable) * 100)
        : 100;

    const totalMaintenanceCost = Number(maintenanceAgg._sum.cost) || 0;
    const totalCalibrationCost = Number(calibrationCostAgg._sum.cost) || 0;

    const monthMap = new Map<string, number>();
    for (const inc of incidentsByMonth) {
      const month = inc.reportedAt.toISOString().slice(0, 7);
      monthMap.set(month, (monthMap.get(month) || 0) + inc._count.id);
    }

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      totalAssets,
      activeAssets,
      uptimeRate,
      downtimeHours,
      totalMaintenanceCost,
      totalCalibrationCost,
      totalCost: totalMaintenanceCost + totalCalibrationCost,
      avgMtbf: maintenanceAgg._avg.mtbf || 0,
      avgMttr: maintenanceAgg._avg.mttr || 0,
      maintenanceCount: maintenanceRecords,
      calibrationCount: calibrations,
      overdueCalibrations,
      maintenanceByType: maintenanceByType.map((m) => ({
        type: m.type,
        count: m._count.id,
        cost: Number(m._sum.cost) || 0,
      })),
      faultsByMonth: Array.from(monthMap.entries()).map(([month, count]) => ({
        month,
        count,
      })),
    };
  }
}
