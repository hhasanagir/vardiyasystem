import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { PrismaService } from '../../../prisma.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

/**
 * Phase 5C.23 — eligibility precedence (approved design §5 / §18):
 * explicit active row > weekly offDays > available.
 *   LEAVE / ABSENCE / UNAVAILABLE block; AVAILABLE overrides a weekly off-day;
 *   inactive rows behave as absent; fail-closed on unresolved tenant.
 */
describe('Phase 5C.23 — personnel availability eligibility', () => {
  let prisma: any;
  let service: PersonnelAvailabilityService;

  const noRow = () => null;

  function setup(rowForDate: Record<string, any> | null) {
    prisma = {
      personnel: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p-1', offDays: [1] }), // Mondays off
      },
      personnelDateAvailability: {
        findUnique: vi.fn().mockResolvedValue(rowForDate),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    return new PersonnelAvailabilityService(
      prisma as unknown as PrismaService,
      {} as unknown as UnitScopeService,
      { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService,
    );
  }

  beforeEach(() => {
    service = setup(noRow());
  });

  it('A: no row and weekday not in offDays => available', async () => {
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', 'org-1'); // Tuesday
    expect(res).toEqual({ available: true, blocking: null });
  });

  it('B: no row and weekday in offDays => WEEKLY_OFF_DAY blocked', async () => {
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-05', 'org-1'); // Monday
    expect(res).toEqual({ available: false, blocking: 'WEEKLY_OFF_DAY' });
  });

  it('C: AVAILABLE row overrides a weekly off-day', async () => {
    service = setup({ type: 'AVAILABLE', isActive: true });
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-05', 'org-1');
    expect(res).toEqual({ available: true, blocking: null });
  });

  it('D: UNAVAILABLE row blocks', async () => {
    service = setup({ type: 'UNAVAILABLE', isActive: true });
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', 'org-1');
    expect(res).toEqual({ available: false, blocking: 'UNAVAILABLE' });
  });

  it('E: LEAVE row blocks', async () => {
    service = setup({ type: 'LEAVE', isActive: true });
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', 'org-1');
    expect(res).toEqual({ available: false, blocking: 'LEAVE' });
  });

  it('F: ABSENCE row blocks', async () => {
    service = setup({ type: 'ABSENCE', isActive: true });
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', 'org-1');
    expect(res).toEqual({ available: false, blocking: 'ABSENCE' });
  });

  it('G: inactive row behaves as absent (falls back to weekly offDays)', async () => {
    service = setup({ type: 'LEAVE', isActive: false });
    // Tuesday: inactive LEAVE is ignored => available; Monday: offDays still applies
    const tue = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', 'org-1');
    const mon = await service.isPersonnelAvailableForDate('p-1', '2026-10-05', 'org-1');
    expect(tue).toEqual({ available: true, blocking: null });
    expect(mon).toEqual({ available: false, blocking: 'WEEKLY_OFF_DAY' });
  });

  it('fail closed: NULL organization never yields available', async () => {
    const res = await service.isPersonnelAvailableForDate('p-1', '2026-10-06', null);
    expect(res).toEqual({ available: false, blocking: 'UNRESOLVED_TENANT' });
    expect(prisma.personnelDateAvailability.findUnique).not.toHaveBeenCalled();
  });

  it('fail closed: unknown personnel yields UNRESOLVED_TENANT', async () => {
    prisma.personnel.findUnique.mockResolvedValue(null);
    const res = await service.isPersonnelAvailableForDate('ghost', '2026-10-06', 'org-1');
    expect(res).toEqual({ available: false, blocking: 'UNRESOLVED_TENANT' });
  });

  it('rejects non-real calendar dates', async () => {
    await expect(service.isPersonnelAvailableForDate('p-1', '2026-02-30', 'org-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('month blocked-dates builder', () => {
    it('produces one set per person honoring rows + offDays (leap February 2028 = 29 days)', async () => {
      // p-a: offDays [0] (Sundays) ; p-b: no offDays but LEAVE on the 15th
      const personnel = [
        { id: 'p-a', offDays: [0] },
        { id: 'p-b', offDays: [] },
      ];
      prisma.personnelDateAvailability.findMany.mockResolvedValue([
        { personnelId: 'p-b', date: '2028-02-15', type: 'LEAVE' },
      ]);

      const map = await service.resolveMonthBlockedDates(personnel, 2028, 2);
      expect(map.has('p-a')).toBe(true);
      expect(map.has('p-b')).toBe(true);

      // 2028-02-06 is a Sunday; 2028-02-29 (only in leap years) is a Tuesday
      expect(map.get('p-a')!.has('2028-02-06')).toBe(true);
      expect(map.get('p-a')!.has('2028-02-29')).toBe(false);
      expect(map.get('p-a')!.size).toBe(4); // 4 Sundays in Feb 2028

      // p-b: exactly one blocked date (the LEAVE row), 28 other days open
      expect(map.get('p-b')!.has('2028-02-15')).toBe(true);
      expect(map.get('p-b')!.size).toBe(1);
    });

    it('AVAILABLE row removes an off-day from the blocked set (production override)', async () => {
      const personnel = [{ id: 'p-a', offDays: [1] }];
      prisma.personnelDateAvailability.findMany.mockResolvedValue([
        { personnelId: 'p-a', date: '2026-10-12', type: 'AVAILABLE' },
        { personnelId: 'p-a', date: '2026-10-19', type: 'LEAVE' },
      ]);

      const map = await service.resolveMonthBlockedDates(personnel, 2026, 10);
      const blocked = map.get('p-a')!;
      // 2026-10-05 / 10-12 / 10-19 / 10-26 are Mondays
      expect(blocked.has('2026-10-05')).toBe(true); // no row   -> offDays
      expect(blocked.has('2026-10-12')).toBe(false); // AVAILABLE override
      expect(blocked.has('2026-10-19')).toBe(true); // LEAVE row
      expect(blocked.has('2026-10-26')).toBe(true); // no row   -> offDays
    });

    it('empty table + empty input => empty map (no DB dependency for no personnel)', async () => {
      const map = await service.resolveMonthBlockedDates([], 2026, 10);
      expect(map.size).toBe(0);
      expect(prisma.personnelDateAvailability.findMany).not.toHaveBeenCalled();
    });
  });

  describe('date utility', () => {
    it('recognizes real calendar dates (incl. leap day)', () => {
      expect(PersonnelAvailabilityService.isValidDate('2024-02-29')).toBe(true);
      expect(PersonnelAvailabilityService.isValidDate('2026-02-29')).toBe(false);
      expect(PersonnelAvailabilityService.isValidDate('2026-02-30')).toBe(false);
      expect(PersonnelAvailabilityService.isValidDate('2026-13-01')).toBe(false);
      expect(PersonnelAvailabilityService.isValidDate('2026-1-1')).toBe(false);
      expect(PersonnelAvailabilityService.isValidDate('garbage')).toBe(false);
    });

    it('computes UTC-safe weekdays and month lengths', () => {
      expect(PersonnelAvailabilityService.utcWeekDayOf('2026-10-05')).toBe(1);
      expect(PersonnelAvailabilityService.daysInMonth(2026, 10)).toBe(31);
      expect(PersonnelAvailabilityService.daysInMonth(2028, 2)).toBe(29);
      expect(PersonnelAvailabilityService.daysInMonth(2026, 2)).toBe(28);
    });
  });
});