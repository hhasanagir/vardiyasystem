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
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.18 — RT-01: tenant/unit confinement for unit-targeted operations
 * (publishByUnit + directAssign).
 *
 * Invariants under test:
 *   - every legally nameable unit is resolved via a SINGLE Prisma query that
 *     is always filtered by `organizationId` (never a global type lookup);
 *   - a supervisor/senior-technician sees only their own organization;
 *   - a field_supervisor is confined to their strict unit, even inside org;
 *   - an unresolved organization scope fails CLOSED (deny);
 *   - the guard applies BEFORE any schedule read or mutation.
 */
describe('Phase 5C.18 — RT-01 unit confinement (publish + direct-assign)', () => {
  let service: SchedulesService;
  let mockPrisma: any;
  let mockUnitsService: any;
  let mockAuditLog: any;
  let mockUnitScope: any;

  const UNIT = { id: 'unit-1', type: 'mr', name: 'MR A', organizationId: 'org-1' };
  const ctorArgs = () => [
    mockPrisma,
    mockAuditLog,
    mockUnitsService,
    { submitForReview: vi.fn().mockResolvedValue({ status: 'under_review' }), approve: vi.fn().mockResolvedValue({ status: 'approved' }), reject: vi.fn().mockResolvedValue({ status: 'rejected' }), publish: vi.fn().mockResolvedValue({ status: 'published' }) },
    { broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined), broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined), server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } },
    { assignmentCreated: vi.fn().mockResolvedValue(undefined), assignmentRemoved: vi.fn().mockResolvedValue(undefined) },
    { authLoginTotal: { inc: vi.fn() }, httpRequestsTotal: { inc: vi.fn() }, httpRequestDuration: { observe: vi.fn() }, dbQueryDuration: { observe: vi.fn() }, dbSlowQueriesTotal: { inc: vi.fn() }, dbQueriesTotal: { inc: vi.fn() }, wsEventsTotal: { inc: vi.fn() }, wsErrorsTotal: { inc: vi.fn() } },
    { publish: vi.fn().mockResolvedValue(undefined) },
    mockUnitScope,
  ];

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      assignment: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'a-1' }),
        deleteMany: vi.fn(),
      },
      scheduleSnapshot: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      unit: { findFirst: vi.fn() },
      personnel: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', role: 'technician', isActive: true, offDays: [], nightShiftEligible: true }) },
      device: { findUnique: vi.fn().mockResolvedValue(null) },
      deviceOffDate: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      shifts: { findMany: vi.fn().mockResolvedValue([]) },
      personnelGroup: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };

    mockUnitsService = { getDevices: vi.fn().mockResolvedValue([]) };
    mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
    mockUnitScope = {
      resolveScope: vi.fn(),
      isStrictlyUnitScoped: vi.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: UnitsService, useValue: mockUnitsService },
        { provide: SchedulesWorkflowService, useValue: ctorArgs()[3] },
        { provide: ScheduleGateway, useValue: ctorArgs()[4] },
        { provide: NotificationEventService, useValue: ctorArgs()[5] },
        { provide: MetricsService, useValue: ctorArgs()[6] },
        { provide: EventBusService, useValue: ctorArgs()[7] },
        { provide: UnitScopeService, useValue: ctorArgs()[8] },
      ],
    }).compile();

    service = module.get(SchedulesService);
  });

  const scope = (organizationId: string | null, strictUnitId: string | null, role: string) =>
    mockUnitScope.resolveScope.mockResolvedValue({ strictUnitId, organizationId, role });

  function publish() {
    return service.publishByUnit('mr', { month: 6, year: 2026 } as any, {
      id: 'user-1', name: 'DOK', email: 'dok@x.com', role: 'imaging_director', organizationId: 'org-1',
    } as any);
  }

  const dto = { personnelId: 'p-1', deviceId: 'd-1', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };
  function directAssign() {
    return service.directAssign('mr', 6, 2026, dto as any, 'user-1', 'supervisor', 'Sup', 'sup@x.com', 'org-1');
  }

  function seedDraftSchedule() {
    mockPrisma.schedule.findFirst.mockResolvedValue({
      id: 's-1', status: 'draft', version: 4, unitId: 'unit-1', month: 6, year: 2026,
      unit: { type: 'mr', organizationId: 'org-1' }, assignments: [],
    });
  }

  it('SUPERVISOR in the SAME organization resolves and publishes (org-filtered query)', async () => {
    scope('org-1', null, 'supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(false);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    seedDraftSchedule();

    await expect(publish()).resolves.toBeDefined();

    const typeQuery = mockPrisma.unit.findFirst.mock.calls.find((c: any) => c[0].where.type === 'mr');
    expect(typeQuery).toBeDefined();
    expect(typeQuery[0].where.organizationId).toBe('org-1');
  });

  it('SUPERVISOR from a DIFFERENT organization is denied (query is org-scoped, resolves null)', async () => {
    scope('org-2', null, 'supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(false);
    mockPrisma.unit.findFirst.mockResolvedValue(null);

    await expect(publish()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
  });

  it('FIELD_SUPERVISOR confined to their OWN unit succeeds (strict match)', async () => {
    scope('org-1', 'unit-1', 'field_supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(true);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    seedDraftSchedule();

    await expect(publish()).resolves.toBeDefined();
  });

  it('FIELD_SUPERVISOR targeting a SIBLING unit is denied (NotFound, no schedule touched)', async () => {
    scope('org-1', 'unit-9', 'field_supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(true);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);

    await expect(publish()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.schedule.updateMany).not.toHaveBeenCalled();
  });

  it('unresolved organization scope fails CLOSED for both operations', async () => {
    scope(null, null, 'supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(false);
    mockPrisma.unit.findFirst.mockResolvedValue(null);

    await expect(publish()).rejects.toBeInstanceOf(NotFoundException);
    await expect(directAssign()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it('direct-assign field supervisor is confined exactly like publish (strict-unit deny)', async () => {
    scope('org-1', 'unit-9', 'field_supervisor');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(true);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);

    await expect(directAssign()).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
  });

  it('the org filter is present on EVERY type lookup (no global resolution path exists)', async () => {
    scope('org-1', null, 'project_manager');
    mockUnitScope.isStrictlyUnitScoped.mockReturnValue(false);
    mockPrisma.unit.findFirst.mockResolvedValue(UNIT);
    seedDraftSchedule();
    mockPrisma.schedule.updateMany.mockResolvedValue({ count: 1 });

    await expect(publish()).resolves.toBeDefined();
    await expect(directAssign()).resolves.toBeDefined();

    const typeCalls = mockPrisma.unit.findFirst.mock.calls.filter((c: any) => c[0].where.type === 'mr');
    expect(typeCalls.length).toBeGreaterThan(0);
    for (const c of typeCalls) {
      expect(c[0].where.organizationId).toBe('org-1');
    }
  });
});