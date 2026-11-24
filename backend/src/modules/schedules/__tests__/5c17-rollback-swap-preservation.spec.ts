import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { SkillService } from '../../skills/skill.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.17 — UA5-1 rollback vs SwapRequest cascade data loss.
 *
 * workflow rollback() replaced deleteMany with a cancel-first flow: swaps that
 * reference assignments of the rolled-back schedule are marked CANCELLED with
 * the rollback reason BEFORE assignments are deleted, so the SwapRequest rows
 * are preserved (no silent cascade loss) and the cancelled ids are visible in
 * the ROLLBACK audit trail.
 */
describe('Phase 5C.17 — UA5-1 rollback preserves SwapRequest records', () => {
  let workflow: SchedulesWorkflowService;
  let mockPrisma: any;
  let mockAuditLog: any;

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
      },
      assignment: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      scheduleSnapshot: { findFirst: vi.fn(), create: vi.fn() },
      swapRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };
    mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
    const mockGateway = {
      broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined),
      server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
    };
    const mockNotificationEvent = {
      assignmentCreated: vi.fn().mockResolvedValue(undefined),
      assignmentRemoved: vi.fn().mockResolvedValue(undefined),
    };
    const mockSkillService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesWorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: ScheduleGateway, useValue: mockGateway },
        { provide: SkillService, useValue: mockSkillService },
        { provide: PersonnelAvailabilityService, useValue: { resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map()) } },
        { provide: ScheduleCoverageService, useValue: { evaluateScheduleCoverage: vi.fn().mockResolvedValue({ lines: [], underCoverage: [], requiredSlots: 0, assignedSlots: 0, coveragePercent: 100, allCovered: true, uncoveredDates: [] }) } },
      ],
    }).compile();

    workflow = module.get(SchedulesWorkflowService);
  });

  const user = { id: 'user-1', email: 'u@x.com', name: 'U', role: 'supervisor', organizationId: 'org-1' };

  function baseSchedule(status = 'draft') {
    return { id: 'schedule-1', status, version: 5, unitId: 'u-1' };
  }

  function baseSnapshot() {
    return {
      id: 'snap-1',
      scheduleId: 'schedule-1',
      version: 3,
      data: {
        assignments: [
          { personnelId: 'p1', deviceId: null, kind: 'person', date: '2026-05-01', shiftType: 'day', startTime: '08:00', endTime: '16:00', unitId: 'unit-1', personnelGroupId: 'g1', shiftTemplateId: 't1' },
        ],
      },
    };
  }

  function seedRollbackHappyPath(status = 'draft') {
    mockPrisma.schedule.findUnique
      .mockReset()
      .mockResolvedValueOnce(baseSchedule(status))
      .mockResolvedValue({ id: 'schedule-1', status: 'draft', version: 6, unit: { type: 'mr' }, assignments: [] });
    mockPrisma.schedule.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(baseSnapshot());
    mockPrisma.assignment.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.scheduleSnapshot.create.mockResolvedValue({ id: 'snap-2' });
  }

  it('cancels swap requests referencing the schedule before deleting assignments', async () => {
    seedRollbackHappyPath();
    mockPrisma.swapRequest.findMany.mockResolvedValue([{ id: 'swap-1' }, { id: 'swap-2' }]);
    mockPrisma.swapRequest.updateMany.mockResolvedValue({ count: 2 });

    await workflow.rollback('schedule-1', 3, user, 'hata düzeltme');

    expect(mockPrisma.swapRequest.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { fromAssignment: { scheduleId: 'schedule-1' } },
          { toAssignment: { scheduleId: 'schedule-1' } },
        ],
      },
      select: { id: true },
    });
    expect(mockPrisma.swapRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['swap-1', 'swap-2'] } },
      data: {
        status: 'CANCELLED',
        reason: 'Rollback (v3): hata düzeltme nedeniyle iptal edildi',
      },
    });
    expect(mockPrisma.assignment.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
  });

  it('preserves swap ids in the ROLLBACK audit trail', async () => {
    seedRollbackHappyPath();
    mockPrisma.swapRequest.findMany.mockResolvedValue([{ id: 'swap-9' }]);

    await workflow.rollback('schedule-1', 3, user, 'hata düzeltme');

    const auditCall = mockAuditLog.log.mock.calls.find((c: any[]) => c[0].action === 'ROLLBACK');
    expect(auditCall).toBeDefined();
    expect(auditCall[0].after.cancelledSwapIds).toEqual(['swap-9']);
  });

  it('does not touch swapRequest when none reference the schedule (no behavior change)', async () => {
    seedRollbackHappyPath();
    mockPrisma.swapRequest.findMany.mockResolvedValue([]);

    await workflow.rollback('schedule-1', 3, user, 'hata düzeltme');

    expect(mockPrisma.swapRequest.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.assignment.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
  });

  it('keeps published schedules protected (rollback still blocked)', async () => {
    seedRollbackHappyPath('published');
    await expect(workflow.rollback('schedule-1', 3, user, 'hata düzeltme')).rejects.toThrow();
    expect(mockPrisma.swapRequest.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.assignment.deleteMany).not.toHaveBeenCalled();
  });

  it('restores the snapshot assignments and bumps the version inside one transaction', async () => {
    seedRollbackHappyPath();
    mockPrisma.swapRequest.findMany.mockResolvedValue([]);

    const res = await workflow.rollback('schedule-1', 3, user, 'hata düzeltme');

    expect(res.success).toBe(true);
    expect(res.version).toBe(6);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});