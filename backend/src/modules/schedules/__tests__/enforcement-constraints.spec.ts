import { describe, it, expect } from 'vitest';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { PersonnelLookup, DeviceLookup, ShiftTemplateLookup, GroupLookup } from '../domain/constraints/constraint.interface';

const EMPTY_TEMPLATE: ShiftTemplateLookup = { findById: () => undefined };
const EMPTY_GROUP: GroupLookup = { findById: () => undefined };

const VALID_PERSONNEL: PersonnelLookup = {
  findById: () => ({
    id: 'p-1',
    name: 'Test Personel',
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
};

function makeDeviceLookup(record: Partial<Record<string, unknown>>): DeviceLookup {
  return {
    findById: (id: string) =>
      ({
        id,
        code: 'DEV-1',
        name: 'DEV-1 Cihaz',
        unitId: 'u-1',
        workDays: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 17,
        mode: 'shared',
        isActive: true,
        requiredSkills: [],
        isMaster: false,
        skills: [],
        ...record,
      } as any),
  };
}

function makeAssignment(date: string, overrides: Partial<Parameters<typeof Assignment.create>[0]> = {}): Assignment {
  return Assignment.create({
    scheduleId: 's-1',
    personnelId: 'p-1',
    deviceId: 'dev-1',
    unitId: 'u-1',
    date,
    shiftType: 'morning',
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  });
}

function validate(assignment: Assignment, deviceOffDates: Set<string> = new Set(), deviceLookup = makeDeviceLookup({})) {
  const engine = new ConstraintEngine();
  return engine.validate(
    assignment,
    new AssignmentCollection([]),
    VALID_PERSONNEL,
    deviceLookup,
    new Set(),
    deviceOffDates,
    EMPTY_TEMPLATE,
    EMPTY_GROUP,
  );
}

describe('Phase 5C.3 Enforcement: UNIT_CLOSED (DeviceWorkDaysConstraint)', () => {
  ['2026-05-03', '2026-05-02'].forEach((closedDate) => {
    it(`rejects device assignment on a closed day ${closedDate} with BLOCKING non-overridable UNIT_CLOSED`, () => {
      const report = validate(makeAssignment(closedDate), new Set(), makeDeviceLookup({ workDays: [1, 2, 3, 4, 5] }));
      const violation = report.violations.find(v => v.rule === 'UNIT_CLOSED');
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('BLOCKING');
      expect(violation!.isOverrideAllowed).toBe(false);
      expect(report.hasBlocking).toBe(true);
    });
  });

  it('allows device assignment on a working day (no UNIT_CLOSED)', () => {
    const report = validate(makeAssignment('2026-05-04'), new Set(), makeDeviceLookup({ workDays: [1, 2, 3, 4, 5] }));
    expect(report.violations.find(v => v.rule === 'UNIT_CLOSED')).toBeUndefined();
  });

  it('allows assignment for every day when workDays covers all 7 days', () => {
    for (const d of ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08']) {
      const report = validate(makeAssignment(d), new Set(), makeDeviceLookup({ workDays: [0, 1, 2, 3, 4, 5, 6] }));
      expect(report.violations.find(v => v.rule === 'UNIT_CLOSED')).toBeUndefined();
    }
  });

  it('skips UNIT_CLOSED when device has no workDays configured', () => {
    const report = validate(makeAssignment('2026-05-03'), new Set(), makeDeviceLookup({ workDays: [] }));
    expect(report.violations.find(v => v.rule === 'UNIT_CLOSED')).toBeUndefined();
  });

  it('does not apply UNIT_CLOSED to personnel (non-device) assignments', () => {
    const assignment = makeAssignment('2026-05-03', { kind: 'person' });
    const report = validate(assignment, new Set(), makeDeviceLookup({ workDays: [1, 2, 3, 4, 5] }));
    expect(report.violations.find(v => v.rule === 'UNIT_CLOSED')).toBeUndefined();
  });

  it('UNIT_CLOSED cannot be overridden (stays blocking even when included in overrideRules)', () => {
    const engine = new ConstraintEngine();
    const assignment = makeAssignment('2026-05-03');
    const report = engine.validateWithOverride(
      assignment,
      new AssignmentCollection([]),
      VALID_PERSONNEL,
      makeDeviceLookup({ workDays: [1, 2, 3, 4, 5] }),
      new Set(),
      new Set(),
      EMPTY_TEMPLATE,
      EMPTY_GROUP,
      ['UNIT_CLOSED'],
    );
    expect(report.hasBlocking).toBe(true);
    expect(report.violations.find(v => v.rule === 'UNIT_CLOSED')).toBeDefined();
  });
});

describe('Phase 5C.3 Enforcement: DEVICE_OFF_DATE (DeviceOffDateConstraint)', () => {
  it('rejects device assignment when the device is officially off on that date (BLOCKING non-overridable)', () => {
    const report = validate(makeAssignment('2026-05-05'), new Set(['dev-1:2026-05-05']));
    const violation = report.violations.find(v => v.rule === 'DEVICE_OFF_DATE');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('BLOCKING');
    expect(violation!.isOverrideAllowed).toBe(false);
    expect(report.hasBlocking).toBe(true);
  });

  it('allows device assignment when no DeviceOffDate exists for the date', () => {
    const report = validate(makeAssignment('2026-05-05'), new Set(['dev-1:2026-05-06']));
    expect(report.violations.find(v => v.rule === 'DEVICE_OFF_DATE')).toBeUndefined();
  });
});
