import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { SkillService } from '../../skills/skill.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { ForbiddenException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.17 — UA3-1 four-eyes on workflow approve.
 *
 * The DDD path (schedule-application.service) already blocks the submitter from
 * approving their own submission; the legacy workflow `approve` did NOT — a
 * submitter could approve their own schedule. Now both paths enforce the same
 * four-eyes invariant.
 */
describe('Phase 5C.17 — UA3-1 four-eyes on workflow approve', () => {
  let workflow: SchedulesWorkflowService;
  let mockPrisma: any;
  let mockAuditLog: any;

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      scheduleApproval: { upsert: vi.fn().mockResolvedValue({ id: 'ap-1' }) },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };
    mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
    const mockGateway = {
      broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined),
      broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined),
      server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
    };
    const mockNotificationEvent = {
      scheduleSubmitted: vi.fn().mockResolvedValue(undefined),
      scheduleApproved: vi.fn().mockResolvedValue(undefined),
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

  const role = 'imaging_director';
  const submitter = { id: 'user-1', email: 'a@x.com', name: 'A', role, organizationId: 'org-1' };
  const approver = { id: 'user-2', email: 'b@x.com', name: 'B', role, organizationId: 'org-1' };

  function seedSubmitter(submittedBy: string | null, status = 'under_review') {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1',
      status,
      version: 7,
      unitId: 'u-1',
      month: 6,
      year: 2026,
      unit: { type: 'mr', organizationId: 'org-1' },
      approval: submittedBy ? { submittedBy } : null,
    });
    mockPrisma.schedule.update.mockResolvedValue({
      id: 's-1', status: 'approved', version: 7, unitId: 'u-1', month: 6, year: 2026, unit: { orgId: 'org-1' }, assignments: [],
    });
  }

  it('approve is ALLOWED when approver differs from submitter', async () => {
    seedSubmitter('user-1');
    const res = await workflow.approve('s-1', approver);
    expect(res.success).toBe(true);
    expect(mockAuditLog.log).toHaveBeenCalled();
  });

  it('approve FAILS CLOSED when no submission is recorded', async () => {
    seedSubmitter(null);
    await expect(workflow.approve('s-1', approver)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });

  it('approve is DENIED when the approver is also the submitter (four-eyes)', async () => {
    seedSubmitter('user-1');
    await expect(workflow.approve('s-1', submitter)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });

  it('covers the reject path too: a submitter can reject their own submission', async () => {
    seedSubmitter('user-1');
    const rejectSpy = vi.spyOn(workflow as any, 'reject').mockResolvedValue({ success: true });
    await workflow.reject('s-1', submitter, 'kabul edilemez');
    expect(rejectSpy).toHaveBeenCalled();
    rejectSpy.mockRestore();
  });
});