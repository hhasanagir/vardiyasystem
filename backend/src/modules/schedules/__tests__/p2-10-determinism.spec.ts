import { describe, it, expect, vi } from 'vitest';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { GreedyOptimizationStrategy } from '../domain/optimization/greedy-strategy';
import type { SchedulingProblemPersonnel } from '../domain/optimization/scheduling-problem';
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

interface GeneratorInternals {
  scoreCandidates(
    candidates: TestPersonnel[],
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    shiftType: string,
    fairnessMode: string,
  ): TestPersonnel;
  loadPersonnel(unitId: string): Promise<unknown>;
  loadDevices(unitId: string): Promise<unknown>;
  loadHolidays(year: number, month: number): Promise<unknown>;
  loadDeviceShifts(unitId: string): Promise<unknown>;
  loadShiftOverrides(year: number, month: number): Promise<unknown>;
}

interface StrategyInternals {
  selectBest(
    candidates: SchedulingProblemPersonnel[],
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    shiftType: string,
    fairnessMode: string,
  ): SchedulingProblemPersonnel;
}

interface DryRunInternals {
  loadPersonnel(unitId: string, year: number, month: number): Promise<unknown>;
  loadDevices(unitId: string): Promise<unknown>;
  loadShiftDefinitions(unitId: string): Promise<unknown>;
  loadShiftOverrides(year: number, month: number): Promise<unknown>;
  loadHolidays(year: number, month: number): Promise<unknown>;
  loadExistingAssignments(scheduleId: string): Promise<unknown>;
  loadDeviceOffDates(unitId: string, year: number, month: number): Promise<unknown>;
}

interface QueryArgs {
  orderBy?: unknown;
}

function person(id: string, seniority: number, skills: string[] = []): TestPersonnel {
  return {
    id, name: id, role: 'technician', skills, deviceSkills: [],
    nightShiftEligible: true, employmentStatus: 'active', offDays: [],
    maxWeeklyHours: 40, isActive: true, seniority,
  };
}

function makeService(prisma: Record<string, { findMany: (args: QueryArgs) => Promise<unknown[]> }>):
  ScheduleAutoGeneratorService {
  return new ScheduleAutoGeneratorService(prisma as unknown as PrismaService, {} as never, {} as never);
}

function makePrisma(keys: string[]) {
  const calls = new Map<string, QueryArgs[]>();
  const prisma: Record<string, { findMany: (args: QueryArgs) => Promise<unknown[]> }> = {};
  for (const key of keys) {
    const recorded: QueryArgs[] = [];
    calls.set(key, recorded);
    prisma[key] = {
      findMany: (args: QueryArgs) => {
        recorded.push(args);
        return Promise.resolve([] as unknown[]);
      },
    };
  }
  return { prisma, calls };
}

const MASTER_KEYS = [
  'personnel', 'device', 'holiday', 'shifts', 'shiftDateOverride', 'deviceOffDate', 'assignment',
];

describe('P2-10 — generator determinism', () => {
  it('uses real seniority and a stable id tie-break (inline generator)', () => {
    const internals = makeService({}) as unknown as GeneratorInternals;
    const candidates = [person('b', 7), person('a', 7), person('c', 2)];
    const reversed = [...candidates].reverse();
    const pick = (list: TestPersonnel[]) =>
      internals.scoreCandidates(list, {}, {}, 'day', 'seniority');

    expect(pick(candidates).id).toBe('a');
    expect(pick(reversed).id).toBe('a');
    expect(pick([person('z', 12), ...candidates]).id).toBe('z');
  });

  it('uses real seniority and a stable id tie-break (greedy optimizer)', () => {
    const internals = new GreedyOptimizationStrategy() as unknown as StrategyInternals;
    const candidates: SchedulingProblemPersonnel[] = [
      person('b', 7), person('a', 7), person('c', 2),
    ];
    const pick = (list: SchedulingProblemPersonnel[]) =>
      internals.selectBest(list, {}, {}, 'day', 'seniority');

    expect(pick(candidates).id).toBe('a');
    expect(pick([...candidates].reverse()).id).toBe('a');
    expect(pick([person('z', 12), ...candidates]).id).toBe('z');
  });

  it('pins an orderBy on every generator master-data query', async () => {
    const { prisma, calls } = makePrisma(MASTER_KEYS);
    const internals = makeService(prisma) as unknown as GeneratorInternals;

    await internals.loadPersonnel('unit-1');
    await internals.loadDevices('unit-1');
    await internals.loadHolidays(2026, 11);
    await internals.loadDeviceShifts('unit-1');
    await internals.loadShiftOverrides(2026, 11);

    expect(calls.get('personnel')?.[0].orderBy).toEqual([{ seniority: 'desc' }, { id: 'asc' }]);
    expect(calls.get('device')?.[0].orderBy).toEqual([{ code: 'asc' }, { id: 'asc' }]);
    expect(calls.get('holiday')?.[0].orderBy).toEqual([{ date: 'asc' }, { name: 'asc' }]);
    expect(calls.get('shifts')?.[0].orderBy).toEqual([
      { deviceId: 'asc' }, { type: 'asc' }, { startTime: 'asc' }, { id: 'asc' },
    ]);
    expect(calls.get('shiftDateOverride')?.[0].orderBy).toEqual([{ date: 'asc' }, { shiftId: 'asc' }]);
  });

  it('pins an orderBy on every dry-run master-data query', async () => {
    const { prisma, calls } = makePrisma(MASTER_KEYS);
    const { ScheduleDryRunService } = await import('../schedule-dry-run.service');
    const availability = { resolveMonthBlockedDates: vi.fn(() => Promise.resolve(new Map())) };
    const dryRun = new ScheduleDryRunService(
      prisma as unknown as PrismaService,
      availability as unknown as ConstructorParameters<typeof ScheduleDryRunService>[1],
    ) as unknown as DryRunInternals;

    await dryRun.loadPersonnel('unit-1', 2026, 11);
    await dryRun.loadDevices('unit-1');
    await dryRun.loadShiftDefinitions('unit-1');
    await dryRun.loadShiftOverrides(2026, 11);
    await dryRun.loadHolidays(2026, 11);
    await dryRun.loadExistingAssignments('s-1');
    await dryRun.loadDeviceOffDates('unit-1', 2026, 11);

    for (const key of MASTER_KEYS) {
      expect(calls.get(key)?.[0].orderBy, `${key} must have a deterministic orderBy`).toBeDefined();
    }
  });
});
