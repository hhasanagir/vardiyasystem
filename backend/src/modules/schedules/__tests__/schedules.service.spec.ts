import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from '../schedules.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UnitsService } from '../../units/units.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { EventBusService } from '../../../events/event-bus.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let prisma: PrismaService;
  let auditLog: AuditLogService;

  const mockPrisma = {
    schedule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    assignment: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: any) => {
      return fn({
        assignment: {
          ...mockPrisma.assignment,
          findMany: vi.fn().mockResolvedValue([]),
        },
        schedule: mockPrisma.schedule,
        scheduleSnapshot: mockPrisma.scheduleSnapshot,
      });
    }),
    scheduleSnapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    unit: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    personnel: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    device: {
      count: vi.fn(),
    },
    shifts: {
      findMany: vi.fn(),
    },
    personnelGroup: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const mockUnitsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findByOrganization: vi.fn(),
    getDevices: vi.fn(),
  };

  const mockAuditLog = {
    log: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const mockWorkflowService = {
      submitForReview: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      publish: vi.fn(),
      archive: vi.fn(),
      rollback: vi.fn(),
      createRevision: vi.fn(),
      compareVersions: vi.fn(),
      getAuditLog: vi.fn(),
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
    const mockGateway = {
      broadcastPersonnelUpdate: vi.fn().mockResolvedValue(undefined),
      broadcastAlertUpdate: vi.fn().mockResolvedValue(undefined),
      server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
    };
    const mockNotificationEvent = {
      assignmentCreated: vi.fn().mockResolvedValue(undefined),
      assignmentRemoved: vi.fn().mockResolvedValue(undefined),
    };
    const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };

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
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    prisma = module.get<PrismaService>(PrismaService);
    auditLog = module.get<AuditLogService>(AuditLogService);

    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new schedule', async () => {
      const dto = { unitId: 'unit-1', month: 5, year: 2026 };
      const userId = 'user-1';
      const expectedSchedule = { id: 'schedule-1', ...dto, status: 'draft' };

      mockPrisma.schedule.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.create.mockResolvedValue(expectedSchedule);

      const result = await service.create(dto, userId);

      expect(result).toEqual(expectedSchedule);
      expect(mockPrisma.schedule.create).toHaveBeenCalledWith({
        data: {
          unitId: dto.unitId,
          month: dto.month,
          year: dto.year,
          status: 'draft',
          createdById: userId,
        },
        include: expect.any(Object),
      });
      expect(mockAuditLog.log).toHaveBeenCalled();
    });

    it('should throw ConflictException if schedule exists', async () => {
      const dto = { unitId: 'unit-1', month: 5, year: 2026 };
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return schedule with assignments', async () => {
      const schedule = {
        id: 'schedule-1',
        unitId: 'unit-1',
        month: 5,
        year: 2026,
      };
      mockPrisma.schedule.findUnique.mockResolvedValue(schedule);

      const result = await service.findOne('schedule-1');

      expect(result).toEqual(schedule);
    });

    it('should throw NotFoundException if schedule not found', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return filtered schedules', async () => {
      const schedules = [{ id: 'schedule-1' }, { id: 'schedule-2' }];
      mockPrisma.schedule.findMany.mockResolvedValue(schedules);

      const result = await service.findAll({ unitId: 'unit-1' });

      expect(result).toEqual(schedules);
      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith({
        where: { unitId: 'unit-1' },
        take: 100,
        skip: undefined,
        include: expect.any(Object),
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });
    });
  });

  describe('update', () => {
    it('should update schedule with optimistic locking', async () => {
      const schedule = { id: 'schedule-1', version: 1 };
      const updated = { ...schedule, version: 2 };

      mockPrisma.schedule.findUnique.mockResolvedValue(schedule);
      mockPrisma.schedule.update.mockResolvedValue(updated);

      const result = await service.update(
        'schedule-1',
        { status: 'published' },
        'user-1',
        1,
      );

      expect(result.version).toBe(2);
      expect(mockAuditLog.log).toHaveBeenCalled();
    });

    it('should throw ConflictException on version mismatch', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({
        id: 'schedule-1',
        version: 2,
      });

      await expect(
        service.update('schedule-1', { status: 'published' }, 'user-1', 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addAssignment', () => {
    const baseDto = {
      personnelId: 'personnel-1',
      deviceId: 'device-1',
      date: '2026-05-01',
      shiftType: 'day' as const,
      startTime: '08:00',
      endTime: '16:00',
    };

    const mockSchedule = {
      id: 'schedule-1',
      unit: { type: 'mr' as const, organizationId: 'org-1' },
      createdBy: { id: 'user-1', organizationId: 'org-1' },
      month: 5,
      year: 2026,
    };

    const mockValidPersonnel = {
      id: 'personnel-1',
      role: 'technician',
      offDays: [],
      isActive: true,
    };

    const mockFindByUnitTypeSuccess = () => {
      mockPrisma.unit.findFirst.mockResolvedValue({
        id: 'unit-1',
        type: 'mr',
        organizationId: 'org-1',
      });
      mockPrisma.schedule.findFirst.mockResolvedValue({
        id: 'schedule-1',
        unit: { type: 'mr' },
        month: 5,
        year: 2026,
        assignments: [],
      });
      mockUnitsService.getDevices.mockResolvedValue([
        {
          id: 'device-1',
          code: 'MR-A',
          name: 'MR-A',
          mode: 'primary',
          blockCode: 'A',
          isMaster: true,
        },
      ]);
      mockPrisma.shifts.findMany.mockResolvedValue([]);
    };

    it('should add assignment to schedule (rule D: valid personnel assigned)', async () => {
      const dto = { ...baseDto, personnelType: 'technician' };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.personnel.findUnique.mockResolvedValue(mockValidPersonnel);
      mockPrisma.assignment.findFirst.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue({
        id: 'assignment-1',
        ...dto,
      });
      mockPrisma.schedule.update.mockResolvedValue({ id: 'schedule-1' });
      mockFindByUnitTypeSuccess();

      const result = await service.addAssignment('schedule-1', dto, 'user-1');

      expect(mockPrisma.assignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          personnelId: 'personnel-1',
          deviceId: 'device-1',
          date: '2026-05-01',
          shiftType: 'day',
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('schedule-1');
    });

    it('should reject same person getting a second day shift the same day (rule A)', async () => {
      const dto = { ...baseDto, personnelType: 'technician' };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.personnel.findUnique.mockResolvedValue(mockValidPersonnel);
      mockPrisma.assignment.findFirst
        .mockResolvedValueOnce({ id: 'existing-day-shift' })
        .mockResolvedValue(null);

      await expect(
        service.addAssignment('schedule-1', dto, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    });

    it('should reject same person on two different slots the same day (rule B)', async () => {
      const dto = {
        ...baseDto,
        deviceId: 'device-2',
        personnelType: 'technician',
      };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.personnel.findUnique.mockResolvedValue(mockValidPersonnel);
      mockPrisma.assignment.findFirst
        .mockResolvedValueOnce({ id: 'existing-other-slot' })
        .mockResolvedValue(null);

      await expect(
        service.addAssignment('schedule-1', dto, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    });

    it('should reject device already booked for same personnelType (rule C)', async () => {
      const dto = { ...baseDto, personnelType: 'technician' };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.personnel.findUnique.mockResolvedValue(mockValidPersonnel);
      mockPrisma.assignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-device-booking' })
        .mockResolvedValue(null);

      await expect(
        service.addAssignment('schedule-1', dto, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    });

    it('should reject assignment of inactive personnel (rule C)', async () => {
      const dto = { ...baseDto, personnelType: 'technician' };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.personnel.findUnique.mockResolvedValue({
        id: 'personnel-1',
        role: 'technician',
        offDays: [],
        isActive: false,
      });
      mockPrisma.assignment.findFirst.mockResolvedValue(null);

      await expect(
        service.addAssignment('schedule-1', dto, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate assignment', async () => {
      const dto = { ...baseDto };

      mockPrisma.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.assignment.findFirst.mockResolvedValue({ id: 'existing' });
      mockPrisma.personnel.findUnique.mockResolvedValue(mockValidPersonnel);

      await expect(
        service.addAssignment('schedule-1', dto, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('rollback', () => {
    it('should rollback schedule to snapshot version', async () => {
      const snapshot = {
        id: 'snapshot-1',
        scheduleId: 'schedule-1',
        version: 1,
        data: { assignments: [{ id: 'a1', date: '2026-05-01' }] },
      };

      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(snapshot);
      mockPrisma.schedule.findUnique.mockResolvedValue({
        id: 'schedule-1',
        version: 3,
      });
      mockPrisma.assignment.deleteMany.mockResolvedValue({});
      mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.schedule.update.mockResolvedValue({
        id: 'schedule-1',
        version: 4,
      });

      const result = await service.rollback('schedule-1', 1, 'user-1');

      expect(result.version).toBe(4);
      expect(mockPrisma.assignment.createMany).toHaveBeenCalled();
    });

    it('should throw NotFoundException if snapshot not found', async () => {
      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(null);

      await expect(
        service.rollback('schedule-1', 999, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete schedule and log action', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 'schedule-1' });
      mockPrisma.schedule.delete.mockResolvedValue({ id: 'schedule-1' });

      const result = await service.delete('schedule-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.schedule.delete).toHaveBeenCalledWith({
        where: { id: 'schedule-1' },
      });
    });
  });
});
