import { describe, it, expect, beforeEach } from 'vitest';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleValidationService } from '../schedule-validation.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

/**
 * Phase 5C.23 — production generator consumed the authoritative availability
 * service: LEAVE row blocks, weekly offDays honored, and an explicit AVAILABLE
 * row overrides a weekly off-day inside the real candidate-selection path.
 */
describe('Phase 5C.23 — generator honors personnel date availability', () => {
  const DTO = {
    year: 2026,
    month: 10,
    unitType: 'vardiya',
    includeWeekends: true,
    includeNightShifts: false,
    fairnessMode: 'balanced',
    maxOvertime: 20,
    minRestHours: 11,
    maxConsecutiveDays: 6,
    maxConsecutiveNights: 3,
  };

  // p-a: Mondays off ; p-b: no offDays but LEAVE on Monday 2026-10-12
  const PERSON_A = {
    id: 'p-a', name: 'A', role: 'technician', skills: [], deviceSkills: [],
    nightShiftEligible: true, employmentStatus: 'active', offDays: [1], maxWeeklyHours: 40, isActive: true,
  };
  const PERSON_B = {
    id: 'p-b', name: 'B', role: 'technician', skills: [], deviceSkills: [],
    nightShiftEligible: true, employmentStatus: 'active', offDays: [], maxWeeklyHours: 40, isActive: true,
  };
  const DEVICE = {
    id: 'd-1', code: 'DEV1', name: 'Cihaz 1', mode: 'vardiya', requiredSkills: [],
    workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 8, endHour: 20,
  };

  let prisma: any;

  function build(availabilityRows: { personnelId: string; date: string; type: string }[]) {
    prisma = {
      unit: { findFirst: () => Promise.resolve({ id: 'u-1' }) },
      personnel: { findMany: () => Promise.resolve([PERSON_A, PERSON_B]) },
      device: { findMany: () => Promise.resolve([DEVICE]) },
      holiday: { findMany: () => Promise.resolve([]) },
      deviceOffDate: { findMany: () => Promise.resolve([]) },
      shiftDateOverride: { findMany: () => Promise.resolve([]) },
      shifts: { findMany: () => Promise.resolve([]) },
      personnelDateAvailability: { findMany: () => Promise.resolve(availabilityRows) },
    };
    const availability = new PersonnelAvailabilityService(
      prisma as unknown as PrismaService,
      {} as unknown as UnitScopeService,
      { log: () => Promise.resolve(undefined) } as unknown as AuditLogService,
    );
    return new ScheduleAutoGeneratorService(
      prisma as unknown as PrismaService,
      {} as unknown as ScheduleValidationService,
      {} as unknown as UnitScopeService,
      availability,
    );
  }

  describe('with availability rows', () => {
    let generator: ScheduleAutoGeneratorService;
    beforeEach(() => {
      generator = build([
        { personnelId: 'p-a', date: '2026-10-12', type: 'AVAILABLE' }, // override Monday off-day
        { personnelId: 'p-b', date: '2026-10-12', type: 'LEAVE' },
      ]);
    });

    it('never assigns B on the LEAVE date nor A on unoverridden off-days', async () => {
      const { assignments } = await generator.generate('user-1', DTO as any);
      for (const a of assignments) {
        expect(a.personnelId !== 'p-b' || a.date !== '2026-10-12').toBe(true);
        expect(!['2026-10-05', '2026-10-19', '2026-10-26'].includes(a.date) || a.personnelId !== 'p-a').toBe(true);
      }
    });

    it('AVAILABLE override lets A work the Monday he normally rests, while B is out on LEAVE', async () => {
      const { assignments } = await generator.generate('user-1', DTO as any);
      expect(assignments.some(a => a.personnelId === 'p-a' && a.date === '2026-10-12')).toBe(true);
      expect(assignments.some(a => a.personnelId === 'p-b' && a.date === '2026-10-12')).toBe(false);
      // A's other Mondays stay blocked: B covers them
      expect(assignments.some(a => a.personnelId === 'p-b' && a.date === '2026-10-05')).toBe(true);
      expect(assignments.some(a => a.personnelId === 'p-b' && a.date === '2026-10-26')).toBe(true);
    });

    it('produces exactly one assignment per day for the 31-day month (no gaps)', async () => {
      const { assignments, summary } = await generator.generate('user-1', DTO as any);
      expect(summary.total).toBe(31);
      const days = new Set(assignments.map(a => a.date));
      expect(days.size).toBe(31);
    });
  });

  it('empty availability table preserves the prior offDays behavior (regression)', async () => {
    const generator = build([]);
    const { assignments } = await generator.generate('user-1', DTO as any);
    expect(assignments.some(a => a.personnelId === 'p-a' && ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].includes(a.date))).toBe(false);
    const mondays = assignments.filter(a => ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].includes(a.date));
    expect(mondays.length).toBe(4);
    expect(mondays.every(a => a.personnelId === 'p-b')).toBe(true);
  });
});