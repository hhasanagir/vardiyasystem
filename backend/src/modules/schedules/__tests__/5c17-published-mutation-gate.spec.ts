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
import { ConflictException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.17 — UA8-1 published schedule mutation.
 *
 * addAssignment / updateAssignment / removeAssignment / overrideAssignment and
 * the bulk PUT replacement must reject mutation of published (or archived)
 * schedules with ConflictException. Draft/rejected remain editable.
 */
describe('Phase 5C.17 — UA8-1 published schedule mutation gate', () => {
  let service: SchedulesService;
  let mockPrisma: any;
  let mockUnitsService: any;

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      assignment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      scheduleSnapshot: { findFirst: vi.fn(), create: vi.fn() },
      unit: { findFirst: vi.fn(), findMany: vi.fn() },
      personnel: { findUnique: vi.fn() },
      device: { findUnique: vi.fn() },
      deviceOffDate: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      shifts: { findMany: vi.fn().mockResolvedValue([]) },
      personnelGroup: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
    };

    mockUnitsService = { findAll: vi.fn(), findOne: vi.fn(), findByOrganization: vi.fn(), getDevices: vi.fn() };
    const mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
    const mockWorkflowService = { submitForReview: vi.fn(), approve: vi.fn(), reject: vi.fn(), publish: vi.fn() };
    const mockGateway = { broadcastPersonnelUpdate: vi.fn(), broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined), server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } };
    const mockNotificationEvent = { assignmentCreated: vi.fn().mockResolvedValue(undefined), assignmentRemoved: vi.fn().mockResolvedValue(undefined) };
    const mockMetrics = { authLoginTotal: { inc: vi.fn() }, httpRequestsTotal: { inc: vi.fn() }, httpRequestDuration: { observe: vi.fn() }, dbQueryDuration: { observe: vi.fn() }, dbSlowQueriesTotal: { inc: vi.fn() }, dbQueriesTotal: { inc: vi.fn() }, wsEventsTotal: { inc: vi.fn() }, wsErrorsTotal: { inc: vi.fn() } };
    const mockEventBus = { publish: vi.fn() };
    const mockUnitScope = {
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

  const publishedSchedule = { id: 's-1', status: 'published', version: 4, unitId: 'u-1', month: 6, year: 2026, unit: { type: 'mr' } };
  const archivedSchedule = { id: 's-1', status: 'archived', version: 4, unitId: 'u-1', month: 6, year: 2026, unit: { type: 'mr' } };
  const draftSchedule = { id: 's-1', status: 'draft', version: 4, unitId: 'u-1', month: 6, year: 2026, unit: { type: 'mr' } };

  const assignmentDto = {
    personnelId: 'p-1',
    deviceId: 'd-1',
    date: '2026-08-10',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '16:00',
  };

  it('addAssignment on published schedule is DENIED (ConflictException)', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
    await expect(
      service.addAssignment('s-1', assignmentDto as any, 'u-1', 'supervisor', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('addAssignment on archived schedule is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(archivedSchedule);
    await expect(
      service.addAssignment('s-1', assignmentDto as any, 'u-1', 'supervisor', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('addAssignment on draft schedule is ALLOWED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(draftSchedule);
    mockPrisma.personnel.findUnique.mockResolvedValue({ id: 'p-1', role: 'technician', isActive: true, offDays: [], nightShiftEligible: true });
    mockPrisma.assignment.findFirst.mockResolvedValue(null);
    mockPrisma.assignment.create.mockResolvedValue({ id: 'a-1', ...assignmentDto });
    mockPrisma.unit.findFirst.mockResolvedValue(draftSchedule);
    mockPrisma.schedule.findFirst.mockResolvedValue({ ...draftSchedule, unit: { type: 'mr' }, assignments: [] });
    mockPrisma.shifts.findMany.mockResolvedValue([]);
    mockPrisma.schedule.updateMany.mockResolvedValue({ count: 1 });
    mockUnitsService.getDevices.mockResolvedValue([]);
    mockPrisma.deviceOffDate.findMany.mockResolvedValue([]);

    const result = await service.addAssignment('s-1', assignmentDto as any, 'u-1', 'supervisor', 4);
    expect(result).toBeDefined();
  });

  it('updateAssignment on published schedule is DENIED', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'a-1',
      scheduleId: 's-1',
      personnelId: 'p-1',
      schedule: { status: 'published', unit: { type: 'mr' }, month: 6, year: 2026 },
    });
    await expect(
      service.updateAssignment('s-1', 'a-1', { shiftType: 'night' } as any, 'u-1', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removeAssignment on published schedule is DENIED', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({ id: 'a-1', scheduleId: 's-1', personnelId: 'p-1' });
    mockPrisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
    await expect(
      service.removeAssignment('s-1', 'a-1', 'u-1', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('overrideAssignment on published schedule is DENIED even for authorized roles', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
    await expect(
      service.overrideAssignment('s-1', { confirmedByUser: true, overrideReason: 'x', ...assignmentDto } as any, 'u-1', 'supervisor', 'Sup', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bulk PUT replacement (update assignments) on published schedule is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
    await expect(
      service.update('s-1', { assignments: [assignmentDto as any] } as any, 'u-1', 4),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update without assignments (non-status change) does not trip the published gate', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.schedule.update.mockResolvedValue({ id: 's-1', version: 5 });
    const result = await service.update('s-1', {} as any, 'u-1', 4);
    expect(result).toBeDefined();
  });
});