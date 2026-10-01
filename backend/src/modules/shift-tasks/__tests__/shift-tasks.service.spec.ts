import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ShiftTasksService } from '../shift-tasks.service';
import { PrismaService } from '../../../prisma.service';

describe('ShiftTasksService', () => {
  let service: ShiftTasksService;

  const mockPrisma = {
    shiftTask: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftTasksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ShiftTasksService>(ShiftTasksService);
  });

  const fakeTasks = [
    {
      id: 't1',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'calibration',
      label: 'Kalibrasyon Kontrolü',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't2',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'device_startup',
      label: 'Cihaz Açılış Kontrolü',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't3',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'handover',
      label: 'Devir Teslim Notu',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't4',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'portable_imaging',
      label: 'Portable Görüntüleme',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't5',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'room_prep',
      label: 'Oda Hazırlığı',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't6',
      userId: 'user-1',
      date: '2026-05-30',
      taskType: 'shutdown',
      label: 'Kapatma Kontrolü',
      status: 'pending',
      completedAt: null,
    },
  ];

  describe('getDefaultTasks', () => {
    it('should return 6 default tasks for a user/date', async () => {
      mockPrisma.shiftTask.upsert.mockResolvedValue({});
      mockPrisma.shiftTask.findMany.mockResolvedValue(fakeTasks);
      const result = await service.getDefaultTasks('user-1', '2026-05-30');
      expect(result).toHaveLength(6);
      expect(result.map((t: any) => t.taskType).sort()).toEqual([
        'calibration',
        'device_startup',
        'handover',
        'portable_imaging',
        'room_prep',
        'shutdown',
      ]);
      expect(mockPrisma.shiftTask.upsert).toHaveBeenCalledTimes(6);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update a task to completed', async () => {
      const existing = {
        id: 't2',
        userId: 'user-1',
        date: '2026-05-30',
        taskType: 'device_startup',
        label: 'Cihaz Açılış Kontrolü',
        status: 'pending',
        completedAt: null,
      };
      const updated = {
        ...existing,
        status: 'completed',
        completedAt: new Date(),
      };
      mockPrisma.shiftTask.findUnique.mockResolvedValue(existing);
      mockPrisma.shiftTask.update.mockResolvedValue(updated);
      const result = await service.updateTaskStatus(
        'user-1',
        't2',
        'completed',
      );
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockPrisma.shiftTask.findUnique).toHaveBeenCalledWith({
        where: { id: 't2' },
      });
      expect(mockPrisma.shiftTask.update).toHaveBeenCalledWith({
        where: { id: 't2', userId: 'user-1' },
        data: { status: 'completed', completedAt: expect.any(Date) },
      });
    });
  });

  describe('getProgress', () => {
    it('should return correct completion counts', async () => {
      const completedTasks = fakeTasks.map((t, i) =>
        i < 2 ? { ...t, status: 'completed', completedAt: new Date() } : t,
      );
      mockPrisma.shiftTask.findMany.mockResolvedValue(completedTasks);
      const result = await service.getProgress('user-1', '2026-05-30');
      expect(result.completed).toBe(2);
      expect(result.total).toBe(6);
      expect(result.percentage).toBe(33);
    });

    it('should return 0/6 if nothing completed', async () => {
      mockPrisma.shiftTask.findMany.mockResolvedValue(fakeTasks);
      const result = await service.getProgress('user-1', '2026-05-30');
      expect(result.completed).toBe(0);
      expect(result.total).toBe(6);
      expect(result.percentage).toBe(0);
    });
  });
});
