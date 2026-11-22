import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ScheduleApplicationService } from '../schedule-application.service';
import { Schedule } from '../domain/aggregates/schedule.aggregate';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { ScheduleValidationService } from '../schedule-validation.service';
import { DistributedLockService } from '../../../infrastructure/distributed-lock.service';

function buildSchedule(): Schedule {
  return Schedule.create({ unitId: 'u-1', month: 8, year: 2026, createdById: 'user-1' });
}

function blockingReport() {
  return {
    hasBlocking: true,
    violations: [
      { rule: 'UNIT_CLOSED', severity: 'BLOCKING', isOverrideAllowed: false, message: 'device closed' },
    ],
  };
}

function cleanReport() {
  return { hasBlocking: false, violations: [] };
}

describe('ScheduleApplicationService (DDD update/override hardening)', () => {
  let service: ScheduleApplicationService;
  let repo: { findById: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let validation: {
    validateAssignment: ReturnType<typeof vi.fn>;
    validateWithOverride: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = { findById: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    validation = {
      validateAssignment: vi.fn(),
      validateWithOverride: vi.fn(),
    };
    const lock: DistributedLockService = { withLock: vi.fn((_k, fn) => fn()) } as any;
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };
    service = new ScheduleApplicationService(
      repo as unknown as PrismaScheduleRepository,
      validation as unknown as ScheduleValidationService,
      lock,
      redis as never,
    );
  });

  describe('updateAssignment', () => {
    it('throws ConflictException and does NOT persist when resulting state is blockable (e.g. Saturday on closed device)', async () => {
      const schedule = buildSchedule();
      const a = schedule.addAssignment(
        { personnelId: 'p-1', deviceId: 'dev-1', unitId: 'u-1', kind: 'device', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' },
        'user-1',
      );
      repo.findById.mockResolvedValue(schedule);
      validation.validateAssignment.mockResolvedValue(blockingReport());

      await expect(service.updateAssignment('s-1', a.id, { startTime: '09:00' }, 'user-1')).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('validates the RESULTING assignment snapshot with self-exclusion and persists when clean', async () => {
      const schedule = buildSchedule();
      const a = schedule.addAssignment(
        { personnelId: 'p-1', deviceId: 'dev-1', unitId: 'u-1', kind: 'device', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' },
        'user-1',
      );
      repo.findById.mockResolvedValue(schedule);
      validation.validateAssignment.mockResolvedValue(cleanReport());

      await service.updateAssignment('s-1', a.id, { startTime: '09:00' }, 'user-1');

      expect(validation.validateAssignment).toHaveBeenCalledTimes(1);
      const [scheduleId, params, excludeId] = validation.validateAssignment.mock.calls[0];
      expect(scheduleId).toBe('s-1');
      // self-exclusion: the id being updated
      expect(excludeId).toBe(a.id);
      // resulting state: date unchanged, updated startTime applied
      expect(params.date).toBe('2026-08-10');
      expect(params.startTime).toBe('09:00');
      expect(params.deviceId).toBe('dev-1');
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException for a nonexistent assignment (no validation, no save)', async () => {
      const schedule = buildSchedule();
      repo.findById.mockResolvedValue(schedule);
      await expect(service.updateAssignment('s-1', 'missing', { startTime: '09:00' }, 'user-1')).rejects.toThrow();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('overrideAssignment', () => {
    it('rejects override claiming UNIT_CLOSED when it remains blocking and does NOT persist', async () => {
      const schedule = buildSchedule();
      repo.findById.mockResolvedValue(schedule);
      validation.validateWithOverride.mockResolvedValue(blockingReport());

      await expect(
        service.overrideAssignment(
          's-1',
          { personnelId: 'p-1', deviceId: 'dev-1', unitId: 'u-1', kind: 'device', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' },
          'user-1',
          'supervisor',
          'name',
          'override reason',
          ['UNIT_CLOSED'],
        ),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows a legitimate overridable override (clean report) and persists', async () => {
      const schedule = buildSchedule();
      repo.findById.mockResolvedValue(schedule);
      validation.validateWithOverride.mockResolvedValue(cleanReport());

      await service.overrideAssignment(
        's-1',
        { personnelId: 'p-1', deviceId: 'dev-1', unitId: 'u-1', kind: 'device', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' },
        'user-1',
        'supervisor',
        'name',
        'override reason',
        [],
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws ForbiddenException for a non-override role before any validation', async () => {
      const schedule = buildSchedule();
      repo.findById.mockResolvedValue(schedule);
      await expect(
        service.overrideAssignment('s-1', {} as any, 'user-1', 'technician', 'name', 'reason', []),
      ).rejects.toThrow(ForbiddenException);
      expect(validation.validateWithOverride).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
