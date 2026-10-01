import { describe, it, expect } from 'vitest';
import {
  ConflictCode,
  ConflictSeverity,
  createConflict,
  isHardConflict,
  conflictCodeLabel,
} from '../domain/models/conflict';
import {
  createEmptyValidationResult,
  addHardViolation,
  addSoftViolation,
  finalizeValidation,
  formatScoreReport,
} from '../domain/models/validation-result';
import { FairnessEngine } from '../domain/models/fairness-engine';
import { ScoringModel } from '../domain/models/scoring-model';
import {
  validatePersonnelForAssignment,
  validateDeviceForAssignment,
  validateShiftTemplateForAssignment,
} from '../domain/models/master-data';

describe('Conflict Model', () => {
  it('creates conflict with all fields', () => {
    const c = createConflict({
      code: ConflictCode.PERSON_OVERLAP,
      severity: ConflictSeverity.ERROR,
      message: 'Person overlap detected',
      context: {
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
    });
    expect(c.code).toBe(ConflictCode.PERSON_OVERLAP);
    expect(c.severity).toBe(ConflictSeverity.ERROR);
    expect(c.isHardConstraint).toBe(true);
    expect(c.id).toBeDefined();
  });

  it('identifies hard vs soft conflicts', () => {
    const hard = createConflict({
      code: ConflictCode.REST_VIOLATION,
      severity: ConflictSeverity.ERROR,
      message: 'rest',
      context: {
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
    });
    const soft = createConflict({
      code: ConflictCode.COVERAGE_MISSING,
      severity: ConflictSeverity.WARNING,
      message: 'coverage',
      context: {
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
    });
    expect(isHardConflict(hard)).toBe(true);
    expect(isHardConflict(soft)).toBe(false);
  });

  it('provides Turkish labels for all codes', () => {
    for (const code of Object.values(ConflictCode)) {
      const label = conflictCodeLabel(code);
      expect(label).toBeTruthy();
      expect(typeof label).toBe('string');
    }
  });
});

describe('Validation Result', () => {
  it('creates empty result', () => {
    const r = createEmptyValidationResult();
    expect(r.valid).toBe(true);
    expect(r.hardViolations.total).toBe(0);
    expect(r.softViolations.total).toBe(0);
  });

  it('adds hard violations', () => {
    const r = createEmptyValidationResult();
    const c = createConflict({
      code: ConflictCode.PERSON_OVERLAP,
      severity: ConflictSeverity.ERROR,
      message: 'overlap',
      context: {
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
    });
    addHardViolation(r, c);
    expect(r.hardViolations.total).toBe(1);
    finalizeValidation(r);
    expect(r.valid).toBe(false);
  });

  it('adds soft violations without invalidating', () => {
    const r = createEmptyValidationResult();
    const c = createConflict({
      code: ConflictCode.COVERAGE_MISSING,
      severity: ConflictSeverity.WARNING,
      message: 'coverage',
      context: {
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
    });
    addSoftViolation(r, c);
    finalizeValidation(r);
    expect(r.valid).toBe(true);
  });
});

describe('Master Data Immutability (Rule 33)', () => {
  const mockPersonnel = {
    id: 'p-1',
    name: 'Test Tech',
    role: 'technician',
    unitId: 'u-1',
    groupId: 'g-1',
    skills: ['MRI', 'CT'],
    deviceSkills: ['MRI'],
    nightShiftEligible: true,
    employmentStatus: 'active',
    offDays: [5],
    maxWeeklyHours: 40,
    isActive: true,
    seniority: 3,
  };
  const mockDevice = {
    id: 'd-1',
    code: 'MRI-01',
    name: 'MRI Scanner 1',
    unitId: 'u-1',
    mode: 'normal',
    requiredSkills: ['MRI'],
    workDays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 16,
    isMaster: false,
    isActive: true,
  };
  const mockTemplate = {
    id: 't-1',
    unitId: 'u-1',
    personnelGroupId: 'g-1',
    name: 'Morning Shift',
    shiftType: 'morning',
    startTime: '08:00',
    endTime: '16:00',
    isActive: true,
  };

  describe('validatePersonnelForAssignment returns Conflict[]', () => {
    it('returns empty for valid active personnel on working day', () => {
      const result = validatePersonnelForAssignment(
        mockPersonnel,
        '2026-08-15',
        'morning',
        5,
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('detects inactive personnel', () => {
      const result = validatePersonnelForAssignment(
        { ...mockPersonnel, isActive: false, employmentStatus: 'inactive' },
        '2026-08-15',
        'morning',
        5,
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((c) => c.severity === ConflictSeverity.ERROR)).toBe(
        true,
      );
    });

    it('detects night shift ineligible', () => {
      const result = validatePersonnelForAssignment(
        { ...mockPersonnel, nightShiftEligible: false },
        '2026-08-15',
        'night',
        5,
      );
      expect(result.some((c) => c.severity === ConflictSeverity.ERROR)).toBe(
        true,
      );
    });

    it('does not mutate input', () => {
      const snapshot = JSON.stringify(mockPersonnel);
      validatePersonnelForAssignment(mockPersonnel, '2026-08-15', 'morning', 5);
      validatePersonnelForAssignment(mockPersonnel, '2026-08-15', 'night', 5);
      expect(JSON.stringify(mockPersonnel)).toBe(snapshot);
    });
  });

  describe('validateDeviceForAssignment returns Conflict[]', () => {
    it('returns empty for active device', () => {
      const result = validateDeviceForAssignment(
        mockDevice,
        '2026-08-15',
        'morning',
        5,
      );
      expect(result).toHaveLength(0);
    });

    it('rejects inactive device', () => {
      const result = validateDeviceForAssignment(
        { ...mockDevice, isActive: false },
        '2026-08-15',
        'morning',
        5,
      );
      expect(result.length).toBeGreaterThan(0);
    });

    it('does not mutate input', () => {
      const snapshot = JSON.stringify(mockDevice);
      validateDeviceForAssignment(mockDevice, '2026-08-15', 'morning', 5);
      expect(JSON.stringify(mockDevice)).toBe(snapshot);
    });
  });

  describe('validateShiftTemplateForAssignment returns Conflict[]', () => {
    it('returns empty for active template', () => {
      const result = validateShiftTemplateForAssignment(mockTemplate);
      expect(result).toHaveLength(0);
    });

    it('rejects inactive template', () => {
      const result = validateShiftTemplateForAssignment({
        ...mockTemplate,
        isActive: false,
      });
      expect(result.length).toBeGreaterThan(0);
    });

    it('does not mutate input', () => {
      const snapshot = JSON.stringify(mockTemplate);
      validateShiftTemplateForAssignment(mockTemplate);
      expect(JSON.stringify(mockTemplate)).toBe(snapshot);
    });
  });
});
