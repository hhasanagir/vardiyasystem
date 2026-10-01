import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DeviceStatusService {
  constructor(private prisma: PrismaService) {}

  async updateStatus(
    userId: string,
    deviceId: string,
    status: string,
    notes?: string,
  ) {
    return this.prisma.deviceStatusLog.create({
      data: { userId, deviceId, status, notes },
    });
  }

  async getCurrentStatus(deviceId: string) {
    const log = await this.prisma.deviceStatusLog.findFirst({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
    });
    return log || null;
  }

  async getDeviceStatuses(deviceIds: string[]) {
    if (deviceIds.length === 0) return {};
    const logs = await this.prisma.deviceStatusLog.findMany({
      where: { deviceId: { in: deviceIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['deviceId'],
      select: { deviceId: true, status: true, notes: true, createdAt: true },
    });
    const logMap = new Map(logs.map((l) => [l.deviceId, l]));
    return deviceIds.reduce(
      (acc, id) => {
        acc[id] = logMap.get(id) || null;
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  async getStatusHistory(deviceId: string, limit = 20) {
    return this.prisma.deviceStatusLog.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getMyUnitDevices(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { unitId: true },
    });
    if (!user?.unitId) {
      throw new NotFoundException('User has no unit assigned');
    }
    const devices = await this.prisma.device.findMany({
      where: { unitId: user.unitId, isActive: true },
      select: { id: true, name: true, code: true, unitId: true },
    });
    const statuses = await this.getDeviceStatuses(devices.map((d) => d.id));
    return devices.map((d) => ({
      ...d,
      latestStatus: statuses[d.id],
    }));
  }
}
