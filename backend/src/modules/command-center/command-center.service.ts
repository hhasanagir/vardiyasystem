import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class CommandCenterService {
  constructor(private prisma: PrismaService) {}

  async getSnapshot(organizationId: string) {
    const today = new Date().toISOString().split('T')[0];

    const [
      personnelList,
      devices,
      statusLogs,
      openIncidents,
      criticalAlerts,
      pendingSwaps,
      attendanceRecords,
      assignments,
      deviceModes,
    ] = await Promise.all([
      this.prisma.personnel.findMany({
        where: { unit: { organizationId }, isActive: true },
        select: { id: true, name: true, unitId: true },
      }),
      this.prisma.device.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, code: true, unitId: true, mode: true },
      }),
      this.prisma.deviceStatusLog.findMany({
        where: { device: { organizationId } },
        orderBy: { createdAt: 'desc' },
        distinct: ['deviceId'],
        select: { deviceId: true, status: true },
      }),
      this.prisma.deviceIncident.findMany({
        where: {
          unit: { organizationId },
          status: { in: ['open', 'in_progress'] },
        },
        select: { id: true, severity: true, issueType: true, status: true },
      }),
      this.prisma.deviceIncident.findMany({
        where: {
          unit: { organizationId },
          severity: 'critical',
          status: 'open',
        },
        select: {
          id: true,
          issueType: true,
          description: true,
          reportedAt: true,
        },
      }),
      this.prisma.swapRequest.findMany({
        where: { status: 'PENDING' },
        select: { id: true, requesterId: true, createdAt: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { date: today, user: { organizationId } },
        select: {
          id: true,
          userId: true,
          status: true,
          clockIn: true,
          clockOut: true,
        },
      }),
      this.prisma.assignment.findMany({
        where: {
          date: today,
          schedule: {
            unit: { organizationId },
            status: { in: ['published', 'approved', 'under_review'] },
          },
        },
        select: {
          id: true,
          deviceId: true,
          personnelId: true,
          shiftType: true,
        },
      }),
      this.prisma.device.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, mode: true },
      }),
    ]);

    // 1 — Active staff: personnel with at least one assignment today
    const assignedPersonnelIds = new Set(assignments.map((a) => a.personnelId));
    const activeStaff = personnelList.filter((p) =>
      assignedPersonnelIds.has(p.id),
    );
    const totalStaff = personnelList.length;

    // 2 — Devices online/offline
    const statusMap = new Map(statusLogs.map((l) => [l.deviceId, l.status]));
    const onlineDevices = devices.filter(
      (d) => statusMap.get(d.id) === 'active' || !statusMap.has(d.id),
    ).length;
    const offlineDevices = devices.filter((d) => {
      const s = statusMap.get(d.id);
      return s && s !== 'active';
    }).length;
    const totalDevices = devices.length;

    // 3 — Open incidents
    const openIncidentCount = openIncidents.length;

    // 4 — Critical alerts
    const criticalAlertCount = criticalAlerts.length;

    // 5 — Missing staffing: device slots minus assigned count
    const modeMap = new Map(deviceModes.map((d) => [d.id, d.mode]));
    const assignedPerDevice = new Map<string, number>();
    for (const a of assignments) {
      if (a.deviceId) {
        assignedPerDevice.set(
          a.deviceId,
          (assignedPerDevice.get(a.deviceId) || 0) + 1,
        );
      }
    }
    let missingStaffing = 0;
    for (const d of devices) {
      const required = modeMap.get(d.id) === 'polyclinic' ? 1 : 2;
      const filled = assignedPerDevice.get(d.id) || 0;
      if (filled < required) missingStaffing += required - filled;
    }

    // 6 — Swap requests pending
    const pendingSwapCount = pendingSwaps.length;

    // 7 — Attendance status
    const clockedIn = attendanceRecords.filter(
      (r) => r.status === 'clocked_in' || r.clockIn,
    ).length;
    const clockedOut = attendanceRecords.filter(
      (r) => r.status === 'clocked_out' || r.clockOut,
    ).length;
    const notClocked = totalStaff - clockedIn - clockedOut;

    // 8 — Shift coverage percentage
    let totalSlots = 0;
    let filledSlots = 0;
    for (const d of devices) {
      const required = modeMap.get(d.id) === 'polyclinic' ? 1 : 2;
      totalSlots += required;
      const filled = assignedPerDevice.get(d.id) || 0;
      filledSlots += Math.min(filled, required);
    }
    const coveragePercent =
      totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    return {
      timestamp: new Date().toISOString(),
      organizationId,
      activeStaff: { count: activeStaff.length, total: totalStaff },
      devices: {
        online: onlineDevices,
        offline: offlineDevices,
        total: totalDevices,
      },
      openIncidents: { count: openIncidentCount },
      criticalAlerts: { count: criticalAlertCount, items: criticalAlerts },
      missingStaffing: { count: missingStaffing },
      pendingSwapRequests: { count: pendingSwapCount },
      attendance: { clockedIn, clockedOut, notClocked, total: totalStaff },
      coveragePercent,
    };
  }
}
