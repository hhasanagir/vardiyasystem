import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleCoverageService } from '../schedules/services/schedule-coverage.service';
import { toCoverageAssignmentInput, toCoverageAssignmentInputs } from '../schedules/domain/coverage/coverage-input-mapper';
import { CoverageAssignmentInput, CoverageLine } from '../schedules/domain/coverage/coverage-types';

export interface SupervisorCenterScope {
  organizationId: string;
  unitId: string | null;
}

@Injectable()
export class SupervisorCenterService {
  constructor(
    private prisma: PrismaService,
    private coverageService: ScheduleCoverageService,
  ) {}

  async getDashboard(scope: SupervisorCenterScope, date?: string) {
    const { organizationId, unitId } = scope;
    const today = date || new Date().toISOString().split('T')[0];

    // Unit confinement (saha sorumlusu): only unitId is applied; otherwise org.
    const unitIncidentScope = unitId ? { unitId } : { unit: { organizationId } };

    const [
      personnelList,
      devices,
      statusLogs,
      openIncidents,
      todayIncidents,
      criticalAlerts,
      pendingSwaps,
      attendanceRecords,
      assignments,
      maintenancePending,
      lowStockItems,
      calibrationDue,
      warrantyExpiring,
      recentNotifications,
      stockAlerts,
    ] = await Promise.all([
      this.prisma.personnel.findMany({
        where: { unit: { organizationId }, isActive: true, ...(unitId ? { unitId } : {}) },
        select: { id: true, name: true, unitId: true },
      }),
      this.prisma.device.findMany({
        where: { organizationId, isActive: true, ...(unitId ? { unitId } : {}) },
        select: { id: true, name: true, code: true, unitId: true, mode: true },
      }),
      this.prisma.deviceStatusLog.findMany({
        where: { device: { organizationId, ...(unitId ? { unitId } : {}) } },
        orderBy: { createdAt: 'desc' },
        distinct: ['deviceId'],
        select: { deviceId: true, status: true },
      }),
      this.prisma.deviceIncident.findMany({
        where: { ...unitIncidentScope, status: { in: ['open', 'in_progress'] } },
        select: { id: true, severity: true, issueType: true, status: true },
      }),
      this.prisma.deviceIncident.count({
        where: {
          ...unitIncidentScope,
          reportedAt: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${today}T23:59:59.999Z`),
          },
        },
      }),
      this.prisma.deviceIncident.findMany({
        where: { ...unitIncidentScope, severity: 'critical', status: 'open' },
        select: { id: true, issueType: true, description: true, reportedAt: true },
      }),
      this.prisma.swapRequest.findMany({
        where: {
          status: 'PENDING',
          ...(unitId
            ? { fromAssignment: { schedule: { unitId } } }
            : { fromAssignment: { schedule: { organizationId } } }),
        },
        select: { id: true, requesterId: true, createdAt: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { date: today, user: { organizationId } },
        select: { id: true, userId: true, status: true, clockIn: true, clockOut: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          date: today,
          ...(unitId
            ? { schedule: { unitId, status: { in: ['published', 'approved', 'under_review'] } } }
            : { schedule: { unit: { organizationId }, status: { in: ['published', 'approved', 'under_review'] } } }),
        },
        select: { id: true, deviceId: true, personnelId: true, shiftType: true, date: true, personnelType: true },
      }),
      // maintenance records are bound to assets -> organization / unit
      this.prisma.maintenanceRecord.count({
        where: {
          status: { in: ['open', 'assigned', 'in_progress'] },
          ...(unitId
            ? { asset: { unitId } }
            : { asset: { organizationId } }),
        },
      }),
      this.prisma.consumableStock.findMany({
        where: {
          currentStock: { lte: this.prisma.consumableStock.fields.minimumStock },
        },
        include: {
          catalog: { select: { id: true, name: true, unitOfMeasure: true } },
          warehouse: { select: { id: true, name: true } },
        },
        take: 20,
      }),
      this.prisma.calibrationRecord.findMany({
        where: {
          status: { in: ['scheduled', 'overdue'] },
          OR: [
            { nextCalibrationDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
            { scheduledDate: { lte: new Date() } },
          ],
          ...(unitId
            ? { asset: { unitId } }
            : { asset: { organizationId } }),
        },
        include: {
          asset: { select: { id: true, name: true, assetNumber: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 10,
      }),
      this.prisma.enterpriseAsset.findMany({
        where: {
          warrantyEnd: {
            gte: new Date(),
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
          isActive: true,
          ...(unitId ? { unitId } : { organizationId }),
        },
        select: { id: true, name: true, assetNumber: true, warrantyEnd: true },
        take: 20,
      }),
      this.prisma.notification.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: { status: { not: { equals: 'FAILED' } }, organizationId },
        include: {
          sender: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockAlert.findMany({
        where: { isResolved: false },
        include: {
          catalog: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const assignedPersonnelIds = new Set(assignments.map(a => a.personnelId));
    const activeStaff = personnelList.filter(p => assignedPersonnelIds.has(p.id));

    const statusMap = new Map(statusLogs.map(l => [l.deviceId, l.status]));
    const onlineDevices = devices.filter(d => statusMap.get(d.id) === 'active' || !statusMap.has(d.id)).length;
    const offlineDevices = devices.filter(d => {
      const s = statusMap.get(d.id);
      return s && s !== 'active';
    }).length;

    const clockedIn = attendanceRecords.filter(r => r.status === 'clocked_in' || r.clockIn).length;
    const clockedOut = attendanceRecords.filter(r => r.status === 'clocked_out' || r.clockOut).length;
    const notClocked = personnelList.length - clockedIn - clockedOut;

    const deviceStatusByUnit = this.groupDeviceStatusByUnit(devices, statusMap);
    const personnelByUnit = this.groupPersonnelByUnit(personnelList);

    const todayRoster = await this.prisma.dutyRoster.findMany({
      where: {
        date: today,
        isActive: true,
        ...(unitId ? { unitId } : { organizationId }),
      },
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // P3-11 — same CoverageEngine contract as validation/publish/alerts. The
    // mode-based 1/2 heuristic and "one person per device" roster counting are
    // gone: closed weekends, holidays, off dates and shift overrides are
    // excluded by the engine, not re-invented here.
    const coverageExtras = toCoverageAssignmentInputs([...assignments, ...todayRoster]);
    const coverageUnitIds = unitId
      ? [unitId]
      : Array.from(new Set(devices.map(d => d.unitId).filter((id): id is string => Boolean(id))));
    const dayCoverageLines = await this.coverageLinesForDate(coverageUnitIds, today, coverageExtras);
    const requiredSlots = dayCoverageLines.reduce((sum, l) => sum + l.required, 0);
    const assignedSlots = dayCoverageLines.reduce((sum, l) => sum + l.assigned, 0);
    const missingStaffing = dayCoverageLines.reduce((sum, l) => sum + l.shortfall, 0);
    const coveragePercent = requiredSlots > 0
      ? Math.round((assignedSlots / requiredSlots) * 100)
      : 100;

    const recentIncidents = await this.prisma.deviceIncident.findMany({
      take: 10,
      orderBy: { reportedAt: 'desc' },
      where: { ...unitIncidentScope, status: { not: { equals: 'closed' } } },
      include: {
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return {
      kpis: {
        totalPersonnel: personnelList.length,
        activeToday: activeStaff.length,
        devicesOnline: onlineDevices,
        totalDevices: devices.length,
        shiftCoverage: coveragePercent,
        missingStaffing,
        requiredSlots,
        incidentsToday: todayIncidents,
        pendingApprovals: maintenancePending + pendingSwaps.length,
      },
      deviceStatusByUnit,
      personnelByUnit,
      todayRoster: todayRoster.map(r => ({
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
      recentIncidents: recentIncidents.map(i => ({
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
      recentAlerts: recentNotifications.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        priority: n.priority,
        senderName: n.sender?.name || 'System',
        createdAt: n.createdAt,
      })),
      lowStockAlerts: lowStockItems.map(s => ({
        itemId: s.id,
        itemName: s.catalog?.name || 'Unknown',
        unitName: s.warehouse?.name || 'Unknown',
        currentStock: s.currentStock,
        minRequired: s.minimumStock,
        unit: s.catalog?.unitOfMeasure || 'piece',
        lastUpdated: s.updatedAt,
      })),
      calibrationDue: calibrationDue.map(c => ({
        id: c.id,
        calibrationNumber: c.calibrationNumber,
        assetName: c.asset?.name || 'Unknown',
        assetNumber: c.asset?.assetNumber || '',
        scheduledDate: c.scheduledDate,
        status: c.status,
      })),
      warrantyExpiring: warrantyExpiring.map(a => ({
        id: a.id,
        name: a.name,
        assetNumber: a.assetNumber,
        warrantyEnd: a.warrantyEnd,
      })),
      stockAlerts: stockAlerts.map(a => ({
        id: a.id,
        itemName: a.catalog?.name || 'Unknown',
        message: a.message,
        severity: a.severity,
        createdAt: a.createdAt,
      })),
    };
  }

  async getShiftCoverage(scope: SupervisorCenterScope, date?: string) {
    const { organizationId, unitId } = scope;
    const today = date || new Date().toISOString().split('T')[0];

    const [devices, rosters] = await Promise.all([
      this.prisma.device.findMany({
        where: { organizationId, isActive: true, ...(unitId ? { unitId } : {}) },
        select: { id: true, name: true, unitId: true, mode: true, unit: { select: { id: true, name: true } } },
      }),
      this.prisma.dutyRoster.findMany({
        where: { date: today, organizationId, isActive: true, ...(unitId ? { unitId } : {}) },
        include: {
          personnel: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
      }),
    ]);

    const unitIds = unitId
      ? [unitId]
      : Array.from(new Set(devices.map(d => d.unitId).filter((id): id is string => Boolean(id))));
    const dayLines = await this.coverageLinesForDate(
      unitIds,
      today,
      toCoverageAssignmentInputs(rosters),
    );

    // One device-level roll-up from the authoritative slot lines. Devices with
    // no in-scope slot (weekend/holiday/off/override) keep 0/0 => 100% and
    // produce NO missing-staff alarm.
    const byDevice = new Map<string, CoverageLine>();
    for (const line of dayLines) {
      const existing = byDevice.get(line.deviceId);
      if (!existing) {
        byDevice.set(line.deviceId, { ...line });
        continue;
      }
      existing.required += line.required;
      existing.assigned += line.assigned;
      existing.shortfall += line.shortfall;
    }

    const coverage = devices.map(d => {
      const line = byDevice.get(d.id);
      const required = line?.required ?? 0;
      const filled = line?.assigned ?? 0;
      return {
        deviceId: d.id,
        deviceName: d.name,
        unitId: d.unitId,
        unitName: d.unit?.name || 'Unknown',
        required,
        filled,
        coveragePercent: required > 0 ? Math.round((filled / required) * 100) : 100,
        missingCount: Math.max(0, line?.shortfall ?? 0),
      };
    });

    const totalSlots = coverage.reduce((s, c) => s + c.required, 0);
    const filledSlots = coverage.reduce((s, c) => s + c.filled, 0);

    return {
      date: today,
      totalDevices: devices.length,
      totalSlots,
      filledSlots,
      overallCoverage: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100,
      coverage,
    };
  }

  /**
   * P3-11 — evaluate the same CoverageEngine for the requested units on one
   * date. `extraAssignments` carries authoritative roster/schedule rows that
   * are not (yet) persisted as a schedule snapshot.
   */
  private async coverageLinesForDate(
    unitIds: string[],
    date: string,
    extraAssignments: CoverageAssignmentInput[],
  ): Promise<CoverageLine[]> {
    if (unitIds.length === 0) return [];
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));

    const results = await Promise.all(
      unitIds.map(unitId =>
        this.coverageService.evaluateScheduleCoverage(
          { unitId, year, month },
          extraAssignments,
        ),
      ),
    );

    return results.flatMap(result => result.lines.filter(line => line.date === date));
  }

  private groupDeviceStatusByUnit(devices: any[], statusMap: Map<string, string>) {
    const map = new Map<string, { unitId: string; unitName: string; active: number; maintenance: number; fault: number; outOfService: number; total: number }>();
    for (const d of devices) {
      const unitId = d.unit?.id || 'unknown';
      const unitName = d.unit?.name || 'Unknown';
      if (!map.has(unitId)) {
        map.set(unitId, { unitId, unitName, active: 0, maintenance: 0, fault: 0, outOfService: 0, total: 0 });
      }
      const entry = map.get(unitId)!;
      entry.total++;
      const status = statusMap.get(d.id) || 'active';
      if (status === 'active') entry.active++;
      else if (status === 'maintenance') entry.maintenance++;
      else if (status === 'fault') entry.fault++;
      else entry.outOfService++;
    }
    return Array.from(map.values());
  }

  private groupPersonnelByUnit(personnel: any[]) {
    const map = new Map<string, { unitId: string; unitName: string; total: number; roles: Record<string, number> }>();
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
