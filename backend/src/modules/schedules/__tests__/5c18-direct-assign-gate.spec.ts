import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from '../schedules.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { UnitsService } from '../../units/units.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { EventBusService } from '../../../events/event-bus.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.18 — DIRECT-01: directAssign must never force-publish a schedule.
 *
 * Before the fix, POST /schedules/direct-assign created new schedules as
 * 'published' and silently re-published any existing non-published schedule
 * (draft/under_review/rejected). Now a direct assignment:
 *   - creates missing schedules as DRAFT (no publishedAt);
 *   - NEVER mutates an existing schedule's workflow status;
 *   - rejects published/archived schedules via the same gate as every other
 *     assignment mutation (assertNotPublished -> ConflictException);
 *   - keeps the optimistic-concurrency version bump (stale -> 409);
 *   - resolves the unit inside the actor's own tenant (NotFound otherwise).
 */
describe('Phase 5C.18 — DIRECT-01 direct-assign publish gate + tenant scope', () => {
  let service: SchedulesService;
  let mockPrisma: any;
  let mockUnitsService: any;
  let mockAuditLog: any;
  let mockUnitScope: any;

  const UNIT = { id: 'unit-1', type: 'mr', name: 'MR A', organizationId: 'org-1' };

  const existingOf = (status: string) => ({
    id: 's-1',
    status,
    version: 4,
    unitId: 'unit-1',
    month: 6,
    year: 2026,
    unit: { type: 'mr', organizationId: 'org-1' },
    assignments: [],
  });

  const dto = {
    personnelId: 'p-1',
    deviceId: 'd-1',
    date: '2026-08-10',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '16:00',
  };

  function callDirectAssign(expectedVersion?: number) {
    return service.directAssign('mr', 6, 2026, dto as any, 'u-1', 'supervisor', 'Sup', 'sup@x.com', 'org-1', expectedVersion);
  }

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create: vi.fn(),
      },
      assignment: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'a-1', ...dto }),
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      scheduleSnapshot: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      unit: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      personnel: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', role: 'technician', isActive: true, offDays: [], nightShiftEligible: true, unitId: 'unit-1' }) },
      device: { findUnique: vi.fn().mockResolvedValue(null) },
      deviceOffDate: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      shifts: { findMany: vi.fn().mockResolvedValue([]) },
      personnelGroup: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };

    mockUnitsService = { findAll: vi.fn(), findOne: vi.fn(), findByOrganization: vi.fn(), getDevices: vi.fn().mockResolvedValue([]) };
    mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
    const mockWorkflowService = { submitForReview: vi.fn(), approve: vi.fn(), reject: vi.fn(), publish: vi.fn() };
    const mockGateway = { broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined), broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined), server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } };
    const mockNotificationEvent = { assignmentCreated: vi.fn().mockResolvedValue(undefined), assignmentRemoved: vi.fn().mockResolvedValue(undefined) };
    const mockMetrics = { authLoginTotal: { inc: vi.fn() }, httpRequestsTotal: { inc: vi.fn() }, httpRequestDuration: { observe: vi.fn() }, dbQueryDuration: { observe: vi.fn() }, dbSlowQueriesTotal: { inc: vi.fn() }, dbQueriesTotal: { inc: vi.fn() }, wsEventsTotal: { inc: vi.fn() }, wsErrorsTotal: { inc: vi.fn() } };
    const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
    mockUnitScope = {
      resolveScope: vi.fn().mockResolvedValue({ strictUnitId: null, organizationId: 'org-1', role: 'supervisor' }),
      isStrictlyUnitScoped: vi.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: UnitsService, useValue: mockUnitsService },
        { provide: SchedulesWorkflowService, useValue: mockWorkflowService },
        { provide: ScheduleGateway, useValue: mockGateway },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: UnitScopeService, useValue: mockUnitScope },
      ],
    }).compile();

    service = module.get(SchedulesService);
  });

  function assertNeverForcePublished() {
    for (const call of mockPrisma.schedule.update.mock.calls) {
      const args = call[0];
      expect(args.data.status).toBeUndefined();
      expect(args.data.publishedAt).toBeUndefined();
    }
    const auditActions = mockAuditLog.log.mock.calls.map((c: any) => c[0].action);
    expect(auditActions).not.toContain('PUBLISH');
  }

  it('creates a MISSING schedule as DRAFT (no publishedAt, no PUBLISH audit)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    const created = { id: 's-1', status: 'draft', version: 1, unitId: 'unit-1', month: 6, year: 2026 };
    mockPrisma.schedule.create.mockResolvedValue(created);
    mockPrisma.schedule.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...created, unit: { type: 'mr' }, assignments: [] });

    const result = await callDirectAssign();

    expect(mockPrisma.schedule.create).toHaveBeenCalledWith({
      data: {
        unitId: 'unit-1',
        // The tenant column is stamped from the unit, otherwise the row is
        // invisible to every tenant-scoped reader.
        organizationId: 'org-1',
        month: 6,
        year: 2026,
        status: 'draft',
        createdById: 'u-1',
      },
    });
    expect(result).toBeDefined();
    expect(result.status).toBe('draft');
    const createCall = mockPrisma.schedule.create.mock.calls[0][0].data;
    expect(createCall.publishedAt).toBeUndefined();
    const createAudit = mockAuditLog.log.mock.calls.find((c: any) => c[0].action === 'CREATE');
    expect(createAudit[0].after.status).toBe('draft');
    expect(createAudit[0].after.autoCreated).toBe(true);
    assertNeverForcePublished();
  });

  it('an UNAUTHORIZED role is rejected with Forbidden BEFORE any unit/schedule access', async () => {
    // technician has ROLE_LEVELS_MAP level 200 (< 300) -> canDirectAssign false.
    await expect(
      service.directAssign('mr', 6, 2026, dto as any, 'u-1', 'technician', 'Tek', 'tek@x.com', 'org-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.unit.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    expect(mockAuditLog.log).not.toHaveBeenCalled();
  });

  it('existing DRAFT schedule is NOT re-published (status untouched), assignment proceeds', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('draft'));

    const result = await callDirectAssign();

    expect(result).toBeDefined();
    assertNeverForcePublished();
    expect(mockPrisma.assignment.create).toHaveBeenCalled();
  });

  it('existing UNDER_REVIEW schedule is NOT force-published (workflow integrity)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('under_review'));

    const result = await callDirectAssign();

    expect(result).toBeDefined();
    assertNeverForcePublished();
  });

  it('existing REJECTED schedule is NOT force-published', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('rejected'));

    const result = await callDirectAssign();

    expect(result).toBeDefined();
    assertNeverForcePublished();
  });

  it('existing PUBLISHED schedule is DENIED (ConflictException), nothing mutated', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('published'));

    await expect(callDirectAssign()).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it('existing ARCHIVED schedule is DENIED (ConflictException)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('archived'));

    await expect(callDirectAssign()).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });

  it('stale expectedVersion aborts with a structured 409 (no silent overwrite)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    mockPrisma.schedule.findFirst.mockResolvedValue(existingOf('draft'));
    mockPrisma.schedule.updateMany.mockResolvedValue({ count: 0 });

    const err: any = await callDirectAssign(3).then(() => null).catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ error: 'SCHEDULE_VERSION_CONFLICT', statusCode: 409, localVersion: 3, scheduleId: 's-1' });
  });

  it('cross-ORGANIZATION unitType resolution yields NotFound (fail closed)', async () => {
    // No MR unit exists inside the actor's org -> tenant-scoped lookup returns null.
    mockPrisma.unit.findFirst.mockResolvedValue(null);

    await expect(callDirectAssign()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it('strict single-unit actor (field_supervisor) targeting a SIBLING unit yields NotFound', async () => {
    mockUnitScope.resolveScope.mockResolvedValue({ strictUnitId: 'unit-B', organizationId: 'org-1', role: 'field_supervisor' });
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(true);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT); // the type resolves to unit-A, not the actor's unit-B

    await expect(callDirectAssign()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it('unresolved organization scope fails CLOSED (NotFound), never a global lookup', async () => {
    mockUnitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: null, role: 'supervisor' });
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(false);

    await expect(callDirectAssign()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });
});