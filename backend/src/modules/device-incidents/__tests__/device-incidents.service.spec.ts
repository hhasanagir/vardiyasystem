import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DeviceIncidentsService } from '../device-incidents.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { AlertingService } from '../../../alerting/alerting.service';
import { EventBusService } from '../../../events/event-bus.service';
import { NotFoundException } from '@nestjs/common';

describe('DeviceIncidentsService', () => {
  let service: DeviceIncidentsService;

  const mockPrisma = {
    unit: { findUnique: vi.fn() },
    device: { findUnique: vi.fn() },
    deviceIncident: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: { findMany: vi.fn() },
  };

  const mockGateway = {
    broadcastDeviceIncident: vi.fn(),
  };

  const mockNotificationEvent = {
    incidentCritical: vi.fn().mockResolvedValue(undefined),
  };

  const mockAlerting = {
    sendAlert: vi.fn().mockResolvedValue(undefined),
  };

  const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceIncidentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScheduleGateway, useValue: mockGateway },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
        { provide: AlertingService, useValue: mockAlerting },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    service = module.get<DeviceIncidentsService>(DeviceIncidentsService);
  });

  describe('create', () => {
    const createDto = {
      unitId: 'unit-1',
      deviceId: 'device-1',
      issueType: 'arıza',
      severity: 'critical',
      description: 'Cihaz çalışmıyor',
    };

    const mockUnit = { id: 'unit-1', name: 'MR', organizationId: 'org-1' };
    const mockDevice = { id: 'device-1', name: 'MR Cihazı', code: 'MR01' };

    it('should create a device incident successfully', async () => {
      const created = {
        id: 'incident-1',
        ...createDto,
        userId: 'user-1',
        status: 'open',
        reportedAt: new Date(),
        unit: mockUnit,
        device: mockDevice,
        user: { id: 'user-1', name: 'Tekniker', role: 'technician' },
      };

      mockPrisma.unit.findUnique.mockResolvedValue(mockUnit);
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.deviceIncident.create.mockResolvedValue(created);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.create('user-1', createDto as any);

      expect(result).toBeDefined();
      expect(result.id).toBe('incident-1');
      expect(result.status).toBe('open');
      expect(mockPrisma.deviceIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          issueType: 'arıza',
          severity: 'critical',
        }),
        include: expect.any(Object),
      });
    });

    it('should create notification for critical incidents', async () => {
      const created = {
        id: 'incident-2',
        ...createDto,
        userId: 'user-1',
        status: 'open',
        reportedAt: new Date(),
        unit: mockUnit,
        device: mockDevice,
        user: { id: 'user-1', name: 'Tekniker', role: 'technician' },
      };

      mockPrisma.unit.findUnique.mockResolvedValue(mockUnit);
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.deviceIncident.create.mockResolvedValue(created);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'mgr-1' },
        { id: 'mgr-2' },
      ]);

      await service.create('user-1', createDto as any);

      expect(mockNotificationEvent.incidentCritical).toHaveBeenCalled();
      expect(mockGateway.broadcastDeviceIncident).toHaveBeenCalled();
    });

    it('should not create notification for low severity incidents', async () => {
      const lowDto = { ...createDto, severity: 'low' };
      const created = {
        id: 'incident-3',
        ...lowDto,
        userId: 'user-1',
        status: 'open',
        reportedAt: new Date(),
        unit: mockUnit,
        device: mockDevice,
        user: { id: 'user-1', name: 'Tekniker', role: 'technician' },
      };

      mockPrisma.unit.findUnique.mockResolvedValue(mockUnit);
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.deviceIncident.create.mockResolvedValue(created);

      await service.create('user-1', lowDto as any);

      expect(mockNotificationEvent.incidentCritical).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return filtered incidents', async () => {
      const mockIncidents = [
        { id: 'i1', issueType: 'arıza', severity: 'high', status: 'open' },
        { id: 'i2', issueType: 'bakım', severity: 'low', status: 'resolved' },
      ];
      mockPrisma.deviceIncident.findMany.mockResolvedValue(mockIncidents);
      mockPrisma.deviceIncident.count.mockResolvedValue(2);

      const result = await service.findAll(undefined, {
        status: 'open',
        severity: 'high',
      } as any);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should apply status filter', async () => {
      mockPrisma.deviceIncident.findMany.mockResolvedValue([]);
      mockPrisma.deviceIncident.count.mockResolvedValue(0);

      await service.findAll(undefined, { status: 'open' } as any);

      expect(mockPrisma.deviceIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update incident status', async () => {
      const existing = { id: 'i1', status: 'open' };
      const updated = { id: 'i1', status: 'in_progress' };

      mockPrisma.deviceIncident.findUnique.mockResolvedValue(existing);
      mockPrisma.deviceIncident.update.mockResolvedValue(updated);

      const result = await service.updateStatus('i1', 'in_progress');

      expect(result.status).toBe('in_progress');
      expect(mockPrisma.deviceIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'i1' },
          data: { status: 'in_progress' },
        }),
      );
    });

    it('should throw when incident not found', async () => {
      mockPrisma.deviceIncident.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('nonexistent', 'closed'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
