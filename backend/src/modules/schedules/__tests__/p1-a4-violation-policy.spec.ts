import { describe, it, expect } from 'vitest';
import {
  policyFor,
  normalizeViolationPolicy,
  VIOLATION_POLICY,
} from '../types/violation-policy';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import type { PersonnelLookup } from '../domain/constraints/constraint.interface';

const EMPTY_DEVICE = { findById: () => undefined };
const EMPTY_TEMPLATE = { findById: () => undefined };
const EMPTY_GROUP = { findById: () => undefined };
const PERSON: PersonnelLookup = {
  findById: () => ({
    id: 'p-1', name: 'Test', isActive: true, employmentStatus: 'active',
    unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [],
    nightShiftEligible: true, offDays: [], maxWeeklyHours: 40,
  }),
};

function assignment() {
  return Assignment.create({
    scheduleId: 's-1',
    personnelId: 'p-1',
    date: '2026-08-15',
    shiftType: 'morning',
    startTime: '08:00',
    endTime: '16:00',
  });
}

describe('P1-A4 — single violation policy, strictest-wins', () => {
  it('keeps the stricter side for every conflicting rule', () => {
    for (const rule of [
      'TIME_OVERLAP',
      'NOT_NIGHT_ELIGIBLE',
      'REST_RULE_VIOLATION',
      'GROUP_SLOT_OCCUPIED',
      'PERSON_DEVICE_NOT_ALLOWED',
    ]) {
      expect(policyFor(rule)).toEqual({ severity: 'BLOCKING', isOverrideAllowed: false });
    }
  });

  it('does not weaken the rules on which both engines already agreed', () => {
    expect(policyFor('OFF_DAY_CONFLICT')).toEqual({ severity: 'WARNING', isOverrideAllowed: true });
    expect(policyFor('REQUIRED_REST_NOT_MET')).toEqual({ severity: 'WARNING', isOverrideAllowed: true });
    expect(policyFor('PERSONNEL_AVAILABILITY_CONFLICT')).toEqual({
      severity: 'BLOCKING', isOverrideAllowed: false,
    });
  });

  it('fails closed for an unknown rule', () => {
    expect(policyFor('NOT_IN_POLICY')).toEqual({ severity: 'BLOCKING', isOverrideAllowed: false });
  });

  it('normalizes a legacy warning into the authoritative blocking policy', () => {
    const legacy = {
      rule: 'PERSON_DEVICE_NOT_ALLOWED',
      severity: 'WARNING' as const,
      message: 'legacy warning',
      isOverrideAllowed: true,
    };
    expect(normalizeViolationPolicy(legacy)).toEqual({
      ...legacy,
      severity: 'BLOCKING',
      isOverrideAllowed: false,
    });
  });

  it('normalizes at the DDD engine boundary (overlap can no longer be overridden)', () => {
    const report = new ConstraintEngine().validate(
      assignment(),
      new AssignmentCollection([
        Assignment.create({
          scheduleId: 's-1', personnelId: 'p-1', date: '2026-08-15',
          shiftType: 'morning', startTime: '08:00', endTime: '16:00',
        }),
      ]),
      PERSON,
      EMPTY_DEVICE,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
    );

    const overlap = report.violations.filter(v => v.rule === 'TIME_OVERLAP');
    expect(overlap.length).toBeGreaterThan(0);
    for (const violation of overlap) {
      expect(violation.severity).toBe('BLOCKING');
      expect(violation.isOverrideAllowed).toBe(false);
    }
    expect(report.hasBlocking).toBe(true);
  });

  it('both engines resolve a shared rule through the same policy entry', () => {
    const rules = Object.keys(VIOLATION_POLICY);
    expect(rules.length).toBeGreaterThanOrEqual(24);
    for (const rule of rules) {
      const engineSide = normalizeViolationPolicy({
        rule, severity: 'WARNING', message: 'engine', isOverrideAllowed: true,
      });
      const legacySide = normalizeViolationPolicy({
        rule, severity: 'INFO', message: 'legacy', isOverrideAllowed: true,
      });
      expect(engineSide.severity).toBe(legacySide.severity);
      expect(engineSide.isOverrideAllowed).toBe(legacySide.isOverrideAllowed);
    }
  });
});
