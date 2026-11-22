import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma.service';
import { UnitsService } from '../../units/units.service';
import { SchedulesExportService } from '../schedules-export.service';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.17 — UA6-1 export unit resolution.
 *
 * exportExcel/exportPdf previously resolved the unit via
 * `where: { type: unitType.toUpperCase() }` — UnitType enum values are lowercase
 * (`mr`, not `MR`), so the query always returned null (or Prisma threw), and a
 * frontend that passes a unit UUID/code could never export. Now the unit is
 * resolved by id (UUID) OR code OR lowercase type; invalid input returns 404
 * instead of a 500.
 */
describe('Phase 5C.17 — UA6-1 export unit resolution', () => {
  let exportService: SchedulesExportService;
  let mockPrisma: any;
  let mockUnitsService: any;

  beforeEach(async () => {
    mockPrisma = {
      unit: { findFirst: vi.fn() },
      schedule: { findFirst: vi.fn() },
    };
    mockUnitsService = { getDevices: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UnitsService, useValue: mockUnitsService },
      ],
    }).compile();

    exportService = module.get(SchedulesExportService);
  });

  const UNIT_ID = '991dd0a2-4385-4798-8914-235e534850cb';
  const scheduleRow = {
    id: 's-1',
    unit: { id: UNIT_ID, name: 'MR A', type: 'mr' },
    assignments: [
      {
        id: 'a-1', date: '2026-05-01', shiftType: 'day', startTime: '08:00', endTime: '16:00',
        isConfirmed: false, deviceId: 'd-1', device: { code: 'MR-A' }, personnel: { name: 'Ali' },
      },
    ],
  };

  function seedUnitAndSchedule(unit: any, schedule = scheduleRow) {
    mockPrisma.unit.findFirst.mockResolvedValue(unit);
    mockPrisma.schedule.findFirst.mockResolvedValue(schedule);
    mockUnitsService.getDevices.mockResolvedValue([
      { id: 'd-1', code: 'MR-A', name: 'MR A', mode: 'primary', blockCode: 'A', isMaster: true },
    ]);
  }

  it('resolves unit by UUID (id)', async () => {
    seedUnitAndSchedule({ id: UNIT_ID, name: 'MR A', type: 'mr' });

    const data = await (exportService as any).getExportData(UNIT_ID, 5, 2026);

    expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith({
      where: { id: UNIT_ID },
    });
    expect(data).toBeDefined();
    expect(data.unitName).toBe('MR A');
  });

  it('resolves unit by code', async () => {
    seedUnitAndSchedule({ id: UNIT_ID, name: 'MR A', type: 'mr' });

    const data = await (exportService as any).getExportData('MR-C1', 5, 2026);

    expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith({
      where: { code: 'MR-C1' },
    });
    expect(data).toBeDefined();
  });

  it('resolves unit by lowercase type enum value (no toUpperCase)', async () => {
    mockPrisma.unit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: UNIT_ID, name: 'MR A', type: 'mr' });
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleRow);
    mockUnitsService.getDevices.mockResolvedValue([
      { id: 'd-1', code: 'MR-A', name: 'MR A', mode: 'primary', blockCode: 'A', isMaster: true },
    ]);

    const data = await (exportService as any).getExportData('mr', 5, 2026);

    expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith({
      where: { type: 'mr' },
    });
    expect(data).toBeDefined();
  });

  it('resolves unit by type case-insensitively for legacy callers', async () => {
    mockPrisma.unit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: UNIT_ID, name: 'MR A', type: 'mr' });
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleRow);
    mockUnitsService.getDevices.mockResolvedValue([
      { id: 'd-1', code: 'MR-A', name: 'MR A', mode: 'primary', blockCode: 'A', isMaster: true },
    ]);

    const data = await (exportService as any).getExportData('MR', 5, 2026);

    expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith({
      where: { type: 'mr' },
    });
    expect(data).toBeDefined();
  });

  it('unknown unit yields NotFoundException (404), not a 500', async () => {
    mockPrisma.unit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await expect((exportService as any).getExportData('bogus-unit', 5, 2026))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('missing schedule still yields NotFoundException', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_ID, name: 'MR A', type: 'mr' });
    mockPrisma.schedule.findFirst.mockResolvedValue(null);
    await expect((exportService as any).getExportData(UNIT_ID, 5, 2026))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});