import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ServiceHistoryService {
  constructor(private prisma: PrismaService) {}

  async getByAsset(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetNumber: true, serialNumber: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    const [maintenanceRecords, calibrationRecords, incidents] =
      await Promise.all([
        this.prisma.maintenanceRecord.findMany({
          where: { assetId },
          include: { parts: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.calibrationRecord.findMany({
          where: { assetId },
          include: { performedBy: { select: { id: true, name: true } } },
          orderBy: { scheduledDate: 'desc' },
        }),
        this.prisma.deviceIncident.findMany({
          where: { deviceId: assetId },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { reportedAt: 'desc' },
        }),
      ]);

    const totalMaintenanceCost = maintenanceRecords.reduce(
      (s, r) => s + (Number(r.cost) || 0),
      0,
    );
    const totalCalibrationCost = calibrationRecords.reduce(
      (s, r) => s + (Number(r.cost) || 0),
      0,
    );

    return {
      asset,
      maintenanceRecords,
      calibrationRecords,
      incidents,
      summary: {
        totalMaintenance: maintenanceRecords.length,
        totalCalibrations: calibrationRecords.length,
        totalIncidents: incidents.length,
        totalMaintenanceCost,
        totalCalibrationCost,
      },
    };
  }
}
