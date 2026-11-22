import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from '../schedules.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { UnitsService } from '../../units/units.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { EventBusService } from '../../../events/event-bus.service';
import { SkillService } from '../../skills/skill.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Phase 5C.6 — Legacy mutation hardening regression tests.
 *
 * Maintains existing assertions while verifying the hardening guarantees:
 *   P0-1  persistence atomicity — assignment rows + schedule.version bump are
 *         performed inside a single Prisma $transaction, and side-effects
 *         (audit, gateway, notifications) run only after the transaction
 *         succeeds (all-or-nothing).
 *   P0-3  auditability — updateAssignment and duplicate now emit audit events
 *         (previously missing).
 */

describe('Phase 5C.6 — Legacy mutation hardening', () => {
  let service: SchedulesService;
  let workflow: SchedulesWorkflowService;
  let prisma: PrismaService;
  let auditLog: AuditLogService;

  const mockPrisma: any = {
    schedule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    assignment: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    scheduleSnapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    unit: { findMany: vi.fn(), findFirst: vi.fn() },
    personnel: { count: vi.fn(), findUnique: vi.fn() },
    device: { count: vi.fn(), findUnique: vi.fn() },
    deviceOffDate: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    shifts: { findMany: vi.fn().mockResolvedValue([]) },
    personnelGroup: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    swapRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    },
  };

  // Transaction mock: runs fn with the same mock refs and propagates errors.
  mockPrisma.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(mockPrisma));

  const mockUnitsService = { findAll: vi.fn(), findOne: vi.fn(), findByOrganization: vi.fn(), getDevices: vi.fn() };
  const mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
  const mockSkillService = {};

  beforeEach(async () => {
    const mockGateway = {
      broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined),
      broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined),
      server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
    };
    const mockNotificationEvent = {
      assignmentCreated: vi.fn().mockResolvedValue(undefined),
      assignmentRemoved: vi.fn().mockResolvedValue(undefined),
    };
    const mockMetrics = {
      authLoginTotal: { inc: vi.fn() },
      authLoginDuration: { observe: vi.fn() },
      httpRequestsTotal: { inc: vi.fn() },
      httpRequestDuration: { observe: vi.fn() },
      httpInFlightRequests: { inc: vi.fn(), dec: vi.fn() },
      wsConnectionsGauge: { inc: vi.fn(), dec: vi.fn() },
      wsEventsTotal: { inc: vi.fn() },
      wsErrorsTotal: { inc: vi.fn() },
      shiftCreatedTotal: { inc: vi.fn() },
      swapRequestTotal: { inc: vi.fn() },
      notificationDeliveredTotal: { inc: vi.fn() },
      notificationFailedTotal: { inc: vi.fn() },
      dbQueryDuration: { observe: vi.fn() },
      dbSlowQueriesTotal: { inc: vi.fn() },
      dbQueriesTotal: { inc: vi.fn() },
      incidentCreatedTotal: { inc: vi.fn() },
    };
    const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
    const mockUnitScope = {
      resolveScope: vi.fn().mockResolvedValue({ strictUnitId: null, organizationId: 'org-1', role: 'supervisor' }),
      isStrictlyUnitScoped: vi.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        SchedulesWorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: UnitsService, useValue: mockUnitsService },
        { provide: ScheduleGateway, useValue: mockGateway },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: SkillService, useValue: mockSkillService },
        { provide: UnitScopeService, useValue: mockUnitScope },
        { provide: PersonnelAvailabilityService, useValue: { resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map()) } },
        { provide: ScheduleCoverageService, useValue: { evaluateScheduleCoverage: vi.fn().mockResolvedValue({ lines: [], underCoverage: [], requiredSlots: 0, assignedSlots: 0, coveragePercent: 100, allCovered: true, uncoveredDates: [] }) } },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    workflow = module.get<SchedulesWorkflowService>(SchedulesWorkflowService);
    prisma = module.get<PrismaService>(PrismaService);
    auditLog = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockValidDeviceAssignmentPath(scheduleId = 'schedule-1') {
    mockPrisma.personnel.findUnique.mockResolvedValue({
      id: 'personnel-1', role: 'technician', offDays: [], isActive: true,
      nightShiftEligible: true, unitId: 'unit-1', groupId: 'group-1', name: 'Person A',
    });
    mockPrisma.assignment.findFirst.mockResolvedValue(null);
    mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', workDays: [], name: 'MR-A', code: 'MR-A', isActive: true });
    mockPrisma.deviceOffDate.findFirst.mockResolvedValue(null);
    // Used by addAssignment's schedule lookup and the trailing findByUnitType.
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      unit: { type: 'mr', organizationId: 'org-1' },
      createdBy: { id: 'user-1', organizationId: 'org-1' },
      month: 5,
      year: 2026,
    });
    mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', type: 'mr', organizationId: 'org-1' });
    mockPrisma.schedule.findFirst.mockResolvedValue({ id: scheduleId, unit: { type: 'mr' }, month: 5, year: 2026, assignments: [] });
    mockUnitsService.getDevices.mockResolvedValue([{ id: 'device-1', code: 'MR-A', name: 'MR-A', mode: 'primary', blockCode: 'A', isMaster: true }]);
    mockPrisma.shifts.findMany.mockResolvedValue([]);
  }

  describe('P0-1 Atomicity — assignment mutations use a single $transaction', () => {
    it('addAssignment persists assignment.create + schedule.version bump in one transaction', async () => {
      mockValidDeviceAssignmentPath();
      mockPrisma.assignment.create.mockResolvedValue({ id: 'assignment-1' });
      mockPrisma.schedule.update.mockResolvedValue({ id: 'schedule-1' });

      await service.addAssignment('schedule-1', {
        personnelId: 'personnel-1', deviceId: 'device-1', date: '2026-05-01',
        shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician',
      }, 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assignment.create).toHaveBeenCalled();
      expect(mockPrisma.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { version: { increment: 1 } } }),
      );
    });

    it('addAssignment: when the transaction fails, side-effects never run (all-or-nothing)', async () => {
      mockValidDeviceAssignmentPath();
      mockPrisma.assignment.create.mockResolvedValue({ id: 'assignment-1' });
      mockPrisma.schedule.update.mockRejectedValue(new Error('version-bump-failed'));

      await expect(
        service.addAssignment('schedule-1', {
          personnelId: 'personnel-1', deviceId: 'device-1', date: '2026-05-01',
          shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician',
        }, 'user-1'),
      ).rejects.toThrow('version-bump-failed');

      // The failed transaction must gate all post-commit side-effects.
      expect(mockAuditLog.log).not.toHaveBeenCalled();
    });

    it('update (bulk replacement): deleteMany + createMany + version bump share one transaction', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1', version: 1 });
      mockPrisma.assignment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.schedule.update.mockResolvedValue({ id: 'schedule-1', version: 2, assignments: [] });
      mockPrisma.assignment.findFirst.mockResolvedValue(null);
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', workDays: [], name: 'MR-A', code: 'MR-A', isActive: true });
      mockPrisma.deviceOffDate.findFirst.mockResolvedValue(null);

      await service.update('schedule-1', {
        status: 'published',
        assignments: [{ personnelId: 'personnel-1', deviceId: 'device-1', date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' }],
      } as any, 'user-1', 1);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
      expect(mockPrisma.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }),
      );
    });

    it('removeAssignment persists delete + version bump in one transaction', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue({
        id: 'assignment-1', scheduleId: 'schedule-1', personnel: { id: 'personnel-1', name: 'Person A' },
      });
      mockPrisma.schedule.findUnique.mockResolvedValueOnce({ id: 'schedule-1', unit: { type: 'mr' }, unitId: 'unit-1', month: 5, year: 2026 });
      mockPrisma.assignment.delete.mockResolvedValue({ id: 'assignment-1' });
      mockPrisma.schedule.update.mockResolvedValue({ id: 'schedule-1' });
      // findByUnitType (trailing re-fetch)
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', type: 'mr', organizationId: 'org-1' });
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'schedule-1', unit: { type: 'mr' }, month: 5, year: 2026, assignments: [] });
      mockUnitsService.getDevices.mockResolvedValue([{ id: 'device-1', code: 'MR-A', name: 'MR-A', mode: 'primary', blockCode: 'A', isMaster: true }]);
      mockPrisma.shifts.findMany.mockResolvedValue([]);

      await service.removeAssignment('schedule-1', 'assignment-1', 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assignment.delete).toHaveBeenCalled();
      expect(mockPrisma.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { version: { increment: 1 } } }),
      );
    });
  });

  describe('P0-3 Auditability — previously unaudited mutations now log', () => {
    it('updateAssignment writes an UPDATE audit event with before/after', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue({
        id: 'assignment-1', scheduleId: 'schedule-1', personnelId: 'personnel-1', deviceId: 'device-1',
        unitId: null, personnelGroupId: null, shiftTemplateId: null, kind: 'device', date: '2026-05-01',
        shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician',
        schedule: { unit: { type: 'mr' }, month: 5, year: 2026 },
      });
      mockPrisma.personnel.findUnique.mockResolvedValue({
        id: 'personnel-1', role: 'technician', offDays: [], isActive: true, nightShiftEligible: true, unitId: 'unit-1', groupId: 'group-1', name: 'Person A',
      });
      mockPrisma.assignment.findFirst.mockResolvedValue(null);
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', workDays: [], name: 'MR-A', code: 'MR-A', isActive: true });
      mockPrisma.deviceOffDate.findFirst.mockResolvedValue(null);
      mockPrisma.assignment.update.mockResolvedValue({
        id: 'assignment-1', scheduleId: 'schedule-1', personnelId: 'personnel-1', deviceId: 'device-1', kind: 'device',
      });
      mockPrisma.schedule.update.mockResolvedValue({ id: 'schedule-1' });
      mockUnitsService.getDevices.mockResolvedValue([{ id: 'device-1', code: 'MR-A', name: 'MR-A', mode: 'primary', blockCode: 'A', isMaster: true }]);
      mockPrisma.shifts.findMany.mockResolvedValue([]);
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', type: 'mr', organizationId: 'org-1' });
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'schedule-1', unit: { type: 'mr' }, month: 5, year: 2026, assignments: [] });

      await service.updateAssignment('schedule-1', 'assignment-1', { startTime: '09:00', endTime: '17:00' }, 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'UPDATE',
          entityType: 'assignment',
          entityId: 'assignment-1',
        }),
      );
    });

    it('duplicate creates schedule + assignments atomically and writes a CREATE audit event', async () => {
      const source = {
        id: 'schedule-1', unitId: 'unit-1',
        assignments: [{ id: 'a1', scheduleId: 'schedule-1', personnelId: 'personnel-1', deviceId: null, kind: 'person', date: '2026-05-01', shiftType: 'day', startTime: '08:00', endTime: '16:00', unitId: 'unit-1', personnelGroupId: 'group-1', shiftTemplateId: 't1' }],
        month: 5, year: 2026, status: 'draft', createdById: 'user-1',
      };
      mockPrisma.schedule.findUnique.mockResolvedValue(source);
      mockPrisma.schedule.create.mockResolvedValue({ id: 'schedule-2', unitId: 'unit-1', month: 6, year: 2026, status: 'draft' });
      mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });

      await service.duplicate('schedule-1', 6, 2026, 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
      expect(mockPrisma.schedule.create).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CREATE',
          entityType: 'schedule',
          entityId: 'schedule-2',
        }),
      );
    });
  });

  describe('P0-1 Atomicity — workflow rollback', () => {
    it('workflow rollback runs deleteMany + createMany + version bump inside $transaction', async () => {
      const user = { id: 'user-1', email: 'u@x.com', name: 'U', role: 'supervisor', organizationId: 'org-1' };
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1', status: 'draft', version: 5 });
      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue({
        id: 'snap-1', scheduleId: 'schedule-1', version: 3,
        data: { assignments: [{ personnelId: 'p1', deviceId: null, kind: 'person', date: '2026-05-01', shiftType: 'day', startTime: '08:00', endTime: '16:00', unitId: 'unit-1', personnelGroupId: 'g1', shiftTemplateId: 't1' }] },
      });
      mockPrisma.assignment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.schedule.updateMany.mockResolvedValue({ count: 1 });
      // createSnapshot() reads schedule + last snapshot + creates snapshot
      mockPrisma.scheduleSnapshot.create.mockResolvedValue({ id: 'snap-2' });

      const res = await workflow.rollback('schedule-1', 3, user, 'hata düzeltme');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
      expect(mockPrisma.schedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'schedule-1', version: 5 },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
      expect(res.success).toBe(true);
      expect(mockAuditLog.log).toHaveBeenCalled();
    });
  });
});
