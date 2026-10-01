import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(
    organizationId: string,
    month?: number,
    year?: number,
    unitType?: string,
  ) {
    year = year || new Date().getFullYear();
    month = month || new Date().getMonth() + 1;

    const unitFilter: any = {};
    if (organizationId) unitFilter.organizationId = organizationId;
    if (unitType) unitFilter.type = unitType;

    const units = await this.prisma.unit.findMany({
      take: 100,
      where: unitFilter,
      select: {
        id: true,
        name: true,
        type: true,
        _count: {
          select: {
            personnel: { where: { isActive: true } },
            devices: { where: { isActive: true } },
          },
        },
        schedules: {
          where: { month, year },
          select: {
            id: true,
            status: true,
            assignments: {
              select: {
                id: true,
                shiftType: true,
                personnel: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    let totalPersonnel = 0;
    let totalShifts = 0;
    let totalNightShifts = 0;
    let totalSlots = 0;
    let maxUnitShifts = 0;
    let busiestUnit = '';
    const nightByUnit: Array<{
      unit: string;
      night: number;
      day: number;
      evening: number;
    }> = [];
    const unitOccupancy: Array<{
      unit: string;
      rate: number;
      assigned: number;
      total: number;
    }> = [];

    for (const unit of units) {
      const personnelCount = unit._count.personnel;
      const deviceCount = unit._count.devices;
      totalPersonnel += personnelCount;

      const allAssignments = unit.schedules.flatMap((s) => s.assignments);
      const shifts = allAssignments.length;
      totalShifts += shifts;

      if (shifts > maxUnitShifts) {
        maxUnitShifts = shifts;
        busiestUnit = unit.name;
      }

      const nightShifts = allAssignments.filter(
        (a) => a.shiftType === 'night',
      ).length;
      totalNightShifts += nightShifts;

      const dayShifts = allAssignments.filter(
        (a) => a.shiftType === 'day',
      ).length;
      const eveningShifts = allAssignments.filter(
        (a) => a.shiftType === 'evening',
      ).length;

      nightByUnit.push({
        unit: unit.name,
        night: nightShifts,
        day: dayShifts,
        evening: eveningShifts,
      });

      const totalDeviceSlots = daysInMonth * deviceCount * 2;
      totalSlots += totalDeviceSlots;
      unitOccupancy.push({
        unit: unit.name,
        rate:
          totalDeviceSlots > 0
            ? Math.round((shifts / totalDeviceSlots) * 100)
            : 0,
        assigned: shifts,
        total: totalDeviceSlots,
      });
    }

    const missingShifts = Math.max(0, totalSlots - totalShifts);

    const overtimeHours = await this.computeOvertimeTotal(
      organizationId,
      month,
      year,
    );

    return {
      period: { month, year },
      totalPersonnel,
      totalShifts,
      monthlyOvertime: Math.round(overtimeHours),
      nightShiftRatio:
        totalShifts > 0
          ? Math.round((totalNightShifts / totalShifts) * 100)
          : 0,
      missingShifts,
      busiestUnit,
      unitOccupancy,
      nightDistribution: nightByUnit,
      daysInMonth,
    };
  }

  async getWorkload(
    organizationId: string,
    month?: number,
    year?: number,
    unitType?: string,
  ) {
    year = year || new Date().getFullYear();
    month = month || new Date().getMonth() + 1;

    const unitFilter: any = {};
    if (organizationId) unitFilter.organizationId = organizationId;
    if (unitType) unitFilter.type = unitType;

    const units = await this.prisma.unit.findMany({
      where: unitFilter,
      select: { id: true },
    });
    const unitIds = units.map((u) => u.id);

    const personnel = await this.prisma.personnel.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      select: { id: true, name: true, role: true, unitId: true },
    });

    const schedules = await this.prisma.schedule.findMany({
      where: { unitId: { in: unitIds }, month, year },
      select: { id: true, unitId: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    const assignments = await this.prisma.assignment.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: { personnelId: true, shiftType: true, date: true },
    });

    const workloadMap = new Map<
      string,
      { day: number; evening: number; night: number; total: number }
    >();

    for (const p of personnel) {
      workloadMap.set(p.id, { day: 0, evening: 0, night: 0, total: 0 });
    }

    for (const a of assignments) {
      const stats = workloadMap.get(a.personnelId);
      if (stats) {
        stats.total++;
        if (a.shiftType === 'day') stats.day++;
        else if (a.shiftType === 'evening') stats.evening++;
        else if (a.shiftType === 'night') stats.night++;
      }
    }

    const personnelMap = new Map(personnel.map((p) => [p.id, p]));

    const result = Array.from(workloadMap.entries())
      .map(([id, stats]) => {
        const p = personnelMap.get(id);
        const totalHours = stats.total * 8;
        return {
          personnelId: id,
          personnelName: p?.name || id,
          role: p?.role || '',
          totalShifts: stats.total,
          dayShifts: stats.day,
          eveningShifts: stats.evening,
          nightShifts: stats.night,
          totalHours,
        };
      })
      .sort((a, b) => b.totalShifts - a.totalShifts);

    return result;
  }

  async getOvertimeRanking(
    organizationId: string,
    month?: number,
    year?: number,
    unitType?: string,
  ) {
    const workload = await this.getWorkload(
      organizationId,
      month,
      year,
      unitType,
    );
    const basePerDay = 8;

    const withOvertime = workload.map((w) => {
      const standardHours = w.totalShifts * basePerDay;
      const overtimeHours = Math.max(0, w.totalHours - standardHours);
      const overtimePercent =
        standardHours > 0
          ? Math.round((overtimeHours / standardHours) * 100)
          : 0;
      return { ...w, overtimeHours, overtimePercent };
    });

    return withOvertime.sort((a, b) => b.overtimeHours - a.overtimeHours);
  }

  async getDeviceUtilization(
    organizationId: string,
    month?: number,
    year?: number,
    unitType?: string,
  ) {
    year = year || new Date().getFullYear();
    month = month || new Date().getMonth() + 1;

    const unitFilter: any = {};
    if (organizationId) unitFilter.organizationId = organizationId;
    if (unitType) unitFilter.type = unitType;

    const units = await this.prisma.unit.findMany({
      where: unitFilter,
      select: { id: true, name: true, type: true },
    });
    const unitIds = units.map((u) => u.id);

    const devices = await this.prisma.device.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        unitId: true,
        mode: true,
        workDays: true,
      },
    });

    const holidays = await this.prisma.holiday.findMany({
      where: { year },
      select: { date: true },
    });
    const holidayDates = new Set(holidays.map((h) => h.date));

    const schedules = await this.prisma.schedule.findMany({
      where: { unitId: { in: unitIds }, month, year },
      select: { id: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    const assignments = await this.prisma.assignment.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: { deviceId: true },
    });
    const deviceAssignmentCount = new Map<string, number>();
    for (const a of assignments) {
      if (a.deviceId) {
        deviceAssignmentCount.set(
          a.deviceId,
          (deviceAssignmentCount.get(a.deviceId) || 0) + 1,
        );
      }
    }

    const daysInMonth = new Date(year, month, 0).getDate();

    const unitMap = new Map(units.map((u) => [u.id, u]));

    return devices
      .map((d) => {
        const assigned = deviceAssignmentCount.get(d.id) || 0;
        const unitType = unitMap.get(d.unitId)?.type;
        let workDayCount = 0;
        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(year, month - 1, i);
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          const isWorkDay =
            d.workDays.length === 0 || d.workDays.includes(date.getDay());
          const isClosedHoliday =
            unitType === 'onkoloji' && holidayDates.has(dateStr);
          if (isWorkDay && !isClosedHoliday) workDayCount++;
        }

        const maxSlots = workDayCount * (d.mode === 'polyclinic' ? 1 : 2);
        const utilizationRate =
          maxSlots > 0 ? Math.round((assigned / maxSlots) * 100) : 0;

        return {
          deviceId: d.id,
          deviceCode: d.code,
          deviceName: d.name,
          unitName: unitMap.get(d.unitId)?.name || '',
          mode: d.mode,
          totalAssignments: assigned,
          maxSlots,
          utilizationRate,
        };
      })
      .sort((a, b) => b.utilizationRate - a.utilizationRate);
  }

  async getDashboard(organizationId: string, unitId?: string) {
    const { now, todayStr, yesterdayStr, nowTime, year, month } =
      this.istanbulNow();

    const unitFilter: any = {};
    if (organizationId) unitFilter.organizationId = organizationId;
    if (unitId) unitFilter.id = unitId;

    const units = await this.prisma.unit.findMany({
      where: unitFilter,
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        _count: {
          select: {
            personnel: { where: { isActive: true } },
            devices: { where: { isActive: true } },
          },
        },
      },
    });
    const unitIds = units.map((u) => u.id);

    const schedules = await this.prisma.schedule.findMany({
      where: { unitId: { in: unitIds }, month, year },
      select: { id: true, status: true, unitId: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    const [
      activeDevices,
      devices,
      incidents,
      trainings,
      swapRequests,
      assignments,
      holidays,
    ] = await Promise.all([
      this.prisma.device.count({
        where: {
          isActive: true,
          ...(unitIds.length ? { unitId: { in: unitIds } } : {}),
        },
      }),
      this.prisma.device.findMany({
        where: {
          isActive: true,
          ...(unitIds.length ? { unitId: { in: unitIds } } : {}),
        },
        select: { id: true, unitId: true, mode: true, workDays: true },
      }),
      this.prisma.deviceIncident.findMany({
        where: {
          unitId: { in: unitIds },
          status: { in: ['open', 'in_progress'] },
        },
        select: {
          id: true,
          severity: true,
          issueType: true,
          status: true,
          deviceId: true,
          unitId: true,
        },
      }),
      this.prisma.personnelTraining.findMany({
        where: {
          isActive: true,
          expiryDate: { not: null },
        },
        select: { id: true, expiryDate: true, personnelId: true },
      }),
      this.prisma.swapRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.assignment.findMany({
        where: { scheduleId: { in: scheduleIds } },
        select: {
          id: true,
          scheduleId: true,
          date: true,
          shiftType: true,
          startTime: true,
          endTime: true,
          isConfirmed: true,
          unitId: true,
          personnel: { select: { id: true, name: true, role: true } },
          device: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.holiday.findMany({
        select: { id: true, date: true },
      }),
    ]);

    const scheduleStatusMap = new Map(schedules.map((s) => [s.id, s.status]));
    const scheduleUnitMap = new Map(schedules.map((s) => [s.id, s.unitId]));
    const unitMap = new Map(units.map((u) => [u.id, u]));

    const pendingShifts = assignments.filter((a) => !a.isConfirmed).length;

    const isActiveShift = (a: {
      date: string;
      startTime: string;
      endTime: string;
    }) => {
      const overnight = a.startTime > a.endTime;
      if (a.date === todayStr) {
        if (overnight) return a.startTime <= nowTime;
        return a.startTime <= nowTime && a.endTime > nowTime;
      }
      if (a.date === yesterdayStr && overnight) return a.endTime > nowTime;
      return false;
    };
    const onDutyPersonnel = new Set(
      assignments.filter(isActiveShift).map((a) => a.personnel.id),
    ).size;

    const todayAssignments = assignments.filter((a) => a.date === todayStr);
    const todayAssignmentIds = new Set(
      todayAssignments.map((a) => a.personnel.id),
    );

    const incidentsByUnit = new Map<string, typeof incidents>();
    for (const inc of incidents) {
      if (!incidentsByUnit.has(inc.unitId)) incidentsByUnit.set(inc.unitId, []);
      incidentsByUnit.get(inc.unitId)!.push(inc);
    }

    const dayOfWeek = now.getDay();
    const holidaySet = new Set(holidays.map((h) => h.date));
    const isHolidayToday = holidaySet.has(todayStr);
    const deviceSlotsByUnit = new Map<string, number>();
    for (const d of devices) {
      const runsToday =
        d.workDays.length === 0 || d.workDays.includes(dayOfWeek);
      if (!runsToday) continue;
      const unitType = unitMap.get(d.unitId)?.type;
      if (unitType === 'onkoloji' && isHolidayToday) continue;
      const slots = d.mode === 'polyclinic' ? 1 : 2;
      deviceSlotsByUnit.set(
        d.unitId,
        (deviceSlotsByUnit.get(d.unitId) || 0) + slots,
      );
    }

    const unitSummary = units.map((u) => {
      const unitDevices = u._count.devices;
      const dayAssignments = todayAssignments.filter(
        (a) => (a.unitId || scheduleUnitMap.get(a.scheduleId)) === u.id,
      );
      const expectedSlots = deviceSlotsByUnit.get(u.id) || 0;
      const occupancy =
        expectedSlots > 0
          ? Math.round((dayAssignments.length / expectedSlots) * 100)
          : 0;
      return {
        unitId: u.id,
        code: u.code,
        name: u.name,
        type: u.type,
        activeDevices: unitDevices,
        staffCount: u._count.personnel,
        expectedSlots,
        occupancy,
        todayAssignments: dayAssignments.length,
        missingAssignments: Math.max(0, expectedSlots - dayAssignments.length),
        incidents: incidentsByUnit.get(u.id)?.length || 0,
      };
    });

    const upcoming = assignments
      .filter(
        (a) =>
          a.date > todayStr ||
          (a.date === todayStr &&
            (a.startTime > a.endTime || a.endTime > nowTime)),
      )
      .sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime),
      )
      .slice(0, 6)
      .map((a) => {
        const unit = unitMap.get(
          a.unitId || scheduleUnitMap.get(a.scheduleId) || '',
        );
        return {
          id: a.id,
          date: a.date,
          day: a.date.slice(8, 10),
          shiftType: a.shiftType,
          startTime: a.startTime,
          endTime: a.endTime,
          isConfirmed: a.isConfirmed,
          status: scheduleStatusMap.get(a.scheduleId) || 'draft',
          personnelName: a.personnel.name,
          personnelRole: a.personnel.role,
          deviceName: a.device?.name || '',
          unitName: unit?.name || '',
          unitType: unit?.type || '',
        };
      });

    const criticalIncidents = incidents.filter(
      (i) => i.severity === 'critical',
    ).length;
    const highIncidents = incidents.filter((i) => i.severity === 'high').length;
    const openIncidents = incidents.length;

    const trainingExpired = trainings.filter(
      (t) => t.expiryDate!.getTime() < now.getTime(),
    ).length;
    const trainingDue30 = trainings.filter((t) => {
      const diff = t.expiryDate!.getTime() - now.getTime();
      return diff >= 0 && diff <= 30 * 86400000;
    }).length;
    const trainingDue60 = trainings.filter((t) => {
      const diff = t.expiryDate!.getTime() - now.getTime();
      return diff > 30 * 86400000 && diff <= 60 * 86400000;
    }).length;

    const missingUnits = unitSummary.filter(
      (u) => u.missingAssignments > 0 && u.expectedSlots > 0,
    );
    const totalMissing = missingUnits.reduce(
      (sum, u) => sum + u.missingAssignments,
      0,
    );

    const alerts: Array<{
      type: 'danger' | 'warning' | 'info';
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
      title: string;
      description: string;
      time: string;
      action?: { label: string; route: string };
    }> = [];

    if (criticalIncidents > 0) {
      alerts.push({
        type: 'danger',
        priority: 'CRITICAL',
        title: `${criticalIncidents} kritik cihaz arızası`,
        description: 'Kritik öncelikli arızalar acil müdahale gerektiriyor',
        time: 'Şimdi',
        action: { label: 'Arızaları Gör', route: '/app/device-incidents' },
      });
    }
    if (highIncidents > 0) {
      alerts.push({
        type: 'danger',
        priority: 'HIGH',
        title: `${highIncidents} yüksek öncelikli arıza`,
        description: 'Yüksek öncelikli arızalar incelenmeli',
        time: 'Şimdi',
        action: { label: 'Arızaları Gör', route: '/app/device-incidents' },
      });
    } else if (openIncidents > 0) {
      alerts.push({
        type: 'warning',
        priority: 'MEDIUM',
        title: `${openIncidents} aktif cihaz arızası`,
        description: 'Arıza kayıtları açık durumda',
        time: 'Şimdi',
        action: { label: 'Arızaları Gör', route: '/app/device-incidents' },
      });
    }

    if (totalMissing > 0) {
      const unitNames = missingUnits
        .slice(0, 3)
        .map((u) => u.name)
        .join(', ');
      alerts.push({
        type: 'warning',
        priority: 'HIGH',
        title: `${totalMissing} boş vardiya ataması`,
        description: `${missingUnits.length} birimde bugün vardiya ataması eksik: ${unitNames}${missingUnits.length > 3 ? '…' : ''}`,
        time: 'Bugün',
        action: { label: 'Plana Git', route: '/app/approval-center' },
      });
    }

    if (pendingShifts > 0) {
      alerts.push({
        type: 'warning',
        priority: 'MEDIUM',
        title: `${pendingShifts} onay bekleyen vardiya`,
        description: 'Onaylanmamış atamalar bulunuyor',
        time: 'Bugün',
        action: { label: 'Onayla', route: '/app/approval-center' },
      });
    }

    if (trainingExpired > 0) {
      alerts.push({
        type: 'danger',
        priority: 'HIGH',
        title: `${trainingExpired} sertifikanın süresi doldu`,
        description: 'Geçerliliği sona ermiş sertifikalar yenilenmeli',
        time: 'Bugün',
        action: { label: 'Personel', route: '/app/employees' },
      });
    }
    if (trainingDue30 > 0) {
      alerts.push({
        type: 'warning',
        priority: 'MEDIUM',
        title: `${trainingDue30} sertifika 30 gün içinde dolacak`,
        description: 'Yakında yenilenmesi gereken sertifikalar',
        time: '30 gün',
        action: { label: 'Personel', route: '/app/employees' },
      });
    }
    if (trainingDue60 > 0) {
      alerts.push({
        type: 'info',
        priority: 'LOW',
        title: `${trainingDue60} sertifika 60 gün içinde dolacak`,
        description: 'Planlı yenileme gerektiren sertifikalar',
        time: '60 gün',
        action: { label: 'Personel', route: '/app/employees' },
      });
    }

    if (swapRequests > 0) {
      alerts.push({
        type: 'info',
        priority: 'LOW',
        title: `${swapRequests} bekleyen vardiya takası`,
        description: 'Onay bekleyen vardiya değişim talepleri',
        time: 'Beklemede',
        action: { label: 'Takasları Gör', route: '/app/swap-requests' },
      });
    }

    const PRIORITY_ORDER: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    alerts.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    );

    const totalPersonnelAll = units.reduce(
      (sum, u) => sum + u._count.personnel,
      0,
    );
    const totalIncidents = incidents.length;
    const trainingExpiries = trainingExpired + trainingDue30 + trainingDue60;

    return {
      period: { month, year },
      lastUpdated: now.toISOString(),
      kpis: {
        activeDevices,
        totalPersonnel: totalPersonnelAll,
        onDutyPersonnel,
        pendingShifts,
        activeIncidents: totalIncidents,
        trainingExpiries,
        trainingExpired,
        trainingDue30,
        trainingDue60,
        pendingSwaps: swapRequests,
        todayAssignments: todayAssignments.length,
        totalMissing,
      },
      unitSummary,
      upcomingShifts: upcoming,
      alerts,
    };
  }

  private istanbulNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '0';

    const now = new Date(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')),
      Number(get('hour')),
      Number(get('minute')),
      Number(get('second')),
    );

    const year = Number(get('year'));
    const month = Number(get('month'));
    const todayStr = `${get('year')}-${get('month')}-${get('day')}`;
    const yesterday = new Date(now.getTime() - 86400000);
    const yP = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(yesterday);
    const yGet = (t: string) => yP.find((p) => p.type === t)?.value ?? '0';
    const yesterdayStr = `${yGet('year')}-${yGet('month')}-${yGet('day')}`;
    const nowTime = `${get('hour')}:${get('minute')}`;

    return { now, todayStr, yesterdayStr, nowTime, year, month };
  }

  private async computeOvertimeTotal(
    organizationId: string,
    month: number,
    year: number,
  ): Promise<number> {
    const units = await this.prisma.unit.findMany({
      where: organizationId ? { organizationId } : {},
      select: { id: true },
    });
    const unitIds = units.map((u) => u.id);

    const schedules = await this.prisma.schedule.findMany({
      where: { unitId: { in: unitIds }, month, year },
      select: { id: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    const count = await this.prisma.assignment.count({
      where: { scheduleId: { in: scheduleIds } },
    });

    const personnelCount = await this.prisma.personnel.count({
      where: { unitId: { in: unitIds }, isActive: true },
    });

    if (personnelCount === 0) return 0;
    const avgShiftsPerPerson = count / personnelCount;
    const standardPerPerson = new Date(year, month, 0).getDate() / 2;
    const overtimePerPerson = Math.max(
      0,
      avgShiftsPerPerson - standardPerPerson,
    );
    return overtimePerPerson * personnelCount * 8;
  }
}
