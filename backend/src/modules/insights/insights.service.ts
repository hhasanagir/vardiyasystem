import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleCoverageService } from '../schedules/services/schedule-coverage.service';

@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private coverageService: ScheduleCoverageService,
  ) {}

  async getDashboardInsights(organizationId?: string) {
    const unitFilter = organizationId ? { organizationId } : {};

    const units = await this.prisma.unit.findMany({
      take: 50,
      where: unitFilter,
      include: {
        personnel: { select: { id: true, name: true, nightShiftEligible: true, experienceYears: true } },
        devices: { select: { id: true, code: true, mode: true, workDays: true } },
        schedules: {
          where: { status: 'published' },
          include: {
            assignments: {
              include: { personnel: { select: { id: true, name: true, nightShiftEligible: true } } },
            },
          },
        },
      },
    });

    const holidays = await this.prisma.holiday.findMany({
      take: 365,
      where: { year: new Date().getFullYear() },
      select: { date: true },
    });

    const holidayDates = new Set(holidays.map(h => h.date));

    /**
     * P3-11 — staffing KPIs come from CoverageEngine, the single source of
     * truth. `deviceCount - personnelCount` is gone: it treated every device as
     * a 24/7 1-person requirement and counted closed weekends/holidays/off
     * dates as gaps. The replacement is the shortfall over real slots.
     */
    const insights = await Promise.all(units.map(async unit => {
      const personnelCount = unit.personnel.length;
      const nightEligibleCount = unit.personnel.filter(p => p.nightShiftEligible).length;
      const deviceCount = unit.devices.length;
      const vardiyaDevices = unit.devices.filter(d => d.mode === 'vardiya').length;
      const polyclinicDevices = unit.devices.filter(d => d.mode === 'polyclinic').length;

      const allAssignments = unit.schedules.flatMap(s => s.assignments);
      const nightAssignments = allAssignments.filter(a => a.shiftType === 'night');
      const holidayAssignments = allAssignments.filter(a => holidayDates.has(a.date));

      const personnelNightMap = new Map<string, number>();
      for (const a of nightAssignments) {
        const pid = a.personnelId;
        personnelNightMap.set(pid, (personnelNightMap.get(pid) || 0) + 1);
      }

      let maxNightShifts = 0;
      for (const count of personnelNightMap.values()) {
        if (count > maxNightShifts) maxNightShifts = count;
      }
      const avgNightShifts = nightEligibleCount > 0
        ? Math.round((allAssignments.length / nightEligibleCount) * 10) / 10
        : 0;

      const nightDensity = nightAssignments.length / Math.max(nightEligibleCount, 1);

      const overloadThreshold = Math.ceil(deviceCount * 0.3);
      let holidayOverload = false;
      for (const hDate of holidayDates) {
        const holidayCount = allAssignments.filter(a => a.date === hDate).length;
        if (holidayCount > overloadThreshold) {
          holidayOverload = true;
          break;
        }
      }

      const overtimeRisk = allAssignments.length > personnelCount * 22 ? 'high'
        : allAssignments.length > personnelCount * 18 ? 'medium'
        : 'low';

      const coverageResults = await Promise.all(
        unit.schedules.map(schedule =>
          this.coverageService.evaluateScheduleCoverage({
            unitId: unit.id,
            scheduleId: schedule.id,
            year: schedule.year,
            month: schedule.month,
          }),
        ),
      );

      const requiredSlots = coverageResults.reduce((sum, r) => sum + r.requiredSlots, 0);
      const assignedSlots = coverageResults.reduce((sum, r) => sum + r.assignedSlots, 0);
      const staffingGap = coverageResults.reduce(
        (sum, r) => sum + r.underCoverage.reduce((s, line) => s + line.shortfall, 0),
        0,
      );
      const coveragePercent = requiredSlots > 0
        ? Math.round((assignedSlots / requiredSlots) * 100)
        : 100;

      return {
        unitCode: unit.code,
        unitName: unit.name,
        unitType: unit.type,
        personnelCount,
        nightEligibleCount,
        deviceCount,
        vardiyaDevices,
        polyclinicDevices,
        // P3-11 — coverage-derived KPIs (same semantics as alerts & gates).
        staffingGap,
        staffingGapRatio: requiredSlots > 0 ? 100 - coveragePercent : 0,
        coveragePercent,
        requiredSlots,
        assignedSlots,
        totalShifts: allAssignments.length,
        nightShifts: nightAssignments.length,
        nightDensity: Math.round(nightDensity * 100) / 100,
        maxNightPerPerson: maxNightShifts,
        avgShiftsPerPerson: personnelCount > 0 ? Math.round((allAssignments.length / personnelCount) * 10) / 10 : 0,
        fatigueRisk: nightDensity > 3 ? 'high' : nightDensity > 1.5 ? 'medium' : 'low',
        fatigueRiskScore: Math.min(100, Math.round(nightDensity * 25)),
        overtimeRisk,
        holidayOverload,
        holidayAssignmentsCount: holidayAssignments.length,
      };
    }));

    return {
      generatedAt: new Date().toISOString(),
      units: insights,
      summary: {
        totalUnits: units.length,
        totalPersonnel: units.reduce((s, u) => s + u.personnel.length, 0),
        totalDevices: units.reduce((s, u) => s + u.devices.length, 0),
        totalShifts: insights.reduce((s, i) => s + i.totalShifts, 0),
        unitsWithGaps: insights.filter(i => i.staffingGap > 0).length,
        unitsWithHighFatigue: insights.filter(i => i.fatigueRisk === 'high').length,
        unitsWithOvertime: insights.filter(i => i.overtimeRisk === 'high').length,
        unitsHolidayOverload: insights.filter(i => i.holidayOverload).length,
      },
    };
  }
}
