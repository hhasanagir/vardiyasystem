import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ScheduleApplicationService } from '../schedule-application.service';
import { Schedule } from '../domain/aggregates/schedule.aggregate';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { ScheduleValidationService } from '../schedule-validation.service';
import { DistributedLockService } from '../../../infrastructure/distributed-lock.service';

/**
 * The aggregate reports an illegal transition as a plain
 * `Error('Cannot ...')`. The application service is the only place that knows
 * such a message is a state conflict, so every aggregate call that can refuse
 * has to funnel through `transition()` — otherwise the Nest exception filter
 * turns it into a 500 and the client cannot distinguish "your state is wrong"
 * from "the server is broken".
 *
 * These tests pin the observable HTTP-facing contract: 409, never 500, and
 * never a write.
 */
describe('ScheduleApplicationService — illegal transitions are 409, not 500', () => {
  let service: ScheduleApplicationService;
  let repo: {
    findById: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    getVersionSnapshot: ReturnType<typeof vi.fn>;
  };
  let validation: { validateAssignment: ReturnType<typeof vi.fn> };

  const clean = { hasBlocking: false, violations: [] };

  const assignment = {
    personnelId: 'p-1', deviceId: 'dev-1', unitId: 'u-1', kind: 'device',
    date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00',
  } as unknown as Parameters<Schedule['addAssignment']>[0];

  /** draft -> under_review -> approved -> published, i.e. a locked schedule. */
  function publishedSchedule(): Schedule {
    const schedule = Schedule.create({ unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1' });
    schedule.addAssignment(assignment, 'user-1');
    schedule.submitForReview('user-1', 'User One', 'supervisor');
    schedule.approve('director-1', 'Director', 'imaging_director');
    schedule.publish('director-1', 'Director', 'imaging_director');
    return schedule;
  }

  beforeEach(() => {
    repo = { findById: vi.fn(), save: vi.fn().mockResolvedValue(undefined), getVersionSnapshot: vi.fn() };
    validation = { validateAssignment: vi.fn().mockResolvedValue(clean) };
    const lock = { withLock: vi.fn((_k: string, fn: () => unknown) => fn()) } as unknown as DistributedLockService;
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };
    service = new ScheduleApplicationService(
      repo as unknown as PrismaScheduleRepository,
      validation as unknown as ScheduleValidationService,
      lock,
      redis as never,
    );
  });

  const expectConflict = async (run: () => Promise<unknown>) => {
    const error = await run().then(() => null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect(repo.save).not.toHaveBeenCalled();
  };

  it('addAssignment on a published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(publishedSchedule());
    await expectConflict(() => service.addAssignment('s-1', { ...assignment }, 'user-1'));
  });

  it('updateAssignment on a published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(publishedSchedule());
    await expectConflict(() => service.updateAssignment('s-1', 'a-1', { startTime: '09:00' }, 'user-1'));
  });

  it('removeAssignment on a published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(publishedSchedule());
    await expectConflict(() => service.removeAssignment('s-1', 'a-1', 'user-1'));
  });

  it('re-publishing a published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(publishedSchedule());
    await expectConflict(() => service.publish('s-1', 'director-1', 'Director', 'imaging_director'));
  });

  it('approving a published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(publishedSchedule());
    await expectConflict(() => service.approve('s-1', 'director-1', 'Director', 'imaging_director'));
  });

  it('archiving an archived schedule is a 409 and persists nothing', async () => {
    const schedule = publishedSchedule();
    schedule.archive('director-1', 'Director', 'imaging_director');
    repo.findById.mockResolvedValue(schedule);
    await expectConflict(() => service.archive('s-1', 'director-1', 'Director', 'imaging_director'));
  });

  it('rollback of a non-published schedule is a 409 and persists nothing', async () => {
    repo.findById.mockResolvedValue(Schedule.create({ unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1' }));
    await expectConflict(() =>
      service.rollback('s-1', 1, 'hospital-admin-1', 'Hospital Admin', 'hospital_admin', 'undo'),
    );
  });

  it('rollback to a target that is not older than the current version is a 400 and never writes', async () => {
    const schedule = publishedSchedule();
    repo.findById.mockResolvedValue(schedule);
    // A target that is not older than the current version is a malformed
    // request parameter, not a state conflict, so it is a 400 on purpose. The
    // service and the aggregate both read `scheduleVersion`; the aggregate
    // guard stays the last line of defence behind this one.
    const error = await service
      .rollback('s-1', schedule.scheduleVersion + 5, 'hospital-admin-1', 'Hospital Admin', 'hospital_admin', 'undo')
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
