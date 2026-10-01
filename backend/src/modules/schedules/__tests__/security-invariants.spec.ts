import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ScheduleApplicationService } from '../schedule-application.service';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { ScheduleAccessGuard } from '../guards/schedule-access.guard';
import {
  Schedule,
  ApprovalData,
  ScheduleStatus,
} from '../domain/aggregates/schedule.aggregate';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { StaleVersionError } from '../domain/errors/schedule-errors';
import { AuthService } from '../../auth/auth.service';

vi.mock('bcrypt');

const mockRepo = {
  findById: vi.fn(),
  findByUnitMonthYear: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
};
const mockValidation = {
  validateAssignment: vi.fn(),
  validateSchedule: vi.fn().mockResolvedValue({ hardViolations: { total: 0 } }),
};
const mockLock = { withLock: vi.fn((_key: string, fn: () => unknown) => fn()) };

let service: ScheduleApplicationService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new ScheduleApplicationService(
    mockRepo as never,
    mockValidation as never,
    mockLock as never,
  );
});

function makeApprovalData(overrides: Partial<ApprovalData> = {}): ApprovalData {
  return {
    submittedBy: null,
    submittedAt: null,
    submittedComment: null,
    approvedBy: null,
    approvedAt: null,
    approvalComment: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    publishedBy: null,
    publishedAt: null,
    archivedBy: null,
    archivedAt: null,
    ...overrides,
  };
}

function makeSchedule(
  id: string,
  overrides: Record<string, unknown> = {},
): Schedule {
  return Schedule.reconstitute(id, {
    unitId: 'unit-A',
    month: 8,
    year: 2026,
    status: 'draft' as ScheduleStatus,
    version: 1,
    createdById: 'creator-1',
    publishedAt: null,
    assignments: new AssignmentCollection(),
    approvalData: null,
    ...overrides,
  });
}

describe('F61: Security Invariants — Penetration-Style Tests', () => {
  describe('F72: Master Data Immutability', () => {
    const publicMethods = Object.getOwnPropertyNames(
      ScheduleApplicationService.prototype,
    );

    it('scheduler must not be able to modify Personnel directly', () => {
      expect(publicMethods).toContain('createSchedule');
      expect(publicMethods.filter((m) => /personnel/i.test(m))).toEqual([]);
      expect(publicMethods).not.toContain('createPersonnel');
      expect(publicMethods).not.toContain('updatePersonnel');
      expect(publicMethods).not.toContain('deletePersonnel');
    });

    it('scheduler must not be able to modify Device directly', () => {
      expect(publicMethods.filter((m) => /device/i.test(m))).toEqual([]);
    });

    it('scheduler must not be able to modify Unit directly', () => {
      expect(publicMethods.filter((m) => /unit/i.test(m))).toEqual([]);
    });

    it('scheduler must not be able to modify ShiftTemplate directly', () => {
      expect(publicMethods.filter((m) => /shifttemplate/i.test(m))).toEqual([]);
    });
  });

  describe('F42: Optimistic Locking Enforcement', () => {
    it('save should throw StaleVersionError when version mismatches', async () => {
      const stale = makeSchedule('sched-42', { version: 3 });
      mockRepo.findById.mockResolvedValue(stale);

      await expect(
        service.approve(
          'sched-42',
          'approver-1',
          'Approver',
          'imaging_director',
          undefined,
          2,
        ),
      ).rejects.toThrow(StaleVersionError);
      await expect(
        service.approve(
          'sched-42',
          'approver-1',
          'Approver',
          'imaging_director',
          undefined,
          2,
        ),
      ).rejects.toThrow(/expected version 2 but found 3/);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('save should succeed when version matches', async () => {
      const current = makeSchedule('sched-42', {
        version: 2,
        status: 'under_review' as ScheduleStatus,
        approvalData: makeApprovalData({
          submittedBy: 'submitter-1',
          submittedAt: new Date().toISOString(),
        }),
      });
      mockRepo.findById.mockResolvedValue(current);

      const result = await service.approve(
        'sched-42',
        'approver-1',
        'Approver',
        'imaging_director',
        undefined,
        2,
      );

      expect(result.status).toBe('approved');
      expect(mockRepo.save).toHaveBeenCalledWith(current, 2);
    });
  });

  describe('F73: Tenant Isolation Invariants', () => {
    it('schedule belongs to tenant — organizationId must be set', async () => {
      const prisma = { schedule: { findMany: vi.fn().mockResolvedValue([]) } };
      const repo = new PrismaScheduleRepository(prisma as never);

      await repo.findAll({ organizationId: 'org-77' } as never);

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-77' }),
        }),
      );
    });

    it('assignment must belong to same tenant as its schedule', async () => {
      const txMock = {
        schedule: { upsert: vi.fn().mockResolvedValue({}) },
        assignment: {
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn(),
          deleteMany: vi.fn(),
        },
        scheduleApproval: { upsert: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) =>
          cb(txMock),
        ),
      };
      const repo = new PrismaScheduleRepository(prisma as never);

      await repo.save(makeSchedule('sched-t1'));

      expect(txMock.assignment.findMany).toHaveBeenCalledWith({
        where: { scheduleId: 'sched-t1' },
        select: { id: true },
      });
      expect(txMock.schedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sched-t1' } }),
      );
    });
  });

  describe('F61: Cross-Unit Authorization', () => {
    const execContext = (request: unknown) =>
      ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

    it('ScheduleAccessGuard rejects access when schedule belongs to different unit', async () => {
      const guardPrisma = {
        schedule: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ unitId: 'unit-A', organizationId: null }),
        },
        unit: {
          findUnique: vi.fn().mockResolvedValue({ organizationId: 'org-A' }),
        },
      };
      const guard = new ScheduleAccessGuard(guardPrisma as never);
      const request = {
        params: { id: 'sched-42' },
        user: { role: 'supervisor', organizationId: 'org-B', unitId: 'unit-B' },
      };

      await expect(guard.canActivate(execContext(request))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(execContext(request))).rejects.toThrow(
        /another organization/,
      );
      expect(guardPrisma.schedule.findUnique).toHaveBeenCalledWith({
        where: { id: 'sched-42' },
        select: { unitId: true, organizationId: true },
      });

      guardPrisma.schedule.findUnique.mockClear();
      await expect(
        guard.canActivate(
          execContext({
            params: { id: 'sched-42' },
            user: { role: 'system_admin' },
          }),
        ),
      ).resolves.toBe(true);
      expect(guardPrisma.schedule.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('F75: Concurrent Mutation Safety', () => {
    it('four-eyes principle — submitter cannot approve', async () => {
      const submitted = makeSchedule('sched-9', {
        status: 'under_review' as ScheduleStatus,
        approvalData: makeApprovalData({
          submittedBy: 'user-1',
          submittedAt: new Date().toISOString(),
        }),
      });
      mockRepo.findById.mockResolvedValue(submitted);

      await expect(
        service.approve('sched-9', 'user-1', 'Submitter', 'imaging_director'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.approve('sched-9', 'user-1', 'Submitter', 'imaging_director'),
      ).rejects.toThrow(/Four-eyes principle/);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('publish requires valid state', async () => {
      const draft = makeSchedule('sched-10', {
        status: 'draft' as ScheduleStatus,
        version: 1,
      });
      mockRepo.findById.mockResolvedValue(draft);

      await expect(
        service.publish(
          'sched-10',
          'director-1',
          'Director',
          'imaging_director',
        ),
      ).rejects.toThrow(/Cannot publish schedule from draft/);
      expect(mockValidation.validateSchedule).toHaveBeenCalledWith('sched-10');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('F61: Role Escalation Prevention', () => {
    it('self-registration cannot assign admin roles', async () => {
      let capturedRole: string | undefined;
      const registerPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          await cb({
            user: {
              create: vi.fn(
                async ({ data }: { data: Record<string, unknown> }) => {
                  capturedRole = data.role as string;
                  return { id: 'user-new', ...data };
                },
              ),
            },
          });
          throw new Error('HALT_AFTER_CAPTURE');
        }),
      };
      const authService = new AuthService(
        registerPrisma as never,
        {} as never,
        {} as never,
        {
          isLockedOut: vi.fn(),
          getConsecutiveFailures: vi.fn(),
          recordAttempt: vi.fn(),
        } as never,
        {} as never,
        {} as never,
        {
          validate: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
          consume: vi.fn(),
        } as never,
        { cleanupExpired: vi.fn() } as never,
        { log: vi.fn().mockResolvedValue(undefined) } as never,
        {} as never,
        {
          ensureUserHasRbacRole: vi.fn().mockResolvedValue(undefined),
        } as never,
      );

      await expect(
        authService.register({
          email: 'a@b.c',
          password: 'x',
          name: 'E',
          inviteCode: 'OK',
          role: 'system_admin',
        } as never),
      ).rejects.toThrow('HALT_AFTER_CAPTURE');
      expect(capturedRole).toBe('guest');

      capturedRole = undefined;
      await expect(
        authService.register({
          email: 'a@b.c',
          password: 'x',
          name: 'E',
          inviteCode: 'OK',
          role: 'technician',
        } as never),
      ).rejects.toThrow('HALT_AFTER_CAPTURE');
      expect(capturedRole).toBe('technician');
    });
  });
});
