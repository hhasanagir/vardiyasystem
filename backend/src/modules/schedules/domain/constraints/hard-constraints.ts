import {
  HardConstraint,
  ConstraintContext,
  ConstraintResult,
  AssignmentViolation,
  ViolationRule,
} from './constraint.interface';
import { MIN_REST_HOURS } from '../constants';
import { normalizeViolationPolicy } from '../../types/violation-policy';
import { startOfWeek } from '../value-objects/local-date';
import { AssignmentDate } from '../value-objects/assignment-date.value-object';

function violation(
  rule: ViolationRule,
  message: string,
  isOverrideAllowed: boolean,
  severity: 'WARNING' | 'BLOCKING' = 'BLOCKING',
  details?: AssignmentViolation['details'],
): AssignmentViolation {
  return normalizeViolationPolicy({ rule, severity, message, isOverrideAllowed, details });
}

function blocking(rule: ViolationRule, msg: string, details?: AssignmentViolation['details']): AssignmentViolation {
  return violation(rule, msg, false, 'BLOCKING', details);
}

function overridable(rule: ViolationRule, msg: string, details?: AssignmentViolation['details']): AssignmentViolation {
  return violation(rule, msg, true, 'WARNING', details);
}

function result(violations: AssignmentViolation[]): ConstraintResult {
  return {
    passed: violations.length === 0,
    violations,
  };
}

export class PersonnelIsActiveConstraint implements HardConstraint {
  code: ViolationRule = 'INACTIVE_PERSONNEL';
  description = 'Personnel must be active and have active employment status';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) {
      return result([blocking('PERSONNEL_NOT_FOUND', `Personnel not found: ${ctx.assignment.personnelId.value}`)]);
    }
    if (!person.isActive || person.employmentStatus !== 'active') {
      return result([blocking(this.code, `${person.name} is not active (status: ${person.employmentStatus})`)]);
    }
    return result([]);
  }
}

export class DeviceIsRequiredConstraint implements HardConstraint {
  code: ViolationRule = 'DEVICE_REQUIRED';
  description = 'Device assignment requires a valid device for device-kind assignments';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.kind === 'device' && !ctx.assignment.deviceId) {
      return result([blocking(this.code, 'Device is required for device-type assignments')]);
    }
    return result([]);
  }
}

export class NoOverlappingAssignmentsConstraint implements HardConstraint {
  code: ViolationRule = 'TIME_OVERLAP';
  description = 'Personnel cannot have overlapping assignments on the same date';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.shiftType.isNonWorking) return result([]);

    const personAssignments = ctx.existingAssignments.findByPersonnelAndDate(
      ctx.assignment.personnelId,
      ctx.assignment.date,
    );

    for (const existing of personAssignments) {
      if (existing.id === ctx.assignment.id) continue;
      if (existing.shiftType.isNonWorking) continue;
      if (ctx.assignment.timeSlot.overlaps(existing.timeSlot)) {
        return result([
          blocking(this.code, `Time overlap with ${existing.shiftType.label} shift (${existing.startTime}-${existing.endTime})`, {
            currentShift: { date: existing.date.value, shiftType: existing.shiftType.value, startTime: existing.startTime, endTime: existing.endTime },
            newShift: { date: ctx.assignment.date.value, shiftType: ctx.assignment.shiftType.value, startTime: ctx.assignment.timeSlot.startTime, endTime: ctx.assignment.timeSlot.endTime },
          }),
        ]);
      }
    }
    return result([]);
  }
}

export class RequiredRestConstraint implements HardConstraint {
  code: ViolationRule = 'REQUIRED_REST_NOT_MET';
  description = 'Minimum rest period between shifts must be met';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.shiftType.isNonWorking) return result([]);

    const prevAssignment = ctx.existingAssignments.getLastAssignmentBefore(
      ctx.assignment.personnelId,
      ctx.assignment.date,
    );
    if (!prevAssignment) return result([]);

    const prevEnd = new Date(`${prevAssignment.date.value}T${prevAssignment.endTime}`);
    const nextStart = new Date(`${ctx.assignment.date.value}T${ctx.assignment.timeSlot.startTime}`);
    const diffMs = nextStart.getTime() - prevEnd.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < MIN_REST_HOURS) {
      return result([
        overridable(this.code, `Only ${diffHours.toFixed(1)}h rest (minimum ${MIN_REST_HOURS}h required)`, {
          currentShift: { date: prevAssignment.date.value, shiftType: prevAssignment.shiftType.value, startTime: prevAssignment.startTime, endTime: prevAssignment.endTime },
          newShift: { date: ctx.assignment.date.value, shiftType: ctx.assignment.shiftType.value, startTime: ctx.assignment.timeSlot.startTime, endTime: ctx.assignment.timeSlot.endTime },
          restHours: diffHours,
          minRestHours: MIN_REST_HOURS,
        }),
      ]);
    }
    return result([]);
  }
}

export class NightShiftEligibilityConstraint implements HardConstraint {
  code: ViolationRule = 'NOT_NIGHT_ELIGIBLE';
  description = 'Only night-eligible personnel can be assigned night shifts';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.shiftType.isNightShift) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) return result([]);

    if (!person.nightShiftEligible) {
      return result([blocking(this.code, `${person.name} is not eligible for night shifts`)]);
    }
    return result([]);
  }
}

export class OffDayConflictConstraint implements HardConstraint {
  code: ViolationRule = 'OFF_DAY_CONFLICT';
  description = 'Personnel cannot be assigned on their configured off days';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.shiftType.isNonWorking) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) return result([]);

    const dayOfWeek = ctx.assignment.date.dayOfWeek;
    if (person.offDays.includes(dayOfWeek)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return result([
        overridable(this.code, `${person.name}'s off day is ${dayNames[dayOfWeek]}`, {
          dayOfWeek: dayNames[dayOfWeek],
          personnelName: person.name,
        }),
      ]);
    }
    return result([]);
  }
}

export class PersonnelInUnitConstraint implements HardConstraint {
  code: ViolationRule = 'PERSONNEL_NOT_IN_UNIT';
  description = 'Personnel must belong to the unit they are assigned to';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) return result([]);

    if (ctx.assignment.unitId && person.unitId !== ctx.assignment.unitId) {
      return result([blocking(this.code, `${person.name} does not belong to this unit`)]);
    }
    return result([]);
  }
}

export class PersonnelInGroupConstraint implements HardConstraint {
  code: ViolationRule = 'PERSONNEL_NOT_IN_GROUP';
  description = 'Personnel must belong to the group they are assigned to';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.personnelGroupId) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) return result([]);

    if (person.groupId !== ctx.assignment.personnelGroupId) {
      return result([blocking(this.code, `${person.name} does not belong to the assigned group`)]);
    }
    return result([]);
  }
}

export class DeviceSkillsConstraint implements HardConstraint {
  code: ViolationRule = 'PERSON_DEVICE_NOT_ALLOWED';
  description = 'Personnel must have at least one required skill for the assigned device (ANY semantics, aligned with the optimizer)';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.deviceId) return result([]);

    const device = ctx.deviceLookup.findById(ctx.assignment.deviceId.value);
    if (!device) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person) return result([]);

    if (device.requiredSkills.length > 0) {
      // ANY semantics: this is the same eligibility rule the optimizer uses
      // (greedy-strategy.ts). Requiring ALL skills here used to be masked by an
      // overridable WARNING; with the unified BLOCKING policy it must agree
      // with the optimizer rather than block genuinely eligible personnel.
      const hasAnySkill = device.requiredSkills.some(
        skill => person.deviceSkills.includes(skill) || person.skills.includes(skill),
      );
      if (!hasAnySkill) {
        return result([
          blocking(this.code, `${person.name} has none of the required skills for ${device.name}`),
        ]);
      }
    }
    return result([]);
  }
}

export class TemplateValidationConstraint implements HardConstraint {
  code: ViolationRule = 'TEMPLATE_NOT_FOUND';
  description = 'Shift template must exist and match the assignment';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.shiftTemplateId) return result([]);

    const template = ctx.templates.findById(ctx.assignment.shiftTemplateId);
    if (!template) {
      return result([blocking(this.code, `Shift template not found: ${ctx.assignment.shiftTemplateId}`)]);
    }
    if (!template.isActive) {
      return result([blocking('TEMPLATE_NOT_FOUND', `Shift template is inactive: ${template.name}`)]);
    }
    if (ctx.assignment.shiftType.value !== template.shiftType) {
      return result([
        blocking('TEMPLATE_SHIFT_MISMATCH', `Template shift type (${template.shiftType}) does not match assignment (${ctx.assignment.shiftType.value})`),
      ]);
    }
    return result([]);
  }
}

export class GroupSlotOccupiedConstraint implements HardConstraint {
  code: ViolationRule = 'GROUP_SLOT_OCCUPIED';
  description = 'Group slot for the shift must not already be occupied';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.personnelGroupId || !ctx.assignment.shiftTemplateId) return result([]);

    const existingInGroup = ctx.existingAssignments.all.filter(
      a =>
        a.id !== ctx.assignment.id &&
        a.personnelGroupId === ctx.assignment.personnelGroupId &&
        a.shiftTemplateId === ctx.assignment.shiftTemplateId &&
        a.date.isSameDay(ctx.assignment.date),
    );

    if (existingInGroup.length > 0) {
      return result([
        overridable(this.code, `Group slot already occupied for this shift template on ${ctx.assignment.date.value}`),
      ]);
    }
    return result([]);
  }
}

export class RequiredRestConstraintNew implements HardConstraint {
  code: ViolationRule = 'REST_RULE_VIOLATION';
  description = 'Rest rule between consecutive night shifts';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.shiftType.isNightShift) return result([]);

    const lastNight = ctx.existingAssignments.getLastNightShiftBefore(
      ctx.assignment.personnelId,
      ctx.assignment.date,
    );
    if (!lastNight) return result([]);

    const daysBetween = lastNight.date.daysUntil(ctx.assignment.date);
    if (daysBetween < 2) {
      return result([
        blocking(this.code, `Night shift requires 1+ day rest between consecutive nights (last night: ${lastNight.date.value})`, {
          restHours: daysBetween * 24,
          minRestHours: 48,
        }),
      ]);
    }
    return result([]);
  }
}

export class DeviceWorkDaysConstraint implements HardConstraint {
  code: ViolationRule = 'UNIT_CLOSED';
  description = 'Cannot assign to a device on a day outside the device/unit work schedule';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.kind !== 'device' || !ctx.assignment.deviceId) return result([]);

    const device = ctx.deviceLookup.findById(ctx.assignment.deviceId.value);
    if (!device) return result([]);

    const workDays = device.workDays || [];
    if (workDays.length === 0) return result([]);

    const dayOfWeek = ctx.assignment.date.dayOfWeek;
    if (!workDays.includes(dayOfWeek)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return result([
        blocking(this.code, `${device.name} (${device.code}) is closed on ${dayNames[dayOfWeek]}`, {
          dayOfWeek: dayNames[dayOfWeek],
        }),
      ]);
    }
    return result([]);
  }
}

export class DeviceOffDateConstraint implements HardConstraint {
  code: ViolationRule = 'DEVICE_OFF_DATE';
  description = 'Cannot assign to a device that is officially off on the given date';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.deviceId) return result([]);
    const key = `${ctx.assignment.deviceId}:${ctx.assignment.date}`;
    if (ctx.deviceOffDates?.has(key)) {
      return result([blocking(this.code, `Device is off on ${ctx.assignment.date}`)]);
    }
    return result([]);
  }
}

export class PersonnelAvailabilityConstraint implements HardConstraint {
  code: ViolationRule = 'PERSONNEL_AVAILABILITY_CONFLICT';
  description = 'Personnel cannot be assigned on dates blocked by leave/absence/unsuitable availability';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.shiftType.isNonWorking) return result([]);

    const blocked = ctx.personnelBlockedDates?.get(ctx.assignment.personnelId.value);
    if (!blocked || !blocked.has(ctx.assignment.date.value)) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    const name = person?.name || ctx.assignment.personnelId.value;
    return result([
      blocking(this.code, `${name} is not available on ${ctx.assignment.date.value} (izin/rapor/uygunsuz)`, {
        personnelName: name,
        blockingType: 'leave/absence/unsuitable',
      }),
    ]);
  }
}

/**
 * P2-14 — holiday capacity rule (internal scheduling policy, not a legal
 * determination). The generator deliberately produces only day slots on a
 * Holiday date; validation must reject a conflicting non-daytime working
 * shift rather than silently accepting what the generator can never create.
 * `day`/`morning` are the permitted daytime types; `evening`/`night` are
 * BLOCKING and cannot be overridden.
 */
export class HolidayShiftConstraint implements HardConstraint {
  code: ViolationRule = 'HOLIDAY_CONFLICT';
  description = 'Only daytime working shifts are permitted on a holiday date';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    const date = ctx.assignment.date.value;
    if (!ctx.holidays?.has(date)) return result([]);
    if (!ctx.assignment.shiftType.isWorking) return result([]);

    const shift = ctx.assignment.shiftType.value;
    if (shift === 'day' || shift === 'morning') return result([]);

    return result([
      blocking(
        this.code,
        `Holiday ${date}: ${ctx.assignment.shiftType.label} working shift is not permitted (only daytime shifts are configured)`,
        {
          holidayDate: date,
          newShift: {
            date,
            shiftType: shift,
            startTime: ctx.assignment.startTime,
            endTime: ctx.assignment.endTime,
          },
        },
      ),
    ]);
  }
}

/**
 * P2-11 — the weekly cap is a hard, authoritative limit. The ledger is derived
 * from the same collection the engine already uses, so the legacy validator
 * and both optimizer paths cannot disagree about a person's worked hours.
 */
export class WeeklyHoursLimitConstraint implements HardConstraint {
  code: ViolationRule = 'MAX_WORK_EXCEEDED';
  description = 'Weekly worked hours must not exceed personnel.maxWeeklyHours';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.shiftType.isWorking) return result([]);

    const person = ctx.personnelLookup.findById(ctx.assignment.personnelId.value);
    if (!person || !person.maxWeeklyHours || person.maxWeeklyHours <= 0) return result([]);

    const weekStart = startOfWeek(ctx.assignment.date.value);
    const priorHours = ctx.existingAssignments.getWeeklyHours(
      ctx.assignment.personnelId,
      AssignmentDate.create(weekStart),
    );
    const actualHours = priorHours + ctx.assignment.durationHours;
    if (actualHours <= person.maxWeeklyHours) return result([]);

    return result([
      blocking(
        this.code,
        `MAX_WORK_EXCEEDED — ${person.name}: ${actualHours.toFixed(1)}h in week ${weekStart} exceeds ${person.maxWeeklyHours}h`,
        {
          personnelName: person.name,
          maxHours: person.maxWeeklyHours,
          actualHours,
          weekStart,
          newShift: {
            date: ctx.assignment.date.value,
            shiftType: ctx.assignment.shiftType.value,
            startTime: ctx.assignment.startTime,
            endTime: ctx.assignment.endTime,
          },
        },
      ),
    ]);
  }
}

/**
 * P2-01/02/03 — the six rules that previously existed only in the legacy
 * validator are now canonical DDD hard constraints. Both surfaces call the
 * same ConstraintEngine/VIOLATION_POLICY, so strictest-wins parity cannot drift.
 */
export class DeviceBookedConstraint implements HardConstraint {
  code: ViolationRule = 'DEVICE_BOOKED';
  description = 'A device cannot hold two assignments for the same slot and personnel type';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.kind !== 'device' || !ctx.assignment.deviceId) return result([]);

    const booked = ctx.existingAssignments.all.find(
      a =>
        a.id !== ctx.assignment.id &&
        a.deviceId?.value === ctx.assignment.deviceId!.value &&
        a.date.value === ctx.assignment.date.value &&
        a.shiftType.value === ctx.assignment.shiftType.value &&
        a.personnelType === ctx.assignment.personnelType,
    );
    if (!booked) return result([]);

    return result([
      blocking(this.code, `Device is already booked for ${ctx.assignment.date.value} ${ctx.assignment.shiftType.label}`, {
        currentShift: { date: booked.date.value, shiftType: booked.shiftType.value, startTime: booked.startTime, endTime: booked.endTime },
        newShift: { date: ctx.assignment.date.value, shiftType: ctx.assignment.shiftType.value, startTime: ctx.assignment.startTime, endTime: ctx.assignment.endTime },
      }),
    ]);
  }
}

export class GroupReferenceConstraint implements HardConstraint {
  code: ViolationRule = 'GROUP_NOT_FOUND';
  description = 'Personnel group must exist and belong to the assignment unit';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.personnelGroupId) return result([]);

    const group = ctx.groups.findById(ctx.assignment.personnelGroupId);
    if (!group) {
      return result([blocking(this.code, `Personnel group not found: ${ctx.assignment.personnelGroupId}`)]);
    }
    if (ctx.assignment.unitId && group.unitId !== ctx.assignment.unitId) {
      return result([blocking('GROUP_NOT_IN_UNIT', `Group ${group.name} does not belong to this unit`)]);
    }
    return result([]);
  }
}

export class TemplateScopeConstraint implements HardConstraint {
  code: ViolationRule = 'TEMPLATE_NOT_IN_GROUP';
  description = 'Shift template must belong to the assigned personnel group and unit';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.shiftTemplateId) return result([]);
    if (ctx.assignment.kind !== 'person' && !ctx.assignment.personnelGroupId) return result([]);

    const template = ctx.templates.findById(ctx.assignment.shiftTemplateId);
    // TEMPLATE_NOT_FOUND is emitted by TemplateValidationConstraint; no double report.
    if (!template) return result([]);

    const violations: AssignmentViolation[] = [];
    if (ctx.assignment.personnelGroupId && template.personnelGroupId !== ctx.assignment.personnelGroupId) {
      violations.push(blocking(this.code, `Template ${template.name} does not belong to the assigned group`));
    }
    if (ctx.assignment.unitId && template.unitId !== ctx.assignment.unitId) {
      violations.push(blocking('TEMPLATE_NOT_IN_UNIT', `Template ${template.name} does not belong to this unit`));
    }
    return result(violations);
  }
}

export class SameSlotConstraint implements HardConstraint {
  code: ViolationRule = 'SAME_SLOT';
  description = 'Personnel cannot occupy the same date/shift slot twice';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    const duplicate = ctx.existingAssignments.all.find(
      a =>
        a.id !== ctx.assignment.id &&
        a.personnelId.equals(ctx.assignment.personnelId) &&
        a.date.isSameDay(ctx.assignment.date) &&
        a.shiftType.value === ctx.assignment.shiftType.value,
    );
    if (!duplicate) return result([]);

    return result([
      blocking(this.code, `Personnel is already assigned to ${ctx.assignment.date.value} ${ctx.assignment.shiftType.label}`, {
        currentShift: { date: duplicate.date.value, shiftType: duplicate.shiftType.value, startTime: duplicate.startTime, endTime: duplicate.endTime },
        newShift: { date: ctx.assignment.date.value, shiftType: ctx.assignment.shiftType.value, startTime: ctx.assignment.startTime, endTime: ctx.assignment.endTime },
      }),
    ]);
  }
}

export const ALL_HARD_CONSTRAINTS: HardConstraint[] = [
  new PersonnelIsActiveConstraint(),
  new DeviceIsRequiredConstraint(),
  new NoOverlappingAssignmentsConstraint(),
  new RequiredRestConstraint(),
  new NightShiftEligibilityConstraint(),
  new OffDayConflictConstraint(),
  new PersonnelInUnitConstraint(),
  new PersonnelInGroupConstraint(),
  new DeviceSkillsConstraint(),
  new TemplateValidationConstraint(),
  new GroupSlotOccupiedConstraint(),
  new RequiredRestConstraintNew(),
  new DeviceWorkDaysConstraint(),
  new DeviceOffDateConstraint(),
  new PersonnelAvailabilityConstraint(),
  new HolidayShiftConstraint(),
  new WeeklyHoursLimitConstraint(),
  // P2-01/02/03 — legacy-only rules promoted to the canonical engine.
  new DeviceBookedConstraint(),
  new GroupReferenceConstraint(),
  new TemplateScopeConstraint(),
  new SameSlotConstraint(),
];
