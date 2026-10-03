import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../../prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma = {
    user: { count: vi.fn(), findMany: vi.fn() },
    personnel: { count: vi.fn(), findMany: vi.fn() },
    assignment: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    schedule: { findFirst: vi.fn(), findMany: vi.fn() },
    unit: { findMany: vi.fn(), findFirst: vi.fn() },
    device: { findMany: vi.fn(), count: vi.fn() },
    holiday: { findMany: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockPrisma.personnel.findMany.mockResolvedValue([]);
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    mockPrisma.device.findMany.mockResolvedValue([]);
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.personnel.count.mockResolvedValue(0);
    mockPrisma.assignment.count.mockResolvedValue(0);
    mockPrisma.user.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getOverview', () => {
    it('should return overview KPIs with zeros when no data exists', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([]);

      const result = await service.getOverview('org-1');

      expect(result).toBeDefined();
      expect(result.totalPersonnel).toBe(0);
      expect(result.totalShifts).toBe(0);
      expect(result.monthlyOvertime).toBe(0);
      expect(result.missingShifts).toBe(0);
      expect(result.nightShiftRatio).toBe(0);
      expect(result.busiestUnit).toBe('');
    });

    it('should compute night shift ratio correctly', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([
        {
          id: 'u1',
          name: 'MR',
          code: 'mr',
          type: 'mr',
          isActive: true,
          _count: { personnel: 10, devices: 0 },
          schedules: [
            {
              id: 's1',
              month: 5,
              year: 2026,
              status: 'published',
              assignments: [
                {
                  shiftType: 'night',
                  date: new Date('2026-05-01'),
                  personnel: { id: 'p1', name: 'Ahmet' },
                },
                {
                  shiftType: 'day',
                  date: new Date('2026-05-01'),
                  personnel: { id: 'p2', name: 'Mehmet' },
                },
              ],
            },
          ],
        },
      ]);

      const result = await service.getOverview('org-1', 5, 2026);

      expect(result.nightShiftRatio).toBeGreaterThan(0);
      expect(result.nightDistribution).toBeDefined();
    });

    it('should return busiest unit based on assignment count', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([
        {
          id: 'u1',
          name: 'MR',
          code: 'mr',
          type: 'mr',
          isActive: true,
          _count: { personnel: 5, devices: 0 },
          schedules: [
            {
              id: 's1',
              month: 5,
              year: 2026,
              status: 'published',
              assignments: [
                { shiftType: 'day', date: new Date(), personnel: { id: 'p1' } },
              ],
            },
          ],
        },
        {
          id: 'u2',
          name: 'BT',
          code: 'bt',
          type: 'bt',
          isActive: true,
          _count: { personnel: 3, devices: 0 },
          schedules: [
            {
              id: 's2',
              month: 5,
              year: 2026,
              status: 'published',
              assignments: [
                { shiftType: 'day', date: new Date(), personnel: { id: 'p2' } },
                {
                  shiftType: 'night',
                  date: new Date(),
                  personnel: { id: 'p3' },
                },
              ],
            },
          ],
        },
      ]);

      const result = await service.getOverview('org-1');

      expect(result.busiestUnit).toBe('BT');
    });
  });

  describe('getWorkload', () => {
    it('should return workload breakdown per personnel', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([{ id: 'u1' }]);
      mockPrisma.personnel.findMany.mockResolvedValue([
        { id: 'p1', name: 'Ahmet', role: 'technician', unitId: 'u1' },
        { id: 'p2', name: 'Mehmet', role: 'technician', unitId: 'u1' },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 's1', unitId: 'u1' },
      ]);
      mockPrisma.assignment.findMany.mockResolvedValue([
        { personnelId: 'p1', shiftType: 'day', date: new Date('2026-05-01') },
        { personnelId: 'p1', shiftType: 'night', date: new Date('2026-05-02') },
        { personnelId: 'p2', shiftType: 'day', date: new Date('2026-05-01') },
      ]);

      const result = await service.getWorkload('org-1');

      expect(result).toHaveLength(2);
      expect(result[0].personnelName).toBe('Ahmet');
      expect(result[0].totalShifts).toBe(2);
      expect(result[0].dayShifts).toBe(1);
      expect(result[0].nightShifts).toBe(1);
      expect(result[1].totalShifts).toBe(1);
    });
  });

  describe('getOvertimeRanking', () => {
    it('should return overtime ranking sorted by hours descending', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([{ id: 'u1' }]);
      mockPrisma.personnel.findMany.mockResolvedValue([
        { id: 'p1', name: 'Ali', role: 'technician', unitId: 'u1' },
        { id: 'p2', name: 'Veli', role: 'technician', unitId: 'u1' },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 's1', unitId: 'u1' },
      ]);
      mockPrisma.assignment.findMany.mockResolvedValue([
        { personnelId: 'p1', shiftType: 'day', date: new Date() },
        { personnelId: 'p1', shiftType: 'day', date: new Date() },
        { personnelId: 'p2', shiftType: 'day', date: new Date() },
      ]);

      const result = await service.getOvertimeRanking('org-1');

      expect(result).toHaveLength(2);
      expect(result[0].overtimeHours).toBeGreaterThanOrEqual(
        result[1].overtimeHours,
      );
    });

    it('should return empty array when no personnel', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([]);

      const result = await service.getOvertimeRanking('org-1');
      expect(result).toEqual([]);
    });
  });

  describe('getDeviceUtilization', () => {
    it('should return device utilization rates', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([{ id: 'u1', name: 'MR' }]);
      mockPrisma.device.findMany.mockResolvedValue([
        {
          id: 'd1',
          code: 'MR01',
          name: 'MR Cihazı 1',
          unitId: 'u1',
          mode: 'service',
          workDays: [1, 2, 3, 4, 5],
        },
        {
          id: 'd2',
          code: 'BT01',
          name: 'BT Cihazı 1',
          unitId: 'u1',
          mode: 'service',
          workDays: [1, 2, 3, 4, 5],
        },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([{ id: 's1' }]);
      mockPrisma.assignment.findMany.mockResolvedValue([
        { deviceId: 'd1' },
        { deviceId: 'd1' },
      ]);

      const result = await service.getDeviceUtilization('org-1');

      expect(result).toHaveLength(2);
      expect(result[0].deviceName).toBeDefined();
      expect(result[0].utilizationRate).toBeGreaterThanOrEqual(0);
    });

    it('should handle no devices gracefully', async () => {
      mockPrisma.unit.findMany.mockResolvedValue([]);

      const result = await service.getDeviceUtilization('org-1');
      expect(result).toEqual([]);
    });
  });
});
