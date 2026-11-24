import { describe, it, expect, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { ScheduleApplicationService } from '../schedule-application.service';
import { Schedule } from '../domain/aggregates/schedule.aggregate';

type RedisMock = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function build(getImpl?: (key: string) => Promise<string | null>) {
  const schedule = Schedule.create({ unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', id: 's-1' });
  const repo = {
    findByUnitMonthYear: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(schedule),
    findAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    getVersionSnapshot: vi.fn().mockResolvedValue({ data: { assignments: [] } }),
  };
  const validation = {
    validateSchedule: vi.fn().mockResolvedValue({ hardViolations: { total: 0 } }),
  };
  const lock = { withLock: vi.fn((_key: string, fn: () => unknown) => Promise.resolve(fn())) };
  const redis: RedisMock = {
    get: vi.fn().mockImplementation((key: string) => getImpl ? getImpl(key) : Promise.resolve(null)),
    set: vi.fn().mockResolvedValue('OK'),
  };
  const service = new ScheduleApplicationService(
    repo as never,
    validation as never,
    lock as never,
    redis as never,
  );
  return { service, repo, redis, schedule };
}

describe('P3-10 — Redis-backed idempotency (org-scoped, 300s, fail-closed)', () => {
  it('stores an org-scoped key with the original 300s TTL and NX claim', async () => {
    const { service, repo, redis } = build();

    await service.createSchedule({
      unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', organizationId: 'org-1',
    });

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0] as Schedule;
    expect(redis.set).toHaveBeenCalledWith(
      'vardiya:cache:schedule-idempotency:org-1:create:u-1:8:2026',
      saved.id,
      'EX',
      300,
      'NX',
    );
  });

  it('replays a duplicate by reloading the aggregate instead of writing again', async () => {
    const { service, repo, redis, schedule } = build(async () => 's-1');

    const result = await service.createSchedule({
      unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', organizationId: 'org-1',
    });

    expect(result).toBeInstanceOf(Schedule);
    expect(result.id).toBe(schedule.id);
    expect(repo.findById).toHaveBeenCalledWith('s-1');
    expect(repo.save).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('separates the same operation across tenants', async () => {
    const first = build();
    const second = build();

    await first.service.createSchedule({
      unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', organizationId: 'org-A',
    });
    await second.service.createSchedule({
      unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', organizationId: 'org-B',
    });

    expect(first.redis.set.mock.calls[0][0]).toContain(':org-A:');
    expect(second.redis.set.mock.calls[0][0]).toContain(':org-B:');
    expect(first.redis.set.mock.calls[0][0]).not.toBe(second.redis.set.mock.calls[0][0]);
  });

  it('fails closed when Redis is unavailable — never falls back to a local Map', async () => {
    const { service, repo } = build(async () => { throw new Error('connection refused'); });

    await expect(service.createSchedule({
      unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1', organizationId: 'org-1',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('uses an org-scoped rollback idempotency key and short-circuits on replay', async () => {
    const { service, repo, redis } = build(async () => 's-1');

    const result = await service.rollback(
      's-1', 3, 'admin-1', 'Admin', 'hospital_admin', 'reason', undefined, 'org-1',
    );

    expect(redis.get).toHaveBeenCalledWith('vardiya:cache:schedule-idempotency:org-1:rollback:s-1:3:admin-1');
    expect(result.id).toBe('s-1');
    expect(repo.getVersionSnapshot).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
