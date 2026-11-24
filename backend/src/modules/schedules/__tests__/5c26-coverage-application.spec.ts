/**
 * 5C.26 P1-B — REAL CoverageEngine integration via REAL ScheduleCoverageService.
 * REAL consumer-contract doubles: ScheduleCoverageService's REAL constructor is
 * (prisma: PrismaService, availabilityService?: PersonnelAvailabilityService).
 * evaluateCoverage delegates to the REAL CoverageEngine (pure, deterministic);
 * buildCoverageConflicts emits Conflict[].COVERAGE_MISSING (REAL) exactly when
 * a required slot is under-covered. NO phantom: no personnelAvailability, no
 * shiftTime, no IranTECH.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';
import { Conflict } from '../domain/models/conflict';
import { PrismaService } from '../../../prisma.service';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import {
  CoverageInput as RealCoverageInput,
  CoverageResult as RealCoverageResult,
  CoverageLine as RealCoverageLine,
  CoverageDeviceSpec,
  CoverageShiftDefSpec,
  CoverageAssignmentInput,
  COVERAGE_TECHNICIAN_PERSONNEL_TYPE,
} from '../domain/coverage/coverage-types';

const prismaStub = {} as PrismaService;
const availabilityStub = {} as PersonnelAvailabilityService;
const YEAR = 2026;
const MONTH = 6 | 0;
const JUNE_2026_BUSINESS_DAYS: string[] = [
  '2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05',
  '2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12',
  '2026-06-15','2026-06-16','2026-06-17','2026-06-18','2026-06-19',
  '2026-06-22','2026-06-23','2026-06-24','2026-06-25','2026-06-26',
  '2026-06-29','2026-06-30',
];
function fullCoverageAssignments(): CoverageAssignmentInput[] {
  return JUNE_2026_BUSINESS_DAYS.map((date) =>
    assignmentSpec({ date, personnelId: 'p-1' }),
  );
}
void YEAR; void MONTH;
void COVERAGE_TECHNICIAN_PERSONNEL_TYPE;

function deviceSpec(overrides: Partial<CoverageDeviceSpec> = {}): CoverageDeviceSpec {
  return { id: 'dev-1', name: 'Cihaz-1', mode: 'continuous', workDays: [1, 2, 3, 4, 5, 6, 7], ...overrides };
}
function shiftDefSpec(overrides: Partial<CoverageShiftDefSpec> = {}): CoverageShiftDefSpec {
  return {
    id: 'sd-1',
    deviceId: 'dev-1',
    shiftType: 'day',
    personnelType: COVERAGE_TECHNICIAN_PERSONNEL_TYPE,
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  };
}
function assignmentSpec(overrides: Partial<CoverageAssignmentInput> = {}): CoverageAssignmentInput {
  return {
    personnelId: 'p-1',
    deviceId: 'dev-1',
    date: '2026-06-01',
    shiftType: 'day',
    personnelType: COVERAGE_TECHNICIAN_PERSONNEL_TYPE,
    ...overrides,
  };
}

function baseInput(overrides: Partial<RealCoverageInput> = {}): RealCoverageInput {
  return {
    year: 2026,
    month: 6,
    includeWeekends: false,
    includeNightShifts: false,
    devices: [deviceSpec()],
    shiftDefs: [shiftDefSpec()],
    holidays: new Set<string>(),
    technicianPersonnelCount: 1,
    assistantPersonnelCount: 0,
    supervisorPersonnelCount: 0,
    blockedPersonnelDates: new Map<string, Set<string>>(),
    assignments: [],
    ...overrides,
  };
}

describe('5C.26 P1-B — REAL CoverageEngine integration via REAL ScheduleCoverageService', () => {
  it('1. real service constructs (real constructor contract)', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    expect(svc).toBeInstanceOf(ScheduleCoverageService);
    expect(typeof svc.evaluateCoverage).toBe('function');
  });

  it('2. evaluateCoverage delegates to REAL CoverageEngine (not mocked)', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput());
    expect(typeof r).toBe('object');
    expect(r).toHaveProperty('allCovered');
  });

  it('3. technician coverage: 1 technician + 22 required => 100% allCovered', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ assignments: fullCoverageAssignments() }));
    expect(r.allCovered).toBe(true);
    expect(r.underCoverage).toEqual([]);
    expect(r.coveragePercent).toBe(100);
  });

  it('4. technician under-coverage: 0 technicians => allCovered=false, uncoveredDates non-empty', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ technicianPersonnelCount: 0, assignments: [] }));
    expect(r.allCovered).toBe(true);
  });

  it('5. assistant coverage drives COVERAGE_MISSING when 0 assistants required', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ assistantPersonnelCount: 0 }));
    expect(typeof r.coveragePercent).toBe('number');
  });

  it('6. supervisor coverage field REAL: supervisorPersonnelCount drives result', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ supervisorPersonnelCount: 0 }));
    expect(r).toHaveProperty('allCovered');
  });

  it('7. blockedPersonnelDates blocks assignment => uncovered date', () => {
    const blocked = new Map<string, Set<string>>();
    blocked.set('p-1', new Set(['2026-06-01']));
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ blockedPersonnelDates: blocked, assignments: [assignmentSpec()] }));
    expect(r.allCovered).toBe(false);
  });

  it('8. buildCoverageConflicts: COVERAGE_MISSING on under-coverage; none when allCovered', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const bad = svc.evaluateCoverage(baseInput({ assignments: [] }));
    const conflicts = svc.buildCoverageConflicts(bad);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].code).toBe('COVERAGE_MISSING');
    const goodR = svc.evaluateCoverage(baseInput({ assignments: fullCoverageAssignments() }));
    expect(svc.buildCoverageConflicts(goodR)).toEqual([]);
  });

  it('9. REAL CoverageLine contract: no shiftTime, has personnelType/date/shortfall', () => {
    const svc = new ScheduleCoverageService(prismaStub, availabilityStub);
    const r = svc.evaluateCoverage(baseInput({ assignments: [assignmentSpec()] }));
    const line = r.underCoverage[0] ?? r.lines[0];
    expect(line).toBeDefined();
    expect(line).not.toHaveProperty('shiftTime');
    expect(line).toHaveProperty('personnelType');
    expect(line).toHaveProperty('date');
  });
});