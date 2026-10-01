import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardInsights(organizationId?: string) {
    const unitFilter = organizationId ? { organizationId } : {};

    const units = await this.prisma.unit.findMany({
      take: 50,
      where: unitFilter,
      include: {
        personnel: {
          select: {
            id: true,
            name: true,
            nightShiftEligible: true,
            experienceYears: true,
          },
        },
        devices: {
          select: { id: true, code: true, mode: true, workDays: true },
        },
        schedules: {
          where: { status: 'published' },
          include: {
            assignments: {
              include: {
                personnel: {
                  select: { id: true, name: true, nightShiftEligible: true },
                },
              },
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

    const holidayDates = new Set(holidays.map((h) => h.date));

    const insights = units.map((unit) => {
      const personnelCount = unit.personnel.length;
      const nightEligibleCount = unit.personnel.filter(
        (p) => p.nightShiftEligible,
      ).length;
      const deviceCount = unit.devices.length;
      const vardiyaDevices = unit.devices.filter(
        (d) => d.mode === 'vardiya',
      ).length;
      const polyclinicDevices = unit.devices.filter(
        (d) => d.mode === 'polyclinic',
      ).length;

      const allAssignments = unit.schedules.flatMap((s) => s.assignments);
      const nightAssignments = allAssignments.filter(
        (a) => a.shiftType === 'night',
      );
      const holidayAssignments = allAssignments.filter((a) =>
        holidayDates.has(a.date),
      );

      const personnelNightMap = new Map<string, number>();
      for (const a of nightAssignments) {
        const pid = a.personnelId;
        personnelNightMap.set(pid, (personnelNightMap.get(pid) || 0) + 1);
      }

      let maxNightShifts = 0;
      for (const count of personnelNightMap.values()) {
        if (count > maxNightShifts) maxNightShifts = count;
      }
      const avgNightShifts =
        nightEligibleCount > 0
          ? Math.round((allAssignments.length / nightEligibleCount) * 10) / 10
          : 0;

      const nightDensity =
        nightAssignments.length / Math.max(nightEligibleCount, 1);

      const overloadThreshold = Math.ceil(deviceCount * 0.3);
      let holidayOverload = false;
      for (const hDate of holidayDates) {
        const holidayCount = allAssignments.filter(
          (a) => a.date === hDate,
        ).length;
        if (holidayCount > overloadThreshold) {
          holidayOverload = true;
          break;
        }
      }

      const overtimeRisk =
        allAssignments.length > personnelCount * 22
          ? 'high'
          : allAssignments.length > personnelCount * 18
            ? 'medium'
            : 'low';

      return {
        unitCode: unit.code,
        unitName: unit.name,
        unitType: unit.type,
        personnelCount,
        nightEligibleCount,
        deviceCount,
        vardiyaDevices,
        polyclinicDevices,
        staffingGap:
          deviceCount > 0 ? Math.max(0, deviceCount - personnelCount) : 0,
        staffingGapRatio:
          deviceCount > 0
            ? Math.round((1 - personnelCount / deviceCount) * 100)
            : 0,
        totalShifts: allAssignments.length,
        nightShifts: nightAssignments.length,
        nightDensity: Math.round(nightDensity * 100) / 100,
        maxNightPerPerson: maxNightShifts,
        avgShiftsPerPerson:
          personnelCount > 0
            ? Math.round((allAssignments.length / personnelCount) * 10) / 10
            : 0,
        fatigueRisk:
          nightDensity > 3 ? 'high' : nightDensity > 1.5 ? 'medium' : 'low',
        fatigueRiskScore: Math.min(100, Math.round(nightDensity * 25)),
        overtimeRisk,
        holidayOverload,
        holidayAssignmentsCount: holidayAssignments.length,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      units: insights,
      summary: {
        totalUnits: units.length,
        totalPersonnel: units.reduce((s, u) => s + u.personnel.length, 0),
        totalDevices: units.reduce((s, u) => s + u.devices.length, 0),
        totalShifts: insights.reduce((s, i) => s + i.totalShifts, 0),
        unitsWithGaps: insights.filter((i) => i.staffingGap > 0).length,
        unitsWithHighFatigue: insights.filter((i) => i.fatigueRisk === 'high')
          .length,
        unitsWithOvertime: insights.filter((i) => i.overtimeRisk === 'high')
          .length,
        unitsHolidayOverload: insights.filter((i) => i.holidayOverload).length,
      },
    };
  }
}
