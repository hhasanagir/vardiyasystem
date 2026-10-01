import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from '../shifts.service';
import { PrismaService } from '../../../prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ShiftType } from '@prisma/client';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: PrismaService;

  const mockPrisma = {
    shifts: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const orgId = 'org-1';
  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  const sampleShift = {
    id: 'shift-1',
    name: 'Gündüz Vardiyası',
    type: ShiftType.day,
    startTime: '08:00',
    endTime: '16:00',
    durationHours: 8,
    organizationId: orgId,
    unitId: null,
    deviceId: null,
    personnelType: null,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  describe('create', () => {
    it('should create a shift', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(null);
      mockPrisma.shifts.create.mockResolvedValue(sampleShift);

      const result = await service.create(
        {
          name: 'Gündüz Vardiyası',
          type: ShiftType.day,
          startTime: '08:00',
          endTime: '16:00',
          durationHours: 8,
          organizationId: orgId,
        },
        userId,
      );

      expect(result.id).toBe('shift-1');
      expect(result.name).toBe('Gündüz Vardiyası');
      expect(mockPrisma.shifts.create).toHaveBeenCalledWith({
        data: {
          name: 'Gündüz Vardiyası',
          type: ShiftType.day,
          startTime: '08:00',
          endTime: '16:00',
          durationHours: 8,
          organizationId: orgId,
          unitId: null,
          deviceId: null,
          personnelType: null,
        },
      });
    });

    it('should throw ConflictException if name already exists in organization', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(sampleShift);

      await expect(
        service.create(
          {
            name: 'Gündüz Vardiyası',
            type: ShiftType.day,
            startTime: '08:00',
            endTime: '16:00',
            durationHours: 8,
            organizationId: orgId,
          },
          userId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all shifts for organization', async () => {
      mockPrisma.shifts.findMany.mockResolvedValue([sampleShift]);

      const result = await service.findAll(orgId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('shift-1');
      expect(mockPrisma.shifts.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter by unitId when provided', async () => {
      mockPrisma.shifts.findMany.mockResolvedValue([sampleShift]);

      await service.findAll(orgId, 'unit-1');

      expect(mockPrisma.shifts.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          OR: [{ unitId: 'unit-1' }, { unitId: null }],
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a shift by id', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(sampleShift);

      const result = await service.findOne('shift-1', orgId);

      expect(result.id).toBe('shift-1');
      expect(mockPrisma.shifts.findFirst).toHaveBeenCalledWith({
        where: { id: 'shift-1', organizationId: orgId },
      });
    });

    it('should throw NotFoundException if shift not found', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a shift', async () => {
      mockPrisma.shifts.findUnique.mockResolvedValue(sampleShift);
      mockPrisma.shifts.findFirst.mockResolvedValue(null);
      const updated = { ...sampleShift, name: 'Gece Vardiyası' };
      mockPrisma.shifts.update.mockResolvedValue(updated);

      const result = await service.update(
        'shift-1',
        { name: 'Gece Vardiyası' },
        userId,
      );

      expect(result.name).toBe('Gece Vardiyası');
      expect(mockPrisma.shifts.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: { name: 'Gece Vardiyası' },
      });
    });

    it('should throw if shift does not exist', async () => {
      mockPrisma.shifts.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'New' }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate name in same unit', async () => {
      mockPrisma.shifts.findUnique.mockResolvedValue(sampleShift);
      mockPrisma.shifts.findFirst.mockResolvedValue({
        id: 'other',
        name: 'Gündüz Vardiyası',
        unitId: null,
      });

      await expect(
        service.update('shift-1', { name: 'Gündüz Vardiyası' }, userId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a shift', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(sampleShift);
      mockPrisma.shifts.delete.mockResolvedValue(sampleShift);

      await service.remove('shift-1', orgId);

      expect(mockPrisma.shifts.delete).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
      });
    });

    it('should throw if shift not found in organization', async () => {
      mockPrisma.shifts.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
