import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DeviceStatusService } from '../device-status.service';
import { PrismaService } from '../../../prisma.service';

describe('DeviceStatusService', () => {
  let service: DeviceStatusService;

  const mockPrisma = {
    deviceStatusLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    device: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceStatusService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<DeviceStatusService>(DeviceStatusService);
  });

  describe('updateStatus', () => {
    it('should create a status log entry', async () => {
      const fakeLog = {
        id: 'log-1',
        deviceId: 'device-1',
        userId: 'user-1',
        status: 'active',
        notes: 'All good',
        createdAt: new Date(),
      };
      mockPrisma.deviceStatusLog.create.mockResolvedValue(fakeLog);

      const result = await service.updateStatus(
        'user-1',
        'device-1',
        'active',
        'All good',
      );

      expect(result).toEqual(fakeLog);
      expect(mockPrisma.deviceStatusLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          deviceId: 'device-1',
          status: 'active',
          notes: 'All good',
        },
      });
    });
  });

  describe('getCurrentStatus', () => {
    it('should return the latest status for a device', async () => {
      const fakeLog = {
        id: 'log-2',
        deviceId: 'device-1',
        userId: 'user-1',
        status: 'maintenance',
        notes: null,
        createdAt: new Date(),
      };
      mockPrisma.deviceStatusLog.findFirst.mockResolvedValue(fakeLog);

      const result = await service.getCurrentStatus('device-1');

      expect(result).toEqual(fakeLog);
      expect(mockPrisma.deviceStatusLog.findFirst).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return null when no status log exists', async () => {
      mockPrisma.deviceStatusLog.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentStatus('device-unknown');
      expect(result).toBeNull();
    });
  });

  describe('getStatusHistory', () => {
    it('should return entries in reverse chronological order', async () => {
      const fakeLogs = [
        {
          id: 'log-3',
          deviceId: 'device-1',
          userId: 'user-1',
          status: 'active',
          notes: null,
          createdAt: new Date('2026-05-30T10:00:00Z'),
        },
        {
          id: 'log-2',
          deviceId: 'device-1',
          userId: 'user-1',
          status: 'maintenance',
          notes: null,
          createdAt: new Date('2026-05-30T09:00:00Z'),
        },
        {
          id: 'log-1',
          deviceId: 'device-1',
          userId: 'user-1',
          status: 'fault',
          notes: 'Error',
          createdAt: new Date('2026-05-30T08:00:00Z'),
        },
      ];
      mockPrisma.deviceStatusLog.findMany.mockResolvedValue(fakeLogs);

      const result = await service.getStatusHistory('device-1', 3);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('log-3');
      expect(result[1].id).toBe('log-2');
      expect(result[2].id).toBe('log-1');
      expect(mockPrisma.deviceStatusLog.findMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
    });
  });

  describe('getMyUnitDevices', () => {
    it('should include latest status for each device', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ unitId: 'unit-1' });

      const devices = [
        { id: 'device-1', name: 'Device A', code: 'DA-01', unitId: 'unit-1' },
        { id: 'device-2', name: 'Device B', code: 'DB-01', unitId: 'unit-1' },
      ];
      mockPrisma.device.findMany.mockResolvedValue(devices);

      const statusLogs = [
        {
          deviceId: 'device-1',
          status: 'active',
          notes: null,
          createdAt: new Date(),
        },
        {
          deviceId: 'device-2',
          status: 'fault',
          notes: 'Broken',
          createdAt: new Date(),
        },
      ];
      mockPrisma.deviceStatusLog.findMany.mockResolvedValue(statusLogs);

      const result = await service.getMyUnitDevices('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('device-1');
      expect(result[0].latestStatus).toEqual(statusLogs[0]);
      expect(result[1].id).toBe('device-2');
      expect(result[1].latestStatus).toEqual(statusLogs[1]);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { unitId: true },
      });
    });

    it('should throw NotFoundException if user has no unit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ unitId: null });
      await expect(service.getMyUnitDevices('user-1')).rejects.toThrow(
        'User has no unit assigned',
      );
    });
  });
});
