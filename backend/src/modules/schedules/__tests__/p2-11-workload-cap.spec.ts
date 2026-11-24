import { describe, it, expect, vi } from 'vitest';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import type { PrismaService } from '../../../prisma.service';

interface TestPersonnel {
  id: string;
  name: string;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  employmentStatus: string;
  offDays: number[];
  maxWeeklyHours: number;
  isActive: boolean;
  seniority: number;
}

interface TestDevice {
  id: string;
  code: string;
  name: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
}

type FindOptions = {
  year: number;
  month: number;
  maxOvertime: number;
  minRestHours: number;
  maxConsecutiveDays: number;
  maxConsecutiveNights: number;
};

interface GeneratorInternals {
  findAvailablePersonnel(
    personnel: TestPersonnel[],
    device: TestDevice,
    dateStr: string,
    shiftType: string,
    options: FindOptions,
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    consecutiveDays: Record<string, number>,
    lastShiftDate: Record<string, string | null>,
    lastShiftType: Record<string, string | null>,
    existingAssignments: unknown[],
    blockedDates: Map<string, Set<string>>,
    weeklyHours: Record<string, Record<string, number>>,
    week: string,
    shiftHours: number,
  ): TestPersonnel[];
  shiftDurationHours(start: string, end: string): number;
  weekKey(dateStr: string): string;
}

function person(maxWeeklyHours = 8): TestPersonnel {
  return {
    id: 'p1', name: 'Technician', role: 'technician', skills: [], deviceSkills: [],
    nightShiftEligible: true, employmentStatus: 'active', offDays: [],
    maxWeeklyHours, isActive: true, seniority: 1,
  };
}

function device(): TestDevice {
  return {
    id: 'd1', code: 'DEV-1', name: 'Device', mode: 'vardiya', requiredSkills: [],
    workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 8, endHour: 16,
  };
}

function optionsFor(month: number, maxOvertime = 0): FindOptions {
  return {
    year: 2026, month, maxOvertime,
    minRestHours: 0, maxConsecutiveDays: 14, maxConsecutiveNights: 7,
  };
}

function internalsOf(prisma: PrismaService): GeneratorInternals {
  return new ScheduleAutoGeneratorService(prisma, {} as never, {} as never) as unknown as GeneratorInternals;
}

function callFind(
  svc: GeneratorInternals,
  month: number,
  dateStr: string,
  workload: number,
  maxOvertime: number,
  weeklyHours: Record<string, Record<string, number>>,
  week: string,
  shiftHours: number,
): TestPersonnel[] {
  return svc.findAvailablePersonnel(
    [person()],
    device(),
    dateStr,
    'day',
    optionsFor(month, maxOvertime),
    { p1: workload },
    {}, {}, {}, {},
    [],
    new Map<string, Set<string>>(),
    weeklyHours,
    week,
    shiftHours,
  );
}

describe('P2-11 — workload cap and maxWeeklyHours', () => {
  it('uses the requested month for the monthly shift cap', () => {
    const find = internalsOf({} as PrismaService);

    // Feb 2026: ceil(28/2) + 0 = 14 shifts. Jan would be 16.
    expect(callFind(find, 2, '2026-02-01', 13, 0, {}, '2026-02-01', 0)).toHaveLength(1);
    expect(callFind(find, 2, '2026-02-01', 14, 0, {}, '2026-02-01', 0)).toHaveLength(0);
    expect(callFind(find, 1, '2026-01-15', 14, 0, {}, '2026-01-15', 0)).toHaveLength(1); // Jan cap is 16
  });

  it('enforces maxWeeklyHours on the Monday-based week ledger', () => {
    const find = internalsOf({} as PrismaService);
    const withHours = (priorHours: number): Record<string, Record<string, number>> =>
      ({ '2026-11-16': { p1: priorHours } });

    expect(callFind(find, 11, '2026-11-16', 0, 20, withHours(2), '2026-11-16', 4)).toHaveLength(1); // 2 + 4 = 6 <= 8
    expect(callFind(find, 11, '2026-11-16', 0, 20, withHours(4), '2026-11-16', 4)).toHaveLength(1); // 4 + 4 = 8 (inclusive)
    expect(callFind(find, 11, '2026-11-16', 0, 20, withHours(5), '2026-11-16', 4)).toHaveLength(0); // 5 + 4 = 9 > 8
  });

  it('derives overnight shift hours and Monday week keys locally', () => {
    const find = internalsOf({} as PrismaService);
    expect(find.shiftDurationHours('08:00', '12:00')).toBe(4);
    expect(find.shiftDurationHours('22:00', '06:00')).toBe(8);
    expect(find.weekKey('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(find.weekKey('2026-11-22')).toBe('2026-11-16'); // Sunday -> same week
  });

  it('emits MAX_WORK_EXCEEDED instead of silently over-assigning', async () => {
    const empty = { findMany: vi.fn(() => Promise.resolve([] as unknown[])) };
    const prisma = {
      unit: { findFirst: vi.fn(() => Promise.resolve({ id: 'unit-1', organizationId: 'org-1', type: 'mr' })) },
      personnel: { findMany: vi.fn(() => Promise.resolve([person()])) },
      device: { findMany: vi.fn(() => Promise.resolve([device()])) },
      holiday: empty,
      shiftDateOverride: empty,
      deviceOffDate: empty,
      shifts: {
        findMany: vi.fn(() => Promise.resolve([{
          id: 's1', deviceId: 'd1', type: 'day', startTime: '08:00', endTime: '12:00',
          personnelType: 'technician', blockId: null,
          optionalOnWeekends: false, optionalOnHolidays: false,
        }])),
      },
    };
    const service = new ScheduleAutoGeneratorService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    const result = await service.generate(
      'u-1',
      {
        unitType: 'mr', year: 2026, month: 11, fairnessMode: 'balanced',
        includeWeekends: false, includeNightShifts: false,
      } as unknown as Parameters<ScheduleAutoGeneratorService['generate']>[1],
      'org-1',
    );

    // Week 16 Nov: two 4h shifts reach the 8h cap; the following weekday must
    // be refused with an explicit MAX_WORK_EXCEEDED warning.
    expect(result.warnings.some(w => w.includes('MAX_WORK_EXCEEDED'))).toBe(true);
    expect(result.assignments.filter(a => a.date >= '2026-11-16' && a.date <= '2026-11-22').length)
      .toBeLessThanOrEqual(2);
  });
});
