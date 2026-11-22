import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import type { PersonnelLookup } from '../domain/constraints/constraint.interface';
import { policyFor, normalizeViolationPolicy } from '../types/violation-policy';
import { ConflictCode, ConflictSeverity } from '../domain/models/conflict';
import { GreedyOptimizationStrategy } from '../domain/optimization/greedy-strategy';
import type {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
} from '../domain/optimization/scheduling-problem';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import type { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.36 — Batch D regression pins for P2-11 / P2-14 / P2-18.
 *
 * These tests only add invariants. They never relax an existing gate: the
 * holiday and weekly-cap rules are BLOCKING/non-overridable, and both the
 * generator and the greedy optimizer must agree with the DDD 48h engine rule.
 */
const EMPTY_DEVICE = { findById: () => undefined };
const EMPTY_TEMPLATE = { findById: () => undefined };
const EMPTY_GROUP = { findById: () => undefined };

function personLookup(maxWeeklyHours = 40): PersonnelLookup {
  return {
    findById: () => ({
      id: 'p-1', name: 'Test', isActive: true, employmentStatus: 'active',
      unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [],
      nightShiftEligible: true, offDays: [], maxWeeklyHours,
    }),
  };
}

function assignment(params: {
  date: string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
}): Assignment {
  return Assignment.create({
    scheduleId: 's-1',
    personnelId: 'p-1',
    unitId: 'u-1',
    date: params.date,
    shiftType: params.shiftType,
    startTime: params.startTime ?? '08:00',
    endTime: params.endTime ?? '16:00',
  });
}

function validate(
  current: Assignment,
  existing: Assignment[],
  holidays: Set<string>,
  maxWeeklyHours = 40,
) {
  return new ConstraintEngine().validate(
    current,
    new AssignmentCollection(existing),
    personLookup(maxWeeklyHours),
    EMPTY_DEVICE,
    holidays,
    new Set(),
    EMPTY_TEMPLATE,
    EMPTY_GROUP,
  );
}

describe('Batch D — policy registry pins', () => {
  it('registers holiday and weekly-cap rules as BLOCKING and non-overridable', () => {
    for (const rule of ['HOLIDAY_CONFLICT', 'MAX_WORK_EXCEEDED']) {
      expect(policyFor(rule)).toEqual({ severity: 'BLOCKING', isOverrideAllowed: false });
      expect(normalizeViolationPolicy({
        rule, severity: 'INFO', message: 'legacy', isOverrideAllowed: true,
      })).toEqual({ rule, severity: 'BLOCKING', message: 'legacy', isOverrideAllowed: false });
    }
  });
});

describe('P2-14 — holiday hard constraint', () => {
  const holidays = new Set(['2026-01-01']);

  it('allows the generator-consistent daytime slots on a holiday', () => {
    for (const shiftType of ['day', 'morning']) {
      const report = validate(assignment({ date: '2026-01-01', shiftType }), [], holidays);
      expect(report.violations.filter(v => v.rule === 'HOLIDAY_CONFLICT')).toEqual([]);
    }
  });

  it.each(['evening', 'night'])('blocks %s working shifts on a holiday', (shiftType) => {
    const current = shiftType === 'night'
      ? assignment({ date: '2026-01-01', shiftType, startTime: '00:00', endTime: '08:00' })
      : assignment({ date: '2026-01-01', shiftType, startTime: '16:00', endTime: '00:00' });
    const report = validate(current, [], holidays);
    const violations = report.violations.filter(v => v.rule === 'HOLIDAY_CONFLICT');
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('BLOCKING');
    expect(violations[0].isOverrideAllowed).toBe(false);
    expect(report.hasBlocking).toBe(true);
  });

  it('does not fire for non-working shifts or non-holiday dates', () => {
    expect(validate(assignment({ date: '2026-01-01', shiftType: 'off' }), [], holidays).violations
      .filter(v => v.rule === 'HOLIDAY_CONFLICT')).toEqual([]);
    expect(validate(assignment({ date: '2026-01-02', shiftType: 'night', startTime: '00:00', endTime: '08:00' }), [], holidays).violations
      .filter(v => v.rule === 'HOLIDAY_CONFLICT')).toEqual([]);
  });
});

describe('P2-11 — weekly hard cap in the DDD engine', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

  it('blocks an assignment that pushes the Monday week over maxWeeklyHours', () => {
    const existing = week.slice(0, 5).map(date => assignment({ date, shiftType: 'day' })); // 5 × 8h = 40h
    const report = validate(assignment({ date: '2026-11-21', shiftType: 'day' }), existing, new Set(), 40);
    const violations = report.violations.filter(v => v.rule === 'MAX_WORK_EXCEEDED');
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('BLOCKING');
    expect(violations[0].isOverrideAllowed).toBe(false);
    expect(violations[0].details?.actualHours).toBe(48);
    expect(violations[0].details?.weekStart).toBe('2026-11-16');
    expect(report.hasBlocking).toBe(true);
  });

  it('allows an assignment exactly at the cap', () => {
    const existing = week.slice(0, 4).map(date => assignment({ date, shiftType: 'day' })); // 32h
    const report = validate(assignment({ date: '2026-11-20', shiftType: 'day' }), existing, new Set(), 40);
    expect(report.violations.filter(v => v.rule === 'MAX_WORK_EXCEEDED')).toEqual([]);
  });

  it('treats a missing/non-positive cap as "no configured limit" (no false block)', () => {
    const existing = week.map(date => assignment({ date, shiftType: 'day' }));
    expect(validate(assignment({ date: '2026-11-21', shiftType: 'day' }), existing, new Set(), 0).violations
      .filter(v => v.rule === 'MAX_WORK_EXCEEDED')).toEqual([]);
  });
});

interface GeneratorInternals {
  findAvailablePersonnel(
    personnel: Array<Record<string, unknown>>,
    device: Record<string, unknown>,
    dateStr: string,
    shiftType: string,
    options: Record<string, unknown>,
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
    lastNightDate?: Record<string, string | null>,
  ): Array<{ id: string }>;
}

interface GreedyInternals {
  findAvailable(
    personnel: SchedulingProblemPersonnel[],
    device: SchedulingProblemDevice,
    dateStr: string,
    shiftType: string,
    shiftDef: { startTime: string; endTime: string; personnelType: string },
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    consecutiveDays: Record<string, number>,
    lastShiftDate: Record<string, string | null>,
    existingAssignments: unknown[],
    config: SchedulingProblem['configuration'],
    weeklyHours?: Record<string, Record<string, number>>,
    week?: string,
    shiftHours?: number,
    lastNightDate?: Record<string, string | null>,
  ): SchedulingProblemPersonnel[];
}

function generatorInternals(): GeneratorInternals {
  return new ScheduleAutoGeneratorService(
    {} as PrismaService, {} as never, {} as never,
  ) as unknown as GeneratorInternals;
}

const GEN_PERSON = {
  id: 'p-1', name: 'P', role: 'technician', skills: [], deviceSkills: [],
  nightShiftEligible: true, employmentStatus: 'active', offDays: [],
  maxWeeklyHours: 40, isActive: true, seniority: 1,
};
const GEN_DEVICE = {
  id: 'd-1', code: 'D', name: 'Device', mode: 'vardiya', requiredSkills: [],
  workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 8, endHour: 16,
};
const GEN_OPTIONS = {
  year: 2026, month: 11, minRestHours: 0, maxOvertime: 20,
  maxConsecutiveDays: 14, maxConsecutiveNights: 3,
};

function generatorAvailable(dateStr: string, shiftType: string, opts: {
  nightCount?: number;
  lastNightDate?: string | null;
  lastShiftDate?: string | null;
}): Array<{ id: string }> {
  return generatorInternals().findAvailablePersonnel(
    [GEN_PERSON], GEN_DEVICE, dateStr, shiftType, GEN_OPTIONS,
    {}, { 'p-1': opts.nightCount ?? 0 }, {}, { 'p-1': opts.lastShiftDate ?? null }, {},
    [], new Map(), {}, '2026-11-16', 8,
    { 'p-1': opts.lastNightDate ?? null },
  );
}

function greedyPerson(): SchedulingProblemPersonnel {
  return {
    id: 'p-1', name: 'P', role: 'technician', skills: [], deviceSkills: [],
    nightShiftEligible: true, employmentStatus: 'active', offDays: [],
    maxWeeklyHours: 40, isActive: true,
  };
}

function greedyAvailable(dateStr: string, shiftType: string, opts: {
  nightCount?: number;
  lastNightDate?: string | null;
  maxConsecutiveNights?: number;
}): SchedulingProblemPersonnel[] {
  return (new GreedyOptimizationStrategy() as unknown as GreedyInternals).findAvailable(
    [greedyPerson()], GEN_DEVICE, dateStr, shiftType,
    { startTime: '00:00', endTime: '08:00', personnelType: 'technician' },
    {}, { 'p-1': opts.nightCount ?? 0 }, {}, {}, [],
    {
      fairnessMode: 'balanced', maxOvertime: 20, includeWeekends: false,
      includeNightShifts: true, minRestHours: 0, maxConsecutiveDays: 14,
      maxConsecutiveNights: opts.maxConsecutiveNights ?? 3,
    },
    {}, '2026-11-16', 8,
    { 'p-1': opts.lastNightDate ?? null },
  );
}

describe('P2-18 — DDD 48h night semantics across both generators', () => {
  it('generator: evening is not a night and is not limited by the night streak', () => {
    expect(generatorAvailable('2026-11-17', 'evening', {
      nightCount: 3, lastNightDate: '2026-11-16',
    }).map(p => p.id)).toEqual(['p-1']);
  });

  it('generator: 48h from the last night, not from the last shift of any type', () => {
    expect(generatorAvailable('2026-11-17', 'night', {
      lastNightDate: '2026-11-16', nightCount: 0, lastShiftDate: '2026-11-16',
    })).toEqual([]);
    expect(generatorAvailable('2026-11-18', 'night', {
      lastNightDate: '2026-11-16', nightCount: 0, lastShiftDate: '2026-11-17',
    }).map(p => p.id)).toEqual(['p-1']);
  });

  it('greedy: same 48h anchor and evening exclusion', () => {
    expect(greedyAvailable('2026-11-17', 'night', { lastNightDate: '2026-11-16' })).toEqual([]);
    expect(greedyAvailable('2026-11-18', 'night', { lastNightDate: '2026-11-16' })).toHaveLength(1);
    expect(greedyAvailable('2026-11-17', 'evening', {
      nightCount: 3, lastNightDate: '2026-11-16', maxConsecutiveNights: 3,
    })).toHaveLength(1);
  });

  it('engine agrees: a night 24h after a night is BLOCKING (REST_RULE_VIOLATION)', () => {
    const previous = assignment({
      date: '2026-11-16', shiftType: 'night', startTime: '00:00', endTime: '08:00',
    });
    const report = validate(assignment({
      date: '2026-11-17', shiftType: 'night', startTime: '00:00', endTime: '08:00',
    }), [previous], new Set());
    const violations = report.violations.filter(v => v.rule === 'REST_RULE_VIOLATION');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].severity).toBe('BLOCKING');
    expect(violations[0].isOverrideAllowed).toBe(false);
  });
});

describe('P2-11 — greedy optimizer emits a blocking MAX_WORK_EXCEEDED', () => {
  it('caps the week and never reports a fake successful schedule', () => {
    const personnel: SchedulingProblemPersonnel[] = [{
      ...greedyPerson(), maxWeeklyHours: 8,
    }];
    const devices: SchedulingProblemDevice[] = [GEN_DEVICE];
    const problem: SchedulingProblem = {
      scheduleId: 's-1', unitId: 'u-1', unitType: 'vardiya', serviceLine: 'IMAGING',
      year: 2026, month: 11,
      personnel, devices,
      shiftDefinitions: [{
        deviceId: 'd-1', shiftType: 'day', startTime: '08:00', endTime: '16:00',
        personnelType: 'technician',
      }],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
      deviceOffDates: new Set(),
      configuration: {
        fairnessMode: 'balanced', maxOvertime: 0, includeWeekends: false,
        includeNightShifts: false, minRestHours: 0,
        maxConsecutiveDays: 14, maxConsecutiveNights: 3,
      },
    };

    const result = new GreedyOptimizationStrategy().optimize(problem, {
      maxIterations: 10, timeLimitMs: 1000, strategyConfig: {},
    });

    const capViolations = result.candidate.hardConstraintViolations.filter(
      v => v.code === ConflictCode.MAX_WORK_EXCEEDED,
    );
    expect(capViolations.length).toBeGreaterThan(0);
    for (const v of capViolations) {
      expect(v.severity).toBe(ConflictSeverity.ERROR);
      expect(v.isHardConstraint).toBe(true);
      expect(v.isOverridable).toBe(false);
    }
    expect(result.candidate.isValid).toBe(false);
    expect(result.success).toBe(false);
    expect(result.candidate.assignments.filter(
      a => a.date >= '2026-11-16' && a.date <= '2026-11-22',
    ).length).toBeLessThanOrEqual(1);
  });
});
