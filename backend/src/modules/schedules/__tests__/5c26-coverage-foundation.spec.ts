/**
 * PHASE 5C.26 P1-A1 — CoverageEngine minimum-staffing FOUNDATION (pure domain).
 *
 * Byte-pinned against the real, green consumers' contract surfaces (5C.6,
 * 5C.17, 5C.25 all compile+pass on this tree):
 *   - engine method is `evaluateCoverage(input): CoverageResult` — NOT
 *     evaluateScheduleCoverage (that is the service/provider name; the engine
 *     surface tsc suggested `evaluateCoverage`).
 *   - CoverageInput has NO `personnelAvailability` field. Availability is
 *     conveyed by `blockedPersonnelDates: Map<personnelId, Set<date>>`
 *     (resolved by the 5C.23 service), plus `technicianPersonnelCount` /
 *     `assistantPersonnelCount` / `supervisorPersonnelCount`.
 *   - CoverageLine has `shiftType` (NOT `shiftTime`), `personnelType`,
 *     `required`, `assigned`, `shortfall`.
 *   - CoverageResult has `lines`, `underCoverage`, `requiredSlots`,
 *     `assignedSlots`, `coveragePercent`, `allCovered`, `uncoveredDates`.
 *   - Deterministic: identical input twice => byte-identical JSON (pure, no I/O,
 *     no Date.now/Math.random/unordered iteration).
 *   - VACUOUS semantics: zero operational personnel => allCovered=true,
 *     nothing required => publish/generation remain ENABLED.
 *   - Assistant/supervisor requirements are phantom-free: a unit with
 *     0 assistants or 0 supervisors requires NO assistant/supervisor slot.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { CoverageEngine } from '../domain/coverage/coverage-engine';
import {
  CoverageInput,
  CoverageAssignmentInput,
  COVERAGE_TECHNICIAN_PERSONNEL_TYPE as TECH,
  COVERAGE_ASSISTANT_PERSONNEL_TYPE as ASSIST,
  COVERAGE_SUPERVISOR_PERSONNEL_TYPE as SUP,
} from '../domain/coverage/coverage-types';

/**
 * June 2026 business days (weekdays, weekends excluded) — the REAL engine's
 * slot enumeration for the canonical foundation fixture. 22 technician slots
 * are required across the month; a fixture that seeds a single assignment
 * would report 21 under-covered slots, so the PASS fixture seeds all 22.
 */
const JUNE_2026_BUSINESS_DAYS: string[] = [
  '2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05',
  '2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12',
  '2026-06-15','2026-06-16','2026-06-17','2026-06-18','2026-06-19',
  '2026-06-22','2026-06-23','2026-06-24','2026-06-25','2026-06-26',
  '2026-06-29','2026-06-30',
];

function fullCoverageAssignments(): CoverageAssignmentInput[] {
  return JUNE_2026_BUSINESS_DAYS.map((date) => ({
    personnelId: 'p-1',
    deviceId: 'dev-1',
    date,
    shiftType: 'day',
    personnelType: TECH,
  }));
}

function baseInput(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    year: 2026,
    month: 6,
    includeWeekends: false,
    includeNightShifts: false,
    devices: [
      { id: 'dev-1', name: 'Cihaz A', mode: 'continuous', workDays: [1, 2, 3, 4, 5, 6, 7] },
    ],
    shiftDefs: [
      {
        id: 'sd-1',
        deviceId: 'dev-1',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
        personnelType: TECH,
        blockId: null,
        optionalOnWeekends: false,
        optionalOnHolidays: false,
      },
    ],
    assignments: fullCoverageAssignments(),
    holidays: new Set<string>(),
    technicianPersonnelCount: 1,
    assistantPersonnelCount: 0,
    supervisorPersonnelCount: 0,
    blockedPersonnelDates: new Map<string, Set<string>>(),
    ...overrides,
  };
}

describe('5C.26 P1-A1 — CoverageEngine minimum-staffing foundation (pure)', () => {
  it('PASS: technician required per June business day, all 22 slots assigned => allCovered, no under-coverage', () => {
    const r = new CoverageEngine().evaluateCoverage(baseInput());
    expect(r.allCovered).toBe(true);
    expect(r.underCoverage).toEqual([]);
    expect(r.coveragePercent).toBe(100);
    expect(r.uncoveredDates).toEqual([]);
  });

  it('BLOCK: technician assigned=0 => 22 uncovered business-day slots reported', () => {
    const r = new CoverageEngine().evaluateCoverage(baseInput({ assignments: [] }));
    expect(r.allCovered).toBe(false);
    expect(r.underCoverage).toHaveLength(JUNE_2026_BUSINESS_DAYS.length);
    expect(r.uncoveredDates).toEqual(JUNE_2026_BUSINESS_DAYS);
  });

  it('VACUOUS: zero operational personnel => allCovered (publish/generation enabled)', () => {
    const r = new CoverageEngine().evaluateCoverage(
      baseInput({ assignments: [], technicianPersonnelCount: 0, assistantPersonnelCount: 0, supervisorPersonnelCount: 0 }),
    );
    expect(r.allCovered).toBe(true);
    expect(r.lines).toEqual([]);
    expect(r.coveragePercent).toBe(100);
  });

  it('No phantom assistant: 0 assistants => no assistant requirement slot', () => {
    const r = new CoverageEngine().evaluateCoverage(baseInput());
    expect(r.lines.every((l) => l.personnelType !== ASSIST)).toBe(true);
  });

  it('No phantom supervisor: 0 supervisors => no supervisor requirement slot', () => {
    const r = new CoverageEngine().evaluateCoverage(baseInput());
    expect(r.lines.every((l) => l.personnelType !== SUP)).toBe(true);
  });

  it('Blocked personnel dates reduce the assigned count (a blocked assignment cannot satisfy the slot)', () => {
    const blocked = new Map<string, Set<string>>();
    blocked.set('p-1', new Set(['2026-06-01']));
    const r = new CoverageEngine().evaluateCoverage(baseInput({ blockedPersonnelDates: blocked }));
    expect(r.allCovered).toBe(false);
    expect(r.underCoverage).toHaveLength(1);
  });

  it('Deterministic: identical input twice => byte-identical JSON (no randomness)', () => {
    const a = new CoverageEngine().evaluateCoverage(baseInput());
    const b = new CoverageEngine().evaluateCoverage(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
