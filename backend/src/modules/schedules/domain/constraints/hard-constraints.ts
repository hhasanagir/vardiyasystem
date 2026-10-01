import {
  HardConstraint,
  ConstraintContext,
  ConstraintResult,
  AssignmentViolation,
  ViolationRule,
} from './constraint.interface';
import { MIN_REST_HOURS } from '../constants';

function violation(
  rule: ViolationRule,
  message: string,
  isOverrideAllowed: boolean,
  severity: 'WARNING' | 'BLOCKING' = 'BLOCKING',
  details?: AssignmentViolation['details'],
): AssignmentViolation {
  return { rule, severity, message, isOverrideAllowed, details };
}

function blocking(
  rule: ViolationRule,
  msg: string,
  details?: AssignmentViolation['details'],
): AssignmentViolation {
  return violation(rule, msg, false, 'BLOCKING', details);
}

function overridable(
  rule: ViolationRule,
  msg: string,
  details?: AssignmentViolation['details'],
): AssignmentViolation {
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
    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) {
      return result([
        blocking(
          'PERSONNEL_NOT_FOUND',
          `Personnel not found: ${ctx.assignment.personnelId.value}`,
        ),
      ]);
    }
    if (!person.isActive || person.employmentStatus !== 'active') {
      return result([
        blocking(
          this.code,
          `${person.name} is not active (status: ${person.employmentStatus})`,
        ),
      ]);
    }
    return result([]);
  }
}

export class DeviceIsRequiredConstraint implements HardConstraint {
  code: ViolationRule = 'DEVICE_REQUIRED';
  description =
    'Device assignment requires a valid device for device-kind assignments';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.kind === 'device' && !ctx.assignment.deviceId) {
      return result([
        blocking(this.code, 'Device is required for device-type assignments'),
      ]);
    }
    return result([]);
  }
}

export class NoOverlappingAssignmentsConstraint implements HardConstraint {
  code: ViolationRule = 'TIME_OVERLAP';
  description =
    'Personnel cannot have overlapping assignments on the same date';

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
          blocking(
            this.code,
            `Time overlap with ${existing.shiftType.label} shift (${existing.startTime}-${existing.endTime})`,
            {
              currentShift: {
                date: existing.date.value,
                shiftType: existing.shiftType.value,
                startTime: existing.startTime,
                endTime: existing.endTime,
              },
              newShift: {
                date: ctx.assignment.date.value,
                shiftType: ctx.assignment.shiftType.value,
                startTime: ctx.assignment.timeSlot.startTime,
                endTime: ctx.assignment.timeSlot.endTime,
              },
            },
          ),
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

    const prevEnd = new Date(
      `${prevAssignment.date.value}T${prevAssignment.endTime}`,
    );
    const nextStart = new Date(
      `${ctx.assignment.date.value}T${ctx.assignment.timeSlot.startTime}`,
    );
    const diffMs = nextStart.getTime() - prevEnd.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < MIN_REST_HOURS) {
      return result([
        overridable(
          this.code,
          `Only ${diffHours.toFixed(1)}h rest (minimum ${MIN_REST_HOURS}h required)`,
          {
            currentShift: {
              date: prevAssignment.date.value,
              shiftType: prevAssignment.shiftType.value,
              startTime: prevAssignment.startTime,
              endTime: prevAssignment.endTime,
            },
            newShift: {
              date: ctx.assignment.date.value,
              shiftType: ctx.assignment.shiftType.value,
              startTime: ctx.assignment.timeSlot.startTime,
              endTime: ctx.assignment.timeSlot.endTime,
            },
            restHours: diffHours,
            minRestHours: MIN_REST_HOURS,
          },
        ),
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

    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) return result([]);

    if (!person.nightShiftEligible) {
      return result([
        blocking(this.code, `${person.name} is not eligible for night shifts`),
      ]);
    }
    return result([]);
  }
}

export class OffDayConflictConstraint implements HardConstraint {
  code: ViolationRule = 'OFF_DAY_CONFLICT';
  description = 'Personnel cannot be assigned on their configured off days';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (ctx.assignment.shiftType.isNonWorking) return result([]);

    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) return result([]);

    const dayOfWeek = ctx.assignment.date.dayOfWeek;
    if (person.offDays.includes(dayOfWeek)) {
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      return result([
        overridable(
          this.code,
          `${person.name}'s off day is ${dayNames[dayOfWeek]}`,
          {
            dayOfWeek: dayNames[dayOfWeek],
            personnelName: person.name,
          },
        ),
      ]);
    }
    return result([]);
  }
}

export class PersonnelInUnitConstraint implements HardConstraint {
  code: ViolationRule = 'PERSONNEL_NOT_IN_UNIT';
  description = 'Personnel must belong to the unit they are assigned to';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) return result([]);

    if (ctx.assignment.unitId && person.unitId !== ctx.assignment.unitId) {
      return result([
        blocking(this.code, `${person.name} does not belong to this unit`),
      ]);
    }
    return result([]);
  }
}

export class PersonnelInGroupConstraint implements HardConstraint {
  code: ViolationRule = 'PERSONNEL_NOT_IN_GROUP';
  description = 'Personnel must belong to the group they are assigned to';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.personnelGroupId) return result([]);

    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) return result([]);

    if (person.groupId !== ctx.assignment.personnelGroupId) {
      return result([
        blocking(
          this.code,
          `${person.name} does not belong to the assigned group`,
        ),
      ]);
    }
    return result([]);
  }
}

export class DeviceSkillsConstraint implements HardConstraint {
  code: ViolationRule = 'PERSON_DEVICE_NOT_ALLOWED';
  description =
    'Personnel must have the required skills for the assigned device';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.deviceId) return result([]);

    const device = ctx.deviceLookup.findById(ctx.assignment.deviceId.value);
    if (!device) return result([]);

    const person = ctx.personnelLookup.findById(
      ctx.assignment.personnelId.value,
    );
    if (!person) return result([]);

    if (device.requiredSkills.length > 0) {
      const hasAllSkills = device.requiredSkills.every(
        (skill) =>
          person.deviceSkills.includes(skill) || person.skills.includes(skill),
      );
      if (!hasAllSkills) {
        return result([
          overridable(
            this.code,
            `${person.name} may not have required skills for ${device.name}`,
          ),
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
      return result([
        blocking(
          this.code,
          `Shift template not found: ${ctx.assignment.shiftTemplateId}`,
        ),
      ]);
    }
    if (!template.isActive) {
      return result([
        blocking(
          'TEMPLATE_NOT_FOUND',
          `Shift template is inactive: ${template.name}`,
        ),
      ]);
    }
    if (ctx.assignment.shiftType.value !== template.shiftType) {
      return result([
        blocking(
          'TEMPLATE_SHIFT_MISMATCH',
          `Template shift type (${template.shiftType}) does not match assignment (${ctx.assignment.shiftType.value})`,
        ),
      ]);
    }
    return result([]);
  }
}

export class GroupSlotOccupiedConstraint implements HardConstraint {
  code: ViolationRule = 'GROUP_SLOT_OCCUPIED';
  description = 'Group slot for the shift must not already be occupied';

  evaluate(ctx: ConstraintContext): ConstraintResult {
    if (!ctx.assignment.personnelGroupId || !ctx.assignment.shiftTemplateId)
      return result([]);

    const existingInGroup = ctx.existingAssignments.all.filter(
      (a) =>
        a.id !== ctx.assignment.id &&
        a.personnelGroupId === ctx.assignment.personnelGroupId &&
        a.shiftTemplateId === ctx.assignment.shiftTemplateId &&
        a.date.isSameDay(ctx.assignment.date),
    );

    if (existingInGroup.length > 0) {
      return result([
        overridable(
          this.code,
          `Group slot already occupied for this shift template on ${ctx.assignment.date.value}`,
        ),
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
        blocking(
          this.code,
          `Night shift requires 1+ day rest between consecutive nights (last night: ${lastNight.date.value})`,
          {
            restHours: daysBetween * 24,
            minRestHours: 48,
          },
        ),
      ]);
    }
    return result([]);
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
];
