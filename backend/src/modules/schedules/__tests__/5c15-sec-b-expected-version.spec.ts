import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SchedulesService } from '../schedules.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.15 — B: optimistic-concurrency expectedVersion preconditions on
 * legacy schedule mutations.
 *
 * Legacy mutation methods accepted a raw schedule "version" only on PUT :id.
 * This hardening lets callers pass an explicit expectedVersion; if the stored
 * version has since changed the mutation aborts atomically with a structured
 * 409 ConflictException instead of silently overwriting a concurrent edit.
 */
describe('Phase 5C.15 — B: legacy schedule expectedVersion (optimistic concurrency)', () => {
  let service: SchedulesService;
  let tx: any;

  beforeEach(() => {
    tx = {
      schedule: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
      },
    };
    service = new SchedulesService(
      {} as unknown as PrismaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('uses legacy tx.schedule.update when expectedVersion is not provided', async () => {
    await (service as any).bumpScheduleVersion(tx, 's-1', undefined);

    expect(tx.schedule.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { version: { increment: 1 } },
    });
    expect(tx.schedule.updateMany).not.toHaveBeenCalled();
  });

  it('uses atomic updateMany + version precondition when expectedVersion is provided and matches', async () => {
    tx.schedule.updateMany.mockResolvedValue({ count: 1 });
    await (service as any).bumpScheduleVersion(tx, 's-1', 7);

    expect(tx.schedule.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', version: 7 },
      data: { version: { increment: 1 } },
    });
    expect(tx.schedule.update).not.toHaveBeenCalled();
  });

  it('throws a structured 409 ConflictException when the stored version has moved (count=0)', async () => {
    tx.schedule.updateMany.mockResolvedValue({ count: 0 });

    const err = await (service as any).bumpScheduleVersion(tx, 's-1', 7)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      error: 'SCHEDULE_VERSION_CONFLICT',
      statusCode: 409,
    });
  });
});
