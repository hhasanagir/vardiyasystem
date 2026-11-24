import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { ScheduleJobStatusService } from '../job-queue/schedule-job-status.service';
import { ScheduleJobStatus, ScheduleJobType } from '../job-queue/schedule-job.types';
import { ScheduleValidationService } from '../schedule-validation.service';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import type { ValidationReport } from '../domain/constraints/constraint-engine';
import type { ApplyGeneratedScheduleDto } from '../dto/generate-schedule.dto';
import type { PrismaService } from '../../../prisma.service';
import type { UnitScopeService } from '../../rbac/services/unit-scope.service';

/**
 * Phase 5C.37 — Batch E regression pins for P2-09 / P2-15.
 * Redis status is authoritative and tenant-scoped; apply validation loads its
 * context once per proposal without relaxing any blocking rule.
 */
class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  fail = false;

  private guard(): void {
    if (this.fail) throw new Error('redis connection refused');
  }

  get(key: string): Promise<string | null> {
    this.guard();
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
    this.guard();
    if (args.includes('NX') && this.strings.has(key)) return Promise.resolve(null);
    this.strings.set(key, String(value));
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    this.guard();
    return Promise.resolve(this.strings.delete(key) ? 1 : 0);
  }

  sadd(key: string, member: string): Promise<number> {
    this.guard();
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
    return Promise.resolve(set.size);
  }

  srem(key: string, member: string): Promise<number> {
    this.guard();
    const set = this.sets.get(key);
    if (!set) return Promise.resolve(0);
    const removed = set.delete(member) ? 1 : 0;
    if (set.size === 0) this.sets.delete(key);
    return Promise.resolve(removed);
  }

  smembers(key: string): Promise<string[]> {
    this.guard();
    return Promise.resolve(Array.from(this.sets.get(key) ?? []));
  }

  expire(key: string, seconds: number): Promise<number> {
    this.guard();
    const exists = this.strings.has(key) || this.sets.has(key);
    void seconds;
    return Promise.resolve(exists ? 1 : 0);
  }
}

function statusService(redis: FakeRedis): ScheduleJobStatusService {
  return new ScheduleJobStatusService(redis as unknown as Redis);
}

describe('P2-09 — Redis-backed job status and atomic dedupe', () => {
  it('claims one active job per org + schedule + type and keeps tenants separate', async () => {
    const redis = new FakeRedis();
    const status = statusService(redis);

    const record = await status.create('j-1', 's-1', ScheduleJobType.GENERATE, 'org-1', 'u-1');
    expect(record).toMatchObject({
      jobId: 'j-1', scheduleId: 's-1', organizationId: 'org-1', userId: 'u-1',
      status: ScheduleJobStatus.QUEUED, progress: 0,
    });
    expect(await status.isDuplicate('s-1', ScheduleJobType.GENERATE, 'org-1')).toBe(true);

    await expect(
      status.create('j-2', 's-1', ScheduleJobType.GENERATE, 'org-1', 'u-2'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      status.create('j-3', 's-1', ScheduleJobType.GENERATE, 'org-2', 'u-3'),
    ).resolves.toMatchObject({ jobId: 'j-3', organizationId: 'org-2' });

    const keys = Array.from(redis.strings.keys());
    expect(keys.some(k => k.includes('org-1'))).toBe(true);
    expect(keys.some(k => k.includes('org-2'))).toBe(true);
    expect(keys.some(k => k.includes('schedule-job-dedupe'))).toBe(true);
  });

  it('persists the lifecycle, releases dedupe on terminal states and scopes schedule lists', async () => {
    const redis = new FakeRedis();
    const status = statusService(redis);
    await status.create('j-1', 's-1', ScheduleJobType.GENERATE, 'org-1', 'u-1');
    await status.create('j-2', 's-1', ScheduleJobType.GENERATE, 'org-2', 'u-2');
    await status.create('j-3', 's-2', ScheduleJobType.EXPORT, 'org-1', 'u-1');

    await status.start('j-1');
    await status.progress('j-1', 42);
    await status.complete('j-1', { generated: true });
    const completed = await status.getByJobId('j-1');
    expect(completed).toMatchObject({
      status: ScheduleJobStatus.COMPLETED,
      progress: 100,
      result: { generated: true },
    });
    expect(completed?.completedAt).toBeInstanceOf(Date);
    expect(await status.isDuplicate('s-1', ScheduleJobType.GENERATE, 'org-1')).toBe(false);

    expect(await status.getByScheduleId('s-1', 'org-1')).toHaveLength(1);
    expect(await status.getByScheduleId('s-1', 'org-2')).toHaveLength(1);
    expect(await status.getByScheduleId('s-1')).toHaveLength(2);

    expect(await status.cancel('j-3')).toBe(true);
    expect((await status.getByJobId('j-3'))?.status).toBe(ScheduleJobStatus.CANCELLED);
    expect(await status.isDuplicate('s-2', ScheduleJobType.EXPORT, 'org-1')).toBe(false);
    expect(await status.getByScheduleId('s-2', 'org-1')).toEqual([]);
    expect(await status.cancel('j-3')).toBe(false);
  });

  it('fails closed when Redis is unavailable — no in-memory fallback', async () => {
    const redis = new FakeRedis();
    const status = statusService(redis);
    await status.create('j-1', 's-1', ScheduleJobType.GENERATE, 'org-1', 'u-1');
    redis.fail = true;

    await expect(status.getByJobId('j-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(status.getByScheduleId('s-1', 'org-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      status.create('j-2', 's-2', ScheduleJobType.REPORT, 'org-1', 'u-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(status.start('j-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

interface Candidate {
  personnelId: string;
  deviceId: string;
  unitId: string;
  kind: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  personnelType: string;
}

const CANDIDATE = (
  date: string,
  shiftType: string,
  startTime = '08:00',
  endTime = '16:00',
): Candidate => ({
  personnelId: 'p-1',
  deviceId: 'd-1',
  unitId: 'u-1',
  kind: 'device',
  date,
  shiftType,
  startTime,
  endTime,
  personnelType: 'technician',
});

interface PersonnelRecord {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus: string;
  unitId: string;
  groupId: string | null;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  offDays: number[];
  maxWeeklyHours: number;
}

interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  unitId: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  isActive: boolean;
}

interface ApplyTx {
  assignment: {
    createMany: () => Promise<{ count: number }>;
    findMany: () => Promise<unknown[]>;
  };
  schedule: { updateMany: () => Promise<{ count: number }> };
  scheduleSnapshot: {
    findFirst: () => Promise<{ version: number } | null>;
    create: () => Promise<unknown>;
  };
}

function validationPrisma(): { prisma: PrismaService; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const count = (name: string): void => { calls[name] = (calls[name] || 0) + 1; };
  const prisma = {
    assignment: {
      findMany: vi.fn((): Promise<unknown[]> => { count('assignment'); return Promise.resolve([]); }),
    },
    personnel: {
      findMany: vi.fn((): Promise<PersonnelRecord[]> => {
        count('personnel');
        return Promise.resolve([{
          id: 'p-1', name: 'P', isActive: true, employmentStatus: 'active',
          unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [],
          nightShiftEligible: true, offDays: [], maxWeeklyHours: 40,
        }]);
      }),
    },
    device: {
      findMany: vi.fn((): Promise<DeviceRecord[]> => {
        count('device');
        return Promise.resolve([{
          id: 'd-1', code: 'D-1', name: 'Device', unitId: 'u-1', mode: 'continuous',
          requiredSkills: [], workDays: [0, 1, 2, 3, 4, 5, 6], isActive: true,
        }]);
      }),
    },
    personShiftTemplate: {
      findMany: vi.fn((): Promise<unknown[]> => { count('template'); return Promise.resolve([]); }),
    },
    personnelGroup: {
      findMany: vi.fn((): Promise<unknown[]> => { count('group'); return Promise.resolve([]); }),
    },
    holiday: {
      findMany: vi.fn((): Promise<Array<{ date: string; name: string; type: string; year: number }>> => {
        count('holiday');
        return Promise.resolve([{ date: '2026-11-25', name: 'Test Holiday', type: 'public', year: 2026 }]);
      }),
    },
    deviceOffDate: {
      findMany: vi.fn((): Promise<unknown[]> => { count('deviceOff'); return Promise.resolve([]); }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, calls };
}

describe('P2-15 — one context load for the whole apply proposal', () => {
  it('loads validation context a constant number of times regardless of candidate count', async () => {
    const { prisma, calls } = validationPrisma();
    const service = new ScheduleValidationService(prisma);
    const reports = await service.validateAssignmentsBatch(
      's-1',
      [
        CANDIDATE('2026-11-24', 'day'),
        CANDIDATE('2026-11-25', 'night', '00:00', '08:00'),
        CANDIDATE('2026-11-26', 'day'),
      ],
      { unitId: 'u-1', year: 2026, month: 11 },
    );

    expect(reports).toHaveLength(3);
    expect(reports[1].violations.some(v => v.rule === 'HOLIDAY_CONFLICT')).toBe(true);
    expect(calls.assignment).toBe(1);
    expect(calls.personnel).toBe(2);
    expect(calls.device).toBe(1);
    expect(calls.template).toBe(1);
    expect(calls.group).toBe(1);
    expect(calls.holiday).toBe(1);
    expect(calls.deviceOff).toBe(1);
    expect(Object.values(calls).reduce((a, b) => a + b, 0)).toBe(8);
  });

  it('sees previously accepted batch candidates — a duplicate pair is BLOCKING, not silently clean', async () => {
    const { prisma } = validationPrisma();
    const service = new ScheduleValidationService(prisma);
    const reports = await service.validateAssignmentsBatch(
      's-1',
      [CANDIDATE('2026-11-24', 'day'), CANDIDATE('2026-11-24', 'day')],
      { unitId: 'u-1', year: 2026, month: 11 },
    );

    expect(reports[0].hasBlocking).toBe(false);
    expect(reports[1].hasBlocking).toBe(true);
  });

  it('apply() calls the batch validator once and never the per-row validator', async () => {
    const tx: ApplyTx = {
      assignment: {
        createMany: vi.fn((): Promise<{ count: number }> => Promise.resolve({ count: 3 })),
        findMany: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
      },
      schedule: {
        updateMany: vi.fn((): Promise<{ count: number }> => Promise.resolve({ count: 1 })),
      },
      scheduleSnapshot: {
        findFirst: vi.fn((): Promise<{ version: number } | null> => Promise.resolve(null)),
        create: vi.fn((): Promise<unknown> => Promise.resolve({})),
      },
    };
    const prisma = {
      schedule: {
        findUnique: vi.fn((): Promise<{
          id: string; unitId: string; status: string; version: number;
          year: number; month: number; unit: { organizationId: string };
        }> => Promise.resolve({
          id: 's-1', unitId: 'u-1', status: 'draft', version: 3, year: 2026, month: 11,
          unit: { organizationId: 'org-1' },
        })),
      },
      assignment: { findMany: vi.fn((): Promise<unknown[]> => Promise.resolve([])) },
      $transaction: vi.fn((fn: (tx: ApplyTx) => Promise<unknown>): Promise<unknown> => fn(tx)),
    } as unknown as PrismaService;

    const validateAssignmentsBatch = vi.fn(
      (_id: string, candidates: Candidate[]): ValidationReport[] =>
        candidates.map(() => ({ hasBlocking: false, hasOverridable: false, violations: [], checkedConstraints: 0 })),
    );
    const validationMock = { validateAssignment: vi.fn(), validateAssignmentsBatch };
    const scope = { canAccessUnit: vi.fn((): Promise<boolean> => Promise.resolve(true)) };
    const service = new ScheduleAutoGeneratorService(
      prisma,
      validationMock as unknown as ScheduleValidationService,
      scope as unknown as UnitScopeService,
    );
    const dto = {
      scheduleId: 's-1',
      assignments: [
        CANDIDATE('2026-11-23', 'day'),
        CANDIDATE('2026-11-24', 'day'),
        CANDIDATE('2026-11-26', 'day'),
      ],
    } as unknown as ApplyGeneratedScheduleDto;

    const result = await service.apply(dto, 'u-1');

    expect(result.created).toBe(3);
    expect(validationMock.validateAssignmentsBatch).toHaveBeenCalledTimes(1);
    expect(validationMock.validateAssignmentsBatch.mock.calls[0][1]).toHaveLength(3);
    expect(validationMock.validateAssignment).not.toHaveBeenCalled();
  });
});
