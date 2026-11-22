import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, vi } from 'vitest';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { SkillService } from '../../skills/skill.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { ScheduleApplicationService } from '../schedule-application.service';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { ScheduleValidationService } from '../schedule-validation.service';
import { DistributedLockService } from '../../../infrastructure/distributed-lock.service';
import { Schedule } from '../domain/aggregates/schedule.aggregate';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

type MockFn = ReturnType<typeof vi.fn>;

interface WorkflowTxMock {
  schedule: { updateMany: MockFn; findUnique: MockFn };
  scheduleApproval: { upsert: MockFn };
  swapRequest: { findMany: MockFn; updateMany: MockFn };
  assignment: { deleteMany: MockFn; createMany: MockFn };
}

const user = {
  id: 'approver-1',
  email: 'approver@example.com',
  name: 'Approver',
  role: 'imaging_director',
  organizationId: 'org-1',
};

function txRunner<T>(tx: T) {
  return vi.fn((fn: (client: T) => unknown) => Promise.resolve(fn(tx)));
}

function buildWorkflow(prisma: unknown, auditLog: unknown) {
  return Test.createTestingModule({
    providers: [
      SchedulesWorkflowService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditLogService, useValue: auditLog },
      {
        provide: NotificationEventService,
        useValue: {
          scheduleSubmitted: vi.fn(),
          scheduleApproved: vi.fn(),
          scheduleRejected: vi.fn(),
          schedulePublished: vi.fn(),
        },
      },
      {
        provide: ScheduleGateway,
        useValue: { broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined) },
      },
      { provide: SkillService, useValue: { validateAssignments: vi.fn().mockResolvedValue({ valid: true, errors: [] }) } },
      {
        provide: PersonnelAvailabilityService,
        useValue: { resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map()) },
      },
      {
        provide: ScheduleCoverageService,
        useValue: {
          evaluateScheduleCoverage: vi.fn().mockResolvedValue({
            lines: [], underCoverage: [], requiredSlots: 0, assignedSlots: 0,
            coveragePercent: 100, allCovered: true, uncoveredDates: [],
          }),
        },
      },
    ],
  }).compile();
}

function workflowTx(overrides: Partial<WorkflowTxMock> = {}): WorkflowTxMock {
  const base: WorkflowTxMock = {
    schedule: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: 's-1', status: 'approved', version: 8, unitId: 'u-1',
        month: 6, year: 2026, unit: { organizationId: 'org-1' }, assignments: [],
      }),
    },
    scheduleApproval: { upsert: vi.fn().mockResolvedValue({}) },
    swapRequest: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    assignment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return { ...base, ...overrides };
}

describe('P2 Batch B — workflow CAS, transaction and audit integrity', () => {
  describe('P2-05 — legacy workflow transitions use an atomic version precondition', () => {
    it('approve is rejected with 409 when the version moved concurrently', async () => {
      const tx = workflowTx();
      tx.schedule.updateMany.mockResolvedValue({ count: 0 });
      const prisma = {
        schedule: {
          findUnique: vi.fn().mockResolvedValue({
            id: 's-1', status: 'under_review', version: 7, unitId: 'u-1',
            month: 6, year: 2026, unit: { organizationId: 'org-1' },
            approval: { submittedBy: 'submitter-1' },
          }),
        },
        $transaction: txRunner(tx),
      };
      const audit = { log: vi.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await buildWorkflow(prisma, audit);
      const workflow = module.get(SchedulesWorkflowService);

      await expect(workflow.approve('s-1', user)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.schedule.updateMany).toHaveBeenCalledWith({
        where: { id: 's-1', version: 7 },
        data: expect.objectContaining({ status: 'approved', version: { increment: 1 } }) as unknown,
      });
      expect(tx.scheduleApproval.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('rollback is rejected when the version moved concurrently', async () => {
      const tx = workflowTx();
      tx.schedule.updateMany.mockResolvedValue({ count: 0 });
      tx.swapRequest.findMany.mockResolvedValue([{ id: 'swap-1' }]);
      const prisma = {
        schedule: {
          findUnique: vi.fn().mockResolvedValue({
            id: 's-1', status: 'draft', version: 7, unitId: 'u-1',
            unit: { organizationId: 'org-1' },
          }),
        },
        scheduleSnapshot: {
          findFirst: vi.fn().mockResolvedValue({ id: 'snap-1', data: { assignments: [] } }),
          create: vi.fn(),
        },
        $transaction: txRunner(tx),
      };
      const module: TestingModule = await buildWorkflow(prisma, { log: vi.fn() });
      const workflow = module.get(SchedulesWorkflowService);

      await expect(workflow.rollback('s-1', 3, user, 'reason')).rejects.toBeInstanceOf(ConflictException);
      expect(tx.schedule.updateMany).toHaveBeenCalledWith({
        where: { id: 's-1', version: 7 },
        data: expect.objectContaining({ version: { increment: 1 } }) as unknown,
      });
      expect(tx.swapRequest.updateMany).not.toHaveBeenCalled();
      expect(tx.assignment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('P2-06 — state, approval/snapshot and audit share one transaction', () => {
    it('approve writes approval and audit through the transaction client, not the outer client', async () => {
      const tx = workflowTx();
      const outerApproval = { upsert: vi.fn() };
      const prisma = {
        schedule: {
          findUnique: vi.fn().mockResolvedValue({
            id: 's-1', status: 'under_review', version: 7, unitId: 'u-1',
            month: 6, year: 2026, unit: { organizationId: 'org-1' },
            approval: { submittedBy: 'submitter-1' },
          }),
        },
        scheduleApproval: outerApproval,
        $transaction: txRunner(tx),
      };
      const audit = { log: vi.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await buildWorkflow(prisma, audit);
      const workflow = module.get(SchedulesWorkflowService);

      await expect(workflow.approve('s-1', user)).resolves.toMatchObject({ success: true });
      expect(tx.scheduleApproval.upsert).toHaveBeenCalledTimes(1);
      expect(outerApproval.upsert).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }), tx);
    });

    it('does not swallow an audit failure (no fire-and-forget write)', async () => {
      const tx = workflowTx();
      const prisma = {
        schedule: {
          findUnique: vi.fn().mockResolvedValue({
            id: 's-1', status: 'under_review', version: 7, unitId: 'u-1',
            unit: { organizationId: 'org-1' }, approval: { submittedBy: 'submitter-1' },
          }),
        },
        $transaction: txRunner(tx),
      };
      const audit = { log: vi.fn().mockRejectedValue(new Error('audit-unavailable')) };
      const module: TestingModule = await buildWorkflow(prisma, audit);
      const workflow = module.get(SchedulesWorkflowService);

      await expect(workflow.approve('s-1', user)).rejects.toThrow('audit-unavailable');
    });
  });

  describe('P2-07 — DDD publish writes a restorable snapshot', () => {
    it('passes a snapshot option to the repository on publish', async () => {
      const schedule = Schedule.reconstitute('s-1', {
        unitId: 'u-1', month: 6, year: 2026, status: 'approved', version: 4,
        createdById: 'creator-1', publishedAt: null,
        assignments: new AssignmentCollection(), approvalData: null,
      });
      const repo = { findById: vi.fn().mockResolvedValue(schedule), save: vi.fn().mockResolvedValue(undefined) };
      const validation = { validateSchedule: vi.fn().mockResolvedValue({ hardViolations: { total: 0 } }) };
      const lock = {
        withLock: vi.fn((_key: string, fn: () => unknown) => Promise.resolve(fn())),
      } as unknown as DistributedLockService;
      const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };
      const service = new ScheduleApplicationService(
        repo as unknown as PrismaScheduleRepository,
        validation as unknown as ScheduleValidationService,
        lock,
        mockRedis as never,
      );

      await service.publish('s-1', 'publisher-1', 'Publisher', 'imaging_director', 4);

      expect(repo.save).toHaveBeenCalledWith(
        schedule,
        4,
        expect.objectContaining({ snapshot: { userId: 'publisher-1', comment: 'DDD publish snapshot' } }),
      );
    });

    it('repository writes the snapshot inside the save transaction', async () => {
      const tx = {
        schedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        scheduleSnapshot: { upsert: vi.fn().mockResolvedValue({}) },
        assignment: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const prisma = { $transaction: txRunner(tx) } as unknown as PrismaService;
      const repo = new PrismaScheduleRepository(prisma);
      const schedule = Schedule.reconstitute('s-1', {
        unitId: 'u-1', month: 6, year: 2026, status: 'published', version: 4,
        createdById: 'creator-1', publishedAt: new Date(),
        assignments: new AssignmentCollection(), approvalData: null,
      });

      await repo.save(schedule, 4, { snapshot: { userId: 'publisher-1', comment: 'DDD publish snapshot' } });

      expect(tx.scheduleSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scheduleId_version: { scheduleId: 's-1', version: 4 } },
          create: expect.objectContaining({
            scheduleId: 's-1', version: 4, createdById: 'publisher-1',
          }) as unknown,
        }),
      );
    });
  });

  describe('P2-08 — DDD rollback cancels dangling SwapRequests', () => {
    const snapshotAssignments = [{
      id: 'a-1', scheduleId: 's-1', personnelId: 'p-1', deviceId: null, unitId: 'u-1',
      personnelGroupId: null, shiftTemplateId: null, kind: 'person', source: 'manual',
      date: '2026-06-05', shiftType: 'day', startTime: '08:00', endTime: '16:00',
      personnelType: 'technician',
    }];

    it('passes a swap-cancellation reason to the repository on rollback', async () => {
      const schedule = Schedule.reconstitute('s-1', {
        unitId: 'u-1', month: 6, year: 2026, status: 'published', version: 5,
        createdById: 'creator-1', publishedAt: new Date(),
        assignments: new AssignmentCollection(), approvalData: null,
      });
      const repo = {
        findById: vi.fn().mockResolvedValue(schedule),
        save: vi.fn().mockResolvedValue(undefined),
        getVersionSnapshot: vi.fn().mockResolvedValue({
          id: 'snap-1', scheduleId: 's-1', version: 3,
          data: { assignments: snapshotAssignments }, createdById: 'creator-1', createdAt: new Date(),
        }),
      };
      const lock = {
        withLock: vi.fn((_key: string, fn: () => unknown) => Promise.resolve(fn())),
      } as unknown as DistributedLockService;
      const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };
      const service = new ScheduleApplicationService(
        repo as unknown as PrismaScheduleRepository,
        {} as ScheduleValidationService,
        lock,
        mockRedis as never,
      );

      await service.rollback('s-1', 3, 'admin-1', 'Admin', 'hospital_admin', 'bad plan', 5);

      expect(repo.save).toHaveBeenCalledWith(
        expect.any(Schedule),
        5,
        expect.objectContaining({ cancelSwapRequestsReason: 'DDD rollback to v3: bad plan' }),
      );
    });

    it('repository cancels swaps in the same transaction before replacing assignments', async () => {
      const swapUpdate = vi.fn().mockResolvedValue({ count: 1 });
      const assignmentFind = vi.fn().mockResolvedValue([]);
      const tx = {
        schedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        swapRequest: { findMany: vi.fn().mockResolvedValue([{ id: 'swap-1' }]), updateMany: swapUpdate },
        assignment: { findMany: assignmentFind },
      };
      const prisma = { $transaction: txRunner(tx) } as unknown as PrismaService;
      const repo = new PrismaScheduleRepository(prisma);
      const schedule = Schedule.reconstitute('s-1', {
        unitId: 'u-1', month: 6, year: 2026, status: 'draft', version: 6,
        createdById: 'creator-1', publishedAt: null,
        assignments: new AssignmentCollection(), approvalData: null,
      });

      await repo.save(schedule, 5, { cancelSwapRequestsReason: 'DDD rollback to v3: bad plan' });

      expect(tx.swapRequest.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { fromAssignment: { scheduleId: 's-1' } },
            { toAssignment: { scheduleId: 's-1' } },
          ],
        },
        select: { id: true },
      });
      expect(swapUpdate).toHaveBeenCalledWith({
        where: { id: { in: ['swap-1'] } },
        data: { status: 'CANCELLED', reason: 'DDD rollback to v3: bad plan' },
      });
      expect(swapUpdate.mock.invocationCallOrder[0]).toBeLessThan(assignmentFind.mock.invocationCallOrder[0]);
    });

    it('does not touch swaps when the version precondition fails', async () => {
      const tx = {
        schedule: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        swapRequest: { findMany: vi.fn(), updateMany: vi.fn() },
      };
      const prisma = {
        $transaction: txRunner(tx),
        schedule: { findUnique: vi.fn().mockResolvedValue({ version: 9 }) },
      } as unknown as PrismaService;
      const repo = new PrismaScheduleRepository(prisma);
      const schedule = Schedule.reconstitute('s-1', {
        unitId: 'u-1', month: 6, year: 2026, status: 'draft', version: 6,
        createdById: 'creator-1', publishedAt: null,
        assignments: new AssignmentCollection(), approvalData: null,
      });

      await expect(
        repo.save(schedule, 5, { cancelSwapRequestsReason: 'DDD rollback to v3: bad plan' }),
      ).rejects.toThrow();
      expect(tx.swapRequest.findMany).not.toHaveBeenCalled();
      expect(tx.swapRequest.updateMany).not.toHaveBeenCalled();
    });
  });
});
