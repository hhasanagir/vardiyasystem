import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SupervisorService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(date?: string) {
    const today = date || new Date().toISOString().split('T')[0];

    const [
      totalPersonnel,
      totalDevices,
      incidentsToday,
      recentAlertNotifications,
      devices,
      personnel,
      todayRoster,
      recentIncidents,
    ] = await Promise.all([
      this.prisma.personnel.count({ where: { isActive: true } }),
      this.prisma.device.count({ where: { isActive: true } }),
      this.prisma.deviceIncident.count({
        where: {
          reportedAt: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${today}T23:59:59.999Z`),
          },
        },
      }),
      this.prisma.notification.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, name: true } },
        },
        where: { status: { not: { equals: 'FAILED' } } },
      }),
      this.prisma.device.findMany({
        where: { isActive: true },
        include: {
          unit: { select: { id: true, name: true } },
          deviceStatusLogs: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { status: true },
          },
        },
      }),
      this.prisma.personnel.findMany({
        where: { isActive: true },
        include: {
          unit: { select: { id: true, name: true } },
        },
      }),
      this.prisma.dutyRoster.findMany({
        where: { date: today, isActive: true },
        include: {
          personnel: { select: { id: true, name: true, role: true } },
          unit: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.deviceIncident.findMany({
        take: 10,
        orderBy: { reportedAt: 'desc' },
        where: { status: { not: { equals: 'closed' } } },
        include: {
          unit: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const activeNow = todayRoster.length;
    const dutyRosterUniquePersonnel = new Set(
      todayRoster.map((r) => r.personnel.id),
    ).size;

    const deviceStatusByUnit = this.groupDeviceStatusByUnit(devices);
    const personnelByUnit = this.groupPersonnelByUnit(personnel);

    return {
      kpis: {
        totalPersonnel,
        activeToday: dutyRosterUniquePersonnel,
        devicesOnline: devices.filter((d) => {
          const lastLog = d.deviceStatusLogs[0];
          return !lastLog || lastLog.status === 'active';
        }).length,
        totalDevices,
        shiftCoverage:
          activeNow > 0
            ? Math.round((dutyRosterUniquePersonnel / totalPersonnel) * 100)
            : 0,
        incidentsToday,
        pendingApprovals: 0,
      },
      deviceStatusByUnit,
      personnelByUnit,
      todayRoster: todayRoster.map((r) => ({
        id: r.id,
        personnelName: r.personnel.name,
        personnelRole: r.personnel.role,
        unitName: r.unit?.name || '',
        deviceName: r.device?.name || null,
        shiftType: r.shiftType,
        role: r.role,
        startTime: r.startTime,
        endTime: r.endTime,
        notes: r.notes,
      })),
      recentIncidents: recentIncidents.map((i) => ({
        id: i.id,
        issueType: i.issueType,
        severity: i.severity,
        description: i.description,
        status: i.status,
        unitName: i.unit.name,
        deviceName: i.device?.name || null,
        reporterName: i.user.name,
        reportedAt: i.reportedAt,
      })),
      recentAlerts: recentAlertNotifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        priority: n.priority,
        senderName: n.sender?.name || 'System',
        createdAt: n.createdAt,
      })),
    };
  }

  private groupDeviceStatusByUnit(devices: any[]) {
    const map = new Map<
      string,
      {
        unitId: string;
        unitName: string;
        active: number;
        maintenance: number;
        fault: number;
        outOfService: number;
        total: number;
      }
    >();
    for (const d of devices) {
      const unitId = d.unit?.id || 'unknown';
      const unitName = d.unit?.name || 'Unknown';
      if (!map.has(unitId)) {
        map.set(unitId, {
          unitId,
          unitName,
          active: 0,
          maintenance: 0,
          fault: 0,
          outOfService: 0,
          total: 0,
        });
      }
      const entry = map.get(unitId)!;
      entry.total++;
      const lastLog = d.deviceStatusLogs[0];
      const status = lastLog?.status || 'active';
      if (status === 'active') entry.active++;
      else if (status === 'maintenance') entry.maintenance++;
      else if (status === 'fault') entry.fault++;
      else entry.outOfService++;
    }
    return Array.from(map.values());
  }

  private groupPersonnelByUnit(personnel: any[]) {
    const map = new Map<
      string,
      {
        unitId: string;
        unitName: string;
        total: number;
        roles: Record<string, number>;
      }
    >();
    for (const p of personnel) {
      const unitId = p.unit?.id || 'unknown';
      const unitName = p.unit?.name || 'Unknown';
      if (!map.has(unitId)) {
        map.set(unitId, { unitId, unitName, total: 0, roles: {} });
      }
      const entry = map.get(unitId)!;
      entry.total++;
      const role = p.role || 'unknown';
      entry.roles[role] = (entry.roles[role] || 0) + 1;
    }
    return Array.from(map.values());
  }
}
