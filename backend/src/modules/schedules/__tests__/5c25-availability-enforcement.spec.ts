import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { SkillService } from '../../skills/skill.service';
import { UnitsService } from '../../units/units.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { EventBusService } from '../../../events/event-bus.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { SchedulesService } from '../schedules.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
} from '../domain/optimization/scheduling-problem';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { ScheduleValidationService } from '../schedule-validation.service';
import { Schedule } from '../domain/aggregates/schedule.aggregate';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { StaleVersionError } from '../domain/errors/schedule-errors';

/**
 * Phase 5C.25 — availability enforcement (P1-A1) + generated-write integrity
 * (P1-A5) + DDD lost-update guard (P1-A6).
 *
 * Fail-closed: an assignment offered on a personnel leave/absence/unsuitable
 * date is rejected by every surface — engine, legacy validation, the optimizer
 * greedy feed, and the publish gate. Optimistic writes refuse stale versions.
 */
const EMPTY_PERSONNEL_LK = { findById: () => undefined };
const EMPTY_DEVICE_LK = { findById: () => undefined };
const EMPTY_TEMPLATE_LK = { findById: () => undefined };
const EMPTY_GROUP_LK = { findById: () => undefined };

function makeAssignment(overrides: Partial<Parameters<typeof Assignment.create>[0]> = {}) {
  return Assignment.create({
    scheduleId: 's-1',
    personnelId: 'p-1',
    date: '2026-08-15',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  });
}

const LOOKUP = {
  findById: () => ({
    id: 'p-1', name: 'Ali', isActive: true, employmentStatus: 'full_time', unitId: 'u-1', groupId: null,
    role: 'technician', skills: [], deviceSkills: [], nightShiftEligible: true, offDays: [], maxWeeklyHours: 40,
  }),
};

describe('5C.25 P1-A1 — engine availability constraint (fail-closed)', () => {
  const engine = new ConstraintEngine();

  it('blocks a candidate on a personnel blocked date (BLOCKING, non-overridable)', () => {
    const report = engine.validate(
      makeAssignment(),
      new AssignmentCollection([]),
      LOOKUP,
      EMPTY_DEVICE_LK,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE_LK,
      EMPTY_GROUP_LK,
      new Map([['p-1', new Set(['2026-08-15'])]]),
    );
    const v = report.violations.find(x => x.rule === 'PERSONNEL_AVAILABILITY_CONFLICT');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('BLOCKING');
    expect(v!.isOverrideAllowed).toBe(false);
    expect(report.hasBlocking).toBe(true);
  });

  it('passes when the blocked-dates map is absent or does not cover the date', () => {
    const report = engine.validate(
      makeAssignment(),
      new AssignmentCollection([]),
      LOOKUP,
      EMPTY_DEVICE_LK,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE_LK,
      EMPTY_GROUP_LK,
      new Map([['p-1', new Set(['2026-08-16'])]]),
    );
    expect(report.violations.find(x => x.rule === 'PERSONNEL_AVAILABILITY_CONFLICT')).toBeUndefined();
  });

  it('skips non-working shift records (the leave itself is not self-conflicting)', () => {
    const report = engine.validate(
      makeAssignment({ shiftType: 'leave' }),
      new AssignmentCollection([]),
      LOOKUP,
      EMPTY_DEVICE_LK,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE_LK,
      EMPTY_GROUP_LK,
      new Map([['p-1', new Set(['2026-08-15'])]]),
    );
    expect(report.violations.find(x => x.rule === 'PERSONNEL_AVAILABILITY_CONFLICT')).toBeUndefined();
  });
});

describe('5C.25 P1-A1 — optimizer greedy honors authoritative blockedDates', () => {
  const optimizer = new ScheduleOptimizerService();

  function makePersonnel(id: string, overrides: Partial<SchedulingProblemPersonnel> = {}): SchedulingProblemPersonnel {
    return {
      id, name: `Person ${id}`, role: 'technician', skills: ['MRI'], deviceSkills: ['MRI'],
      nightShiftEligible: true, employmentStatus: 'active', offDays: [], maxWeeklyHours: 40, isActive: true,
      ...overrides,
    };
  }

  function makeDevice(id: string): SchedulingProblemDevice {
    return {
      id, code: 'MRI-1', name: 'MRI-1', mode: 'continuous', requiredSkills: ['MRI'],
      workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 16,
    };
  }

  function makeProblem(personnel: SchedulingProblemPersonnel[]): SchedulingProblem {
    return {
      scheduleId: 's-1', unitId: 'u1', unitType: 'mr', serviceLine: 'IMAGING',
      year: 2026, month: 1,
      personnel,
      devices: [makeDevice('d1')],
      shiftDefinitions: [{ deviceId: 'd1', shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician' }],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
      deviceOffDates: new Set(),
      configuration: { fairnessMode: 'balanced', maxOvertime: 20, includeWeekends: false, includeNightShifts: false, minRestHours: 11, maxConsecutiveDays: 6, maxConsecutiveNights: 3 },
    };
  }

  it('never assigns a person on a blocked date when a free colleague exists (2026-01-05)', () => {
    const problem = makeProblem([
      makePersonnel('p1', { blockedDates: ['2026-01-05'] }),
      makePersonnel('p2', {}),
    ]);
    const result = optimizer.optimize(problem);
    const onMon = result.candidate.assignments.filter(a => a.date === '2026-01-05');
    expect(onMon.length).toBeGreaterThanOrEqual(1);
    expect(onMon.every(a => a.personnelId === 'p2')).toBe(true);
  });

  it('treats an empty blockedDates (AVAILABLE override) as authority over the raw offDays', () => {
    // p1 has Monday off but an explicit AVAILABLE row resolved to empty
    // blockedDates; p2 is on leave that day (blocked). Monday coverage must use p1.
    const problem = makeProblem([
      makePersonnel('p1', { offDays: [1], blockedDates: [] }),
      makePersonnel('p2', { blockedDates: ['2026-01-05'] }),
    ]);
    const result = optimizer.optimize(problem);
    const onMon = result.candidate.assignments.filter(a => a.date === '2026-01-05');
    expect(onMon.length).toBeGreaterThanOrEqual(1);
    expect(onMon.every(a => a.personnelId === 'p1')).toBe(true);
  });
});

describe('5C.25 P1-A1 — publish gate refuses plans with availability conflicts', () => {
  let workflow: SchedulesWorkflowService;
  let mockPrisma: any;
  let mockAvailability: any;

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn().mockResolvedValue({
          id: 's-1', status: 'approved', version: 3, unitId: 'u-1', year: 2026, month: 6,
          unit: { type: 'mr', organizationId: 'org-1' }, approval: null, assignments: [],
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      personnel: { findMany: vi.fn().mockResolvedValue([]) },
      assignment: { findMany: vi.fn().mockResolvedValue([{ personnelId: 'p-1', date: '2026-06-05' }]) },
      scheduleSnapshot: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      scheduleApproval: { upsert: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };
    mockAvailability = {
      resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map([['p-1', new Set(['2026-06-05'])]] )),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesWorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { log: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationEventService, useValue: { schedulePublished: vi.fn() } },
        { provide: ScheduleGateway, useValue: { broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined), broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined) } },
        { provide: SkillService, useValue: { validateAssignments: vi.fn().mockResolvedValue({ valid: true, errors: [] }) } },
        { provide: PersonnelAvailabilityService, useValue: mockAvailability },
        { provide: ScheduleCoverageService, useValue: { evaluateScheduleCoverage: vi.fn().mockResolvedValue({ lines: [], underCoverage: [], requiredSlots: 0, assignedSlots: 0, coveragePercent: 100, allCovered: true, uncoveredDates: [] }) } },
      ],
    }).compile();
    workflow = module.get(SchedulesWorkflowService);
  });

  it('publish is REFUSED when an assignment lands on a blocked date', async () => {
    await expect(workflow.publish('s-1', { id: 'u-9', role: 'imaging_director', organizationId: 'org-1' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.scheduleSnapshot.create).not.toHaveBeenCalled();
  });

  it('publish proceeds when nothing is blocked', async () => {
    mockAvailability.resolveMonthBlockedDates.mockResolvedValue(new Map());
    await expect(workflow.publish('s-1', { id: 'u-9', role: 'imaging_director', organizationId: 'org-1' } as any)).resolves.toBeDefined();
    expect(mockAvailability.resolveMonthBlockedDates).toHaveBeenCalled();
  });
});

describe('5C.25 P1-A5 — generator apply integrity gates', () => {
  let service: ScheduleAutoGeneratorService;
  let prisma: any;
  let mockValidation: any;

  beforeEach(() => {
    prisma = {
      schedule: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      assignment: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      scheduleSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (cb: any) => cb(prisma)),
    };
    mockValidation = {
      validateAssignment: vi.fn().mockResolvedValue({ hasBlocking: false, violations: [] }),
      // P2-15 — one batched validation call for all non-skipped candidates.
      validateAssignmentsBatch: vi.fn((_id: string, candidates: any[]) =>
        candidates.map(() => ({ hasBlocking: false, violations: [] }))),
    };
    const unitScope = { canAccessUnit: vi.fn().mockResolvedValue(true) } as unknown as UnitScopeService;
    service = new ScheduleAutoGeneratorService(
      prisma as unknown as PrismaService,
      mockValidation as unknown as ScheduleValidationService,
      unitScope,
    );
  });

  const a = (n: number) => ({
    personnelId: `p${n}`, deviceId: `d${n}`, date: '2026-08-10', shiftType: 'day' as const,
    startTime: '08:00', endTime: '16:00', personnelType: 'technician',
  });

  it('REFUSES apply on a published schedule (immutability)', async () => {
    prisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1', id: 's-1', status: 'published', version: 5 });
    await expect(service.apply({ scheduleId: 's-1', assignments: [a(1)] } as any, 'user-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('REFUSES apply when the version moved concurrently (atomic CAS)', async () => {
    prisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1', id: 's-1', status: 'draft', version: 4 });
    prisma.schedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.apply({ scheduleId: 's-1', assignments: [a(1)] } as any, 'user-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it('skips intra-batch duplicates (evolving conflict sets) instead of double-booking', async () => {
    prisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1', id: 's-1', status: 'draft', version: 4 });
    const result = await service.apply({ scheduleId: 's-1', assignments: [a(1), a(1)] } as any, 'user-1');
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe('5C.25 P1-A6 — repository save uses an atomic CAS in one transaction', () => {
  it('throws StaleVersionError on a version mismatch seen inside the transaction (no partial write)', async () => {
    const tx = {
      schedule: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ version: 9 }),
      },
      assignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) } as unknown as PrismaService;
    const repo = new PrismaScheduleRepository(prisma);

    const schedule = Schedule.reconstitute('s-1', {
      unitId: 'u-1', month: 6, year: 2026, status: 'draft', version: 4,
      createdById: 'c-1', publishedAt: null, assignments: new AssignmentCollection(), approvalData: null,
    });

    await expect(repo.save(schedule, 4)).rejects.toBeInstanceOf(StaleVersionError);
    expect(tx.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's-1', version: 4 } }),
    );
    expect(tx.assignment.findMany).not.toHaveBeenCalled();
  });

  it('applies the versioned write and continues when the CAS matches', async () => {
    const tx = {
      schedule: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
      assignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) } as unknown as PrismaService;
    const repo = new PrismaScheduleRepository(prisma);

    const schedule = Schedule.reconstitute('s-1', {
      unitId: 'u-1', month: 6, year: 2026, status: 'draft', version: 4,
      createdById: 'c-1', publishedAt: null, assignments: new AssignmentCollection(), approvalData: null,
    });

    await expect(repo.save(schedule, 4)).resolves.toBeUndefined();
    expect(tx.schedule.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('5C.25 P1-A1 — legacy addAssignment refuses a leave/absence/unsuitable date', () => {
  let service: SchedulesService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      assignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      personnel: { findUnique: vi.fn() },
      device: { findUnique: vi.fn().mockResolvedValue({ id: 'd-1', name: 'D', code: 'D', workDays: [1, 2, 3, 4, 5], isActive: true }) },
      deviceOffDate: { findFirst: vi.fn().mockResolvedValue(null) },
      personnelDateAvailability: { findUnique: vi.fn().mockResolvedValue({ type: 'LEAVE', isActive: true }) },
      $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { log: vi.fn().mockResolvedValue(undefined) } },
        { provide: UnitsService, useValue: {} },
        { provide: SchedulesWorkflowService, useValue: {} },
        { provide: ScheduleGateway, useValue: { broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined), broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined) } },
        { provide: NotificationEventService, useValue: { assignmentCreated: vi.fn().mockResolvedValue(undefined), assignmentRemoved: vi.fn().mockResolvedValue(undefined) } },
        { provide: MetricsService, useValue: {} },
        { provide: EventBusService, useValue: { publish: vi.fn().mockResolvedValue(undefined) } },
        { provide: UnitScopeService, useValue: {} },
      ],
    }).compile();

    service = module.get(SchedulesService);
  });

  function seedPerson(schedule = { id: 's-1', status: 'draft', version: 5, unitId: 'u-1' }) {
    mockPrisma.schedule.findUnique.mockResolvedValue(schedule);
    mockPrisma.personnel.findUnique.mockResolvedValue({
      id: 'personnel-1', role: 'technician', offDays: [], isActive: true,
      nightShiftEligible: true, unitId: 'u-1', groupId: 'group-1', name: 'Person A',
    });
  }

  it('rejects an assignment while the personnel has an active LEAVE row (BLOCKING availability conflict)', async () => {
    seedPerson();
    const dto = {
      personnelId: 'personnel-1', deviceId: 'd-1', kind: 'device',
      date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00',
    };
    try {
      await service.addAssignment('s-1', dto as any, 'user-1', 'technician');
      expect.unreachable('addAssignment should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.response.violations.some((v: any) => v.rule === 'PERSONNEL_AVAILABILITY_CONFLICT')).toBe(true);
      expect(e.response.hasBlocking).toBe(true);
    }
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });
});