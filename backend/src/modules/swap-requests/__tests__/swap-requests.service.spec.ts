import { Test, TestingModule } from '@nestjs/testing';
import { SwapRequestsService } from '../swap-requests.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { EventBusService } from '../../../events/event-bus.service';
import { ScheduleValidationService } from '../../schedules/schedule-validation.service';
import { ConflictException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SwapRequestsService', () => {
  let service: SwapRequestsService;
  let prisma: PrismaService;
  let scheduleValidation: { validateAssignment: ReturnType<typeof vi.fn> };

  const mockPrisma = {
    swapRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    assignment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    personnel: {
      findUnique: vi.fn(),
    },
    schedule: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const mockAuditLog = {
    log: vi.fn(),
  };

  const mockNotificationEvent = {
    swapSubmitted: vi.fn().mockResolvedValue(undefined),
    swapAccepted: vi.fn().mockResolvedValue(undefined),
    swapRejected: vi.fn().mockResolvedValue(undefined),
  };

  const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1' });
    mockPrisma.swapRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.assignment.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwapRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: ScheduleValidationService, useValue: { validateAssignment: vi.fn() } },
      ],
    }).compile();

    service = module.get<SwapRequestsService>(SwapRequestsService);
    prisma = module.get<PrismaService>(PrismaService);
    scheduleValidation = module.get<ScheduleValidationService>(ScheduleValidationService) as any;

    vi.clearAllMocks();
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1' });
    mockPrisma.swapRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.assignment.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(mockPrisma));
  });

  describe('findAll', () => {
    it('should return all swap requests', async () => {
      const mockRequests = [
        { id: '1', status: 'PENDING', requesterId: 'user-1' },
        { id: '2', status: 'APPROVED', requesterId: 'user-2' },
      ];

      mockPrisma.swapRequest.findMany.mockResolvedValue(mockRequests);

      const result = await service.findAll({});

      expect(result).toEqual(mockRequests);
      expect(mockPrisma.swapRequest.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by status', async () => {
      mockPrisma.swapRequest.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'PENDING' });

      expect(mockPrisma.swapRequest.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a swap request by id', async () => {
      const mockRequest = { id: '1', status: 'pending' };
      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findOne('1');

      expect(result).toEqual(mockRequest);
    });

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne / findAll scope (Phase 5C.9)', () => {
    it('findOne with unit scope denies a swap whose schedule unit differs', async () => {
      const mockRequest = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', organizationId: 'org-1' };
      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({
        schedule: { unitId: 'unit-B', organizationId: 'org-1' },
      });

      await expect(service.findOne('1', { unitId: 'unit-A' })).rejects.toThrow(ForbiddenException);
    });

    it('findOne with unit scope allows a swap whose schedule unit matches', async () => {
      const mockRequest = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', organizationId: 'org-1' };
      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({
        schedule: { unitId: 'unit-A', organizationId: 'org-1' },
      });

      const result = await service.findOne('1', { unitId: 'unit-A' });
      expect(result!.id).toBe('1');
    });

    it('findOne with organization scope denies a cross-org swap', async () => {
      const mockRequest = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', organizationId: 'org-1' };
      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({
        schedule: { unitId: 'unit-A', organizationId: 'org-other' },
      });

      await expect(service.findOne('1', { organizationId: 'org-1' })).rejects.toThrow(ForbiddenException);
    });

    it('findAll with unit scope filters by the swap schedule unitId', async () => {
      mockPrisma.swapRequest.findMany.mockResolvedValue([{ id: '1' }]);

      const result = await service.findAll({}, { unitId: 'unit-A', organizationId: 'org-1' });

      expect(mockPrisma.swapRequest.findMany).toHaveBeenCalledWith({
        where: { fromAssignment: { schedule: { unitId: 'unit-A' } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('findAll with org scope filters by the swap schedule organizationId', async () => {
      mockPrisma.swapRequest.findMany.mockResolvedValue([]);

      await service.findAll({}, { unitId: null, organizationId: 'org-1' });

      expect(mockPrisma.swapRequest.findMany).toHaveBeenCalledWith({
        where: { fromAssignment: { schedule: { organizationId: 'org-1' } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('should create a new swap request', async () => {
      const dto = {
        requesterId: 'user-1',
        fromAssignmentId: 'shift-1',
        organizationId: 'org-1',
        unitId: 'unit-1',
      };

      const mockRequest = { id: 'request-1', ...dto, status: 'pending' };
      mockPrisma.swapRequest.create.mockResolvedValue(mockRequest);

      const result = await service.create(dto);

      expect(result).toEqual(mockRequest);
      expect(mockPrisma.swapRequest.create).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('should approve a pending swap request', async () => {
      const mockRequest = { id: '1', status: 'PENDING', fromAssignmentId: 'assign-1' };
      const updatedRequest = { id: '1', status: 'APPROVED', fromAssignmentId: 'assign-1' };

      mockPrisma.swapRequest.findUnique
        .mockResolvedValueOnce(mockRequest)
        .mockResolvedValueOnce(updatedRequest);
      mockPrisma.swapRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({ id: 'assign-1', scheduleId: 'sd', date: '2024-01-15', schedule: { unit: { organizationId: 'org-1' } } });

      const result = await service.approve('1', 'admin-1');

      expect(result!.status).toBe('APPROVED');
      expect(mockPrisma.swapRequest.updateMany).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue(null);

      await expect(service.approve('non-existent', 'admin-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException if request is not pending', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue({ id: '1', status: 'APPROVED' });

      await expect(service.approve('1', 'admin-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approve - validation of resulting assignments (STEP 3 hardening)', () => {
    function blockingReport() {
      return { hasBlocking: true, violations: [{ rule: 'UNIT_CLOSED', severity: 'BLOCKING', isOverrideAllowed: false }] };
    }
    function cleanReport() {
      return { hasBlocking: false, violations: [] };
    }

    it('rejects an exchange when the resulting state violates a BLOCKING rule (no mutation happens)', async () => {
      const request = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', toAssignmentId: 'ta' };
      const fromAssignment = { id: 'fa', scheduleId: 'sd', personnelId: 'p1', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };
      const toAssignment = { id: 'ta', scheduleId: 'sd', personnelId: 'p2', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };

      mockPrisma.swapRequest.findUnique.mockResolvedValue(request);
      mockPrisma.assignment.findUnique.mockResolvedValueOnce(fromAssignment).mockResolvedValueOnce(toAssignment);
      scheduleValidation.validateAssignment.mockResolvedValue(blockingReport());

      await expect(service.approve('1', 'admin-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.assignment.update).not.toHaveBeenCalled();
    });

    it('rejects a direct swap when the resulting assignment violates a BLOCKING rule', async () => {
      const request = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', targetPersonnelId: 'tp' };
      const fromAssignment = { id: 'fa', scheduleId: 'sd', personnelId: 'p1', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };

      mockPrisma.swapRequest.findUnique.mockResolvedValue(request);
      mockPrisma.assignment.findUnique.mockResolvedValue(fromAssignment);
      scheduleValidation.validateAssignment.mockResolvedValue(blockingReport());

      await expect(service.approve('1', 'admin-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('validates the resulting state for BOTH sides of an exchange and persists both when clean', async () => {
      const request = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', toAssignmentId: 'ta' };
      const fromAssignment = { id: 'fa', scheduleId: 'sd', personnelId: 'p1', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };
      const toAssignment = { id: 'ta', scheduleId: 'sd', personnelId: 'p2', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };

      mockPrisma.swapRequest.findUnique
        .mockResolvedValueOnce(request)
        .mockResolvedValue({ ...request, status: 'APPROVED' });
      mockPrisma.assignment.findUnique.mockResolvedValueOnce(fromAssignment).mockResolvedValueOnce(toAssignment);
      scheduleValidation.validateAssignment.mockResolvedValue(cleanReport());

      const result = await service.approve('1', 'admin-1');

      expect(scheduleValidation.validateAssignment).toHaveBeenCalledTimes(2);
      expect(mockPrisma.assignment.update).toHaveBeenCalledTimes(2);
      expect(result!.status).toBe('APPROVED');
    });

    it('atomically claims PENDING within the transaction: a second concurrent approve fails without partial mutation', async () => {
      const request = { id: '1', status: 'PENDING', fromAssignmentId: 'fa', targetPersonnelId: 'tp' };
      const fromAssignment = { id: 'fa', scheduleId: 'sd', personnelId: 'p1', deviceId: 'dev-1', unitId: null, date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00' };

      // Both reconcilers read the request as PENDING (stale read), but only the
      // first can claim it at the DB level (updateMany count 1); the second gets 0.
      mockPrisma.swapRequest.findUnique.mockResolvedValue(request);
      mockPrisma.assignment.findUnique.mockResolvedValue(fromAssignment);
      scheduleValidation.validateAssignment.mockResolvedValue(cleanReport());
      mockPrisma.swapRequest.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.approve('1', 'admin-1');

      await expect(service.approve('1', 'admin-1')).rejects.toThrow(ConflictException);
      // only the first approve actually mutated (one assignment update total)
      expect(mockPrisma.assignment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.swapRequest.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('reject', () => {
    it('should reject a pending swap request', async () => {
      const mockRequest = { id: '1', status: 'PENDING', fromAssignmentId: 'assign-1' };
      const updatedRequest = { id: '1', status: 'REJECTED', fromAssignmentId: 'assign-1' };

      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.swapRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({ date: '2024-01-15', schedule: { unit: { organizationId: 'org-1' } } });

      const result = await service.reject('1', 'admin-1');

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.swapRequest.update).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a swap request', async () => {
      const mockRequest = { id: '1', requesterId: 'user-1', status: 'pending' };
      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.swapRequest.delete.mockResolvedValue(mockRequest);

      const result = await service.delete('1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.swapRequest.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue(null);

      await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
