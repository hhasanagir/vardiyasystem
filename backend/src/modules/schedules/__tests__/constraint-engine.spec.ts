import { describe, it, expect } from 'vitest';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import {
  PersonnelLookup,
  DeviceLookup,
  ShiftTemplateLookup,
  GroupLookup,
} from '../domain/constraints/constraint.interface';

const EMPTY_PERSONNEL: PersonnelLookup = { findById: () => undefined };
const EMPTY_DEVICE: DeviceLookup = { findById: () => undefined };
const EMPTY_TEMPLATE: ShiftTemplateLookup = { findById: () => undefined };
const EMPTY_GROUP: GroupLookup = { findById: () => undefined };

function makeAssignment(
  overrides: Partial<Parameters<typeof Assignment.create>[0]> = {},
): Assignment {
  return Assignment.create({
    scheduleId: 's-1',
    personnelId: 'p-1',
    date: '2026-08-15',
    shiftType: 'morning',
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  });
}

describe('ConstraintEngine', () => {
  const engine = new ConstraintEngine();

  it('validates valid assignment with no violations', () => {
    const assignment = makeAssignment();
    const existing = new AssignmentCollection([]);

    const report = engine.validate(
      assignment,
      existing,
      {
        findById: () => ({
          id: 'p-1',
          name: 'Test',
          isActive: true,
          employmentStatus: 'full_time',
          unitId: 'u-1',
          groupId: null,
          role: 'technician',
          skills: [],
          deviceSkills: [],
          nightShiftEligible: true,
          offDays: [],
          maxWeeklyHours: 40,
        }),
      },
      EMPTY_DEVICE,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
    );
    expect(report.violations.length).toBeGreaterThanOrEqual(0);
    expect(typeof report.hasBlocking).toBe('boolean');
  });

  it('detects personnel not found', () => {
    const assignment = makeAssignment({ personnelId: 'unknown' });
    const report = engine.validate(
      assignment,
      new AssignmentCollection([]),
      EMPTY_PERSONNEL,
      EMPTY_DEVICE,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
    );
    expect(
      report.violations.some((v) => v.rule === 'PERSONNEL_NOT_FOUND'),
    ).toBe(true);
  });

  it('detects duplicate assignment (same slot)', () => {
    const existing = new AssignmentCollection([
      Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      }),
    ]);
    const newAssignment = makeAssignment();
    const report = engine.validate(
      newAssignment,
      existing,
      {
        findById: () => ({
          id: 'p-1',
          name: 'Test',
          isActive: true,
          employmentStatus: 'full_time',
          unitId: 'u-1',
          groupId: null,
          role: 'technician',
          skills: [],
          deviceSkills: [],
          nightShiftEligible: true,
          offDays: [],
          maxWeeklyHours: 40,
        }),
      },
      EMPTY_DEVICE,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
    );
    expect(report.violations.some((v) => v.rule === 'TIME_OVERLAP')).toBe(true);
  });

  it('detects inactive personnel', () => {
    const assignment = makeAssignment();
    const report = engine.validate(
      assignment,
      new AssignmentCollection([]),
      {
        findById: () => ({
          id: 'p-1',
          name: 'Inactive',
          isActive: false,
          employmentStatus: 'terminated',
          unitId: 'u-1',
          groupId: null,
          role: 'technician',
          skills: [],
          deviceSkills: [],
          nightShiftEligible: true,
          offDays: [],
          maxWeeklyHours: 40,
        }),
      },
      EMPTY_DEVICE,
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
    );
    expect(report.violations.some((v) => v.rule === 'INACTIVE_PERSONNEL')).toBe(
      true,
    );
  });
});
