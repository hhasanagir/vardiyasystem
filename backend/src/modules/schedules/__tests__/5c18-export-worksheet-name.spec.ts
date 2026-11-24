import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma.service';
import { UnitsService } from '../../units/units.service';
import { SchedulesExportService, sanitizeWorksheetName } from '../schedules-export.service';
import { SchedulesController } from '../schedules.controller';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.18 — EXP-01: Excel export must never 500 on the worksheet name or
 * on client-supplied unit values.
 *
 * The sheet name `${unitName} ${month}/${year}` contained '/' (and could carry
 * '\', '?', '*', '[', ']', ':' or exceed 31 chars) which makes ExcelJS throw,
 * and an arbitrary `unit` query value reached a Prisma `type` enum field as an
 * unvalidated string (PrismaClientValidationError -> 500).
 */
describe('Phase 5C.18 — EXP-01 export hardening', () => {
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

  describe('sanitizeWorksheetName', () => {
    it('replaces every Excel-forbidden character with "-"', () => {
      expect(sanitizeWorksheetName('MR/BT?Röntgen*X:Y\\Z[Q]')).toBe('MR-BT-Röntgen-X-Y-Z-Q-');
    });

    it('strips control characters and collapses whitespace', () => {
      expect(sanitizeWorksheetName('MR  \u0000\tBirimi')).toBe('MR Birimi');
    });

    it('never exceeds 31 characters', () => {
      const name = sanitizeWorksheetName('Çok Uzun Birim İsmi Olan Radyoloji Servisi MR Ünitesi 12/2026');
      expect(name.length).toBeLessThanOrEqual(31);
    });

    it('strips leading/trailing apostrophes and falls back on empty input', () => {
      expect(sanitizeWorksheetName("'MR Birim'")).toBe('MR Birim');
      expect(sanitizeWorksheetName('')).toBe('Vardiya Plani');
      expect(sanitizeWorksheetName('  ')).toBe('Vardiya Plani');
    });

    it('produces a valid sheet name for every supported unit with Turkish names', () => {
      const units = [
        'MR/BT', 'Röntgen', 'Nükleer Tıp', 'Onkoloji', 'Ultrason', 'Anjiyo', 'Mamografi',
        'Kemik Dansitometri', 'Floroskopi', 'PET/CT', 'SPECT/CT', 'Linak', 'Simülasyon CT', 'Mobil',
      ];
      const forbidden = /[\\/?*[\]:]/;
      for (const u of units) {
        const name = sanitizeWorksheetName(`${u} 12/2026`);
        expect(name.length).toBeGreaterThan(0);
        expect(name.length).toBeLessThanOrEqual(31);
        expect(forbidden.test(name)).toBe(false);
      }
    });

    it('is deterministic: the same input always yields the same output', () => {
      const input = 'MR/BT?Röntgen*X:Y\\Z[Q] Çok Uzun Birim İsmi 12/2026';
      const first = sanitizeWorksheetName(input);
      for (let i = 0; i < 25; i++) {
        expect(sanitizeWorksheetName(input)).toBe(first);
      }
      expect(sanitizeWorksheetName(input)).toBe(sanitizeWorksheetName(input));
    });

    it('handles collisions after sanitization/truncation deterministically', () => {
      // Two DIFFERENT unit names whose invalid characters sanitize to the same
      // 31-char head collide. Each input still resolves to a valid, stable,
      // ≤31 char sheet name — deterministic per-input. Duplicate sheet names can
      // never break a live export because exportExcel writes exactly ONE
      // worksheet per workbook (collision surface does not exist at runtime).
      const punctInput = 'AAA/BBB?CCC*DDD:EEE\\FFF[GGG]HHH';
      const plainInput = 'AAA-BBB-CCC-DDD-EEE-FFF-GGG-HHH';
      const collided = sanitizeWorksheetName(punctInput);
      const expected = 'AAA-BBB-CCC-DDD-EEE-FFF-GGG-HHH';
      expect(collided).toBe(expected);
      expect(sanitizeWorksheetName(plainInput)).toBe(collided);
      expect(collided.length).toBe(31);
      expect(collided.length).toBeLessThanOrEqual(31);
      expect(/[\\/?*[\]:]/.test(collided)).toBe(false);
      expect(sanitizeWorksheetName(punctInput)).toBe(collided);
      expect(sanitizeWorksheetName(plainInput)).toBe(collided);
    });
  });

  describe('exportExcel worksheet name regression', () => {
    it('exports successfully when the unit name contains illegal characters (no addWorksheet throw)', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1', name: 'MR/BT?Röntgen', type: 'mr' });
      mockPrisma.schedule.findFirst.mockResolvedValue({
        id: 's-1',
        unit: { id: 'u-1', name: 'MR/BT?Röntgen', type: 'mr' },
        assignments: [],
      });
      mockUnitsService.getDevices.mockResolvedValue([]);

      const buf = await exportService.exportExcel('mr', 6, 2026);
      expect(buf).toBeDefined();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it('two distinct names that sanitize/truncate identically still export (single-sheet collision-free)', async () => {
      const collidingNames = ['AAA/BBB?CCC*DDD:EEE\\FFF[GGG]HHH', 'AAA-BBB-CCC-DDD-EEE-FFF-GGG-HHH'];
      const bufs = [];
      for (const name of collidingNames) {
        mockPrisma.unit.findFirst.mockResolvedValue({ id: 'u-1', name, type: 'mr' } as any);
        mockPrisma.schedule.findFirst.mockResolvedValue({
          id: 's-1',
          unit: { id: 'u-1', name, type: 'mr' },
          assignments: [],
        } as any);
        mockUnitsService.getDevices.mockResolvedValue([]);
        bufs.push(await exportService.exportExcel('mr', 6, 2026));
      }
      expect(sanitizeWorksheetName(collidingNames[0])).toBe(sanitizeWorksheetName(collidingNames[1]));
      for (const buf of bufs) {
        expect(buf).toBeDefined();
        expect(buf.byteLength).toBeGreaterThan(0);
      }
    });
  });

  describe('unit resolution (invalid input never 500s)', () => {
    it('invalid unit type value yields NotFound, not a Prisma validation error', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null);

      await expect((exportService as any).getExportData('bogus-unit', 6, 2026))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('valid lowercase enum values resolve (mr / bt / rontgen / nukleer / onkoloji)', async () => {
      for (const type of ['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji']) {
        mockPrisma.unit.findFirst.mockResolvedValue({ id: `u-${type}`, name: `${type} unit`, type });
        mockPrisma.schedule.findFirst.mockResolvedValue({ id: 's-1', unit: { name: `${type} unit` }, assignments: [] });
        mockUnitsService.getDevices.mockResolvedValue([]);

        const data = await (exportService as any).getExportData(type, 6, 2026);
        expect(data.unitName).toBe(`${type} unit`);
        vi.clearAllMocks();
      }
    });

    it('PDF export rejects invalid unit input with NotFound, not a 500', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null);
      await expect(exportService.exportPdf('definitely-not-a-unit///', 6, 2026))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('enforceUnitReadScope guards the type query before Prisma sees invalid enum values', () => {
    let controller: any;
    let scopePrisma: any;
    const ORG = 'org-1';

    beforeEach(() => {
      scopePrisma = { unit: { findFirst: vi.fn().mockResolvedValue(null) } };
      const unitScopeService = new UnitScopeService(scopePrisma as any);
      controller = new SchedulesController(
        {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        unitScopeService,
        scopePrisma as any,
        {} as any,
      );
    });

    it('broad role + invalid unit value -> pass-through for the 404 flow (no Prisma type query, no 500)', async () => {
      const user = { id: 'u', role: 'supervisor', email: 'e@x.com', name: 'S', organizationId: ORG };
      const resolved = await controller.enforceUnitReadScope(user, 'bogus-unit');
      expect(resolved).toBe('bogus-unit');
      expect(scopePrisma.unit.findFirst.mock.calls.every((c: any) => c[0].where.type === undefined)).toBe(true);
    });

    it('strict single-unit actor + unresolvable unit -> Forbidden (unchanged)', async () => {
      const user = { id: 'u', role: 'field_supervisor', email: 'e@x.com', name: 'F', unitId: 'u-a', organizationId: ORG };
      await expect(controller.enforceUnitReadScope(user, 'bogus-unit')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});