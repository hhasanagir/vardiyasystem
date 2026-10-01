import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AttendanceService } from '../attendance.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrisma = {
    attendanceRecord: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockGateway = {
    broadcastDeviceIncident: vi.fn(),
    server: { to: vi.fn().mockReturnThis(), emit: vi.fn() },
  };

  const mockNotificationEvent = {
    clockedIn: vi.fn().mockResolvedValue(undefined),
    clockedOut: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScheduleGateway, useValue: mockGateway },
        { provide: NotificationEventService, useValue: mockNotificationEvent },
      ],
    }).compile();
    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('getTodayStatus', () => {
    it('should return none status when no record exists', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      const result = await service.getTodayStatus('user-1');
      expect(result.status).toBe('none');
    });

    it('should return active status when clocked in', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        userId: 'user-1',
        date: new Date().toISOString().split('T')[0],
        status: 'active',
        clockIn: new Date(),
        clockOut: null,
        assignment: null,
      });
      const result = await service.getTodayStatus('user-1');
      expect(result.status).toBe('active');
      expect(result.clockIn).toBeTruthy();
    });
  });

  describe('clockIn', () => {
    it('should create attendance record on first clock-in', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.upsert.mockResolvedValue({
        id: 'rec-1',
        userId: 'user-1',
        date: new Date().toISOString().split('T')[0],
        status: 'active',
        clockIn: new Date(),
        clockOut: null,
        assignmentId: null,
        notes: null,
        ipAddress: null,
      });
      const result = await service.clockIn('user-1', {});
      expect(result.status).toBe('active');
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalled();
    });

    it('should throw when already clocked in', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        userId: 'user-1',
        date: new Date().toISOString().split('T')[0],
        status: 'active',
        clockIn: new Date(),
        clockOut: null,
        assignment: null,
      });
      await expect(service.clockIn('user-1', {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('clockOut', () => {
    it('should complete attendance on clock-out', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        userId: 'user-1',
        date: new Date().toISOString().split('T')[0],
        status: 'active',
        clockIn: new Date(),
        clockOut: null,
        notes: null,
      });
      mockPrisma.attendanceRecord.update.mockResolvedValue({
        id: 'rec-1',
        status: 'completed',
        clockIn: new Date(),
        clockOut: new Date(),
        notes: null,
      });
      const result = await service.clockOut('user-1', {});
      expect(result.status).toBe('completed');
    });

    it('should throw when no clock-in record', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      await expect(service.clockOut('user-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw when already clocked out', async () => {
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        status: 'completed',
        clockIn: new Date(),
        clockOut: new Date(),
        notes: null,
      });
      await expect(service.clockOut('user-1', {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getMonthlyStats', () => {
    it('should return zero stats when no records', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      const result = await service.getMonthlyStats('user-1', 5, 2026);
      expect(result.totalDays).toBe(0);
      expect(result.totalHours).toBe(0);
    });
  });
});
