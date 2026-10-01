import { Test, TestingModule } from '@nestjs/testing';
import { SwapRequestsService } from '../swap-requests.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { EventBusService } from '../../../events/event-bus.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SwapRequestsService', () => {
  let service: SwapRequestsService;
  let prisma: PrismaService;

  const mockPrisma = {
    swapRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    assignment: {
      findUnique: vi.fn(),
    },
    personnel: {
      findUnique: vi.fn(),
    },
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwapRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    service = module.get<SwapRequestsService>(SwapRequestsService);
    prisma = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
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

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
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
      const mockRequest = {
        id: '1',
        status: 'PENDING',
        fromAssignmentId: 'assign-1',
      };
      const updatedRequest = {
        id: '1',
        status: 'APPROVED',
        fromAssignmentId: 'assign-1',
      };

      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.swapRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({
        date: '2024-01-15',
        schedule: { unit: { organizationId: 'org-1' } },
      });

      const result = await service.approve('1', 'admin-1');

      expect(result!.status).toBe('APPROVED');
      expect(mockPrisma.swapRequest.update).toHaveBeenCalled();
      expect(mockAuditLog.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue(null);

      await expect(service.approve('non-existent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if request is not pending', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue({
        id: '1',
        status: 'APPROVED',
      });

      await expect(service.approve('1', 'admin-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending swap request', async () => {
      const mockRequest = {
        id: '1',
        status: 'PENDING',
        fromAssignmentId: 'assign-1',
      };
      const updatedRequest = {
        id: '1',
        status: 'REJECTED',
        fromAssignmentId: 'assign-1',
      };

      mockPrisma.swapRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.swapRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.assignment.findUnique.mockResolvedValue({
        date: '2024-01-15',
        schedule: { unit: { organizationId: 'org-1' } },
      });

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
      expect(mockPrisma.swapRequest.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if request not found', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue(null);

      await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
