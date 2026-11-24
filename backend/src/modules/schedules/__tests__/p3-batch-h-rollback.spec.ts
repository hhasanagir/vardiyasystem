import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SchedulesService } from '../schedules.service';

function buildService(updateManyCount: number) {
  const tx = {
    assignment: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    schedule: {
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      update: vi.fn().mockResolvedValue({ id: 's-1', version: 6, assignments: [] }),
    },
  };

  const prisma = {
    scheduleSnapshot: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'snap-1',
        scheduleId: 's-1',
        version: 3,
        data: { assignments: [{ date: '2026-05-01', shiftType: 'day', startTime: '08:00', endTime: '16:00' }] },
      }),
    },
    schedule: {
      findUnique: vi.fn().mockResolvedValue({ id: 's-1', version: 5, organizationId: 'org-1' }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const auditLog = { log: vi.fn().mockResolvedValue(undefined) };
  const noop = {} as never;
  const service = new SchedulesService(
    prisma as never,
    auditLog as never,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  );
  return { service, tx };
}

describe('P3-07 — legacy rollback advances the version exactly once', () => {
  it('uses a single CAS bump and never increments twice', async () => {
    const { service, tx } = buildService(1);

    const result = await service.rollback('s-1', 3, 'user-1', 5);

    expect(tx.schedule.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.schedule.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', version: 5 },
      data: { version: { increment: 1 } },
    });
    expect(tx.schedule.update).toHaveBeenCalledTimes(1);
    const reRead = tx.schedule.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(reRead.data).toEqual({});
    expect(result.version).toBe(6);
  });

  it('rejects a stale expectedVersion before the relation re-read', async () => {
    const { service, tx } = buildService(0);

    await expect(service.rollback('s-1', 3, 'user-1', 4)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.schedule.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.schedule.update).not.toHaveBeenCalled();
  });
});
