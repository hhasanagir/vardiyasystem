import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import {
  HardConstraint,
  ConstraintContext,
  ConstraintResult,
  AssignmentViolation,
  PersonnelLookup,
  DeviceLookup,
  ShiftTemplateLookup,
  GroupLookup,
} from './constraint.interface';
import { ALL_HARD_CONSTRAINTS } from './hard-constraints';
import { normalizeViolationPolicy } from '../../types/violation-policy';

export interface ValidationReport {
  violations: AssignmentViolation[];
  hasBlocking: boolean;
  hasOverridable: boolean;
  checkedConstraints: number;
}

export class ConstraintEngine {
  private readonly constraints: HardConstraint[];

  constructor(customConstraints?: HardConstraint[]) {
    this.constraints = customConstraints || ALL_HARD_CONSTRAINTS;
  }

  validate(
    assignment: Assignment,
    existingAssignments: AssignmentCollection,
    personnelLookup: PersonnelLookup,
    deviceLookup: DeviceLookup,
    holidays: Set<string>,
    deviceOffDates: Set<string>,
    templates: ShiftTemplateLookup,
    groups: GroupLookup,
    personnelBlockedDates?: Map<string, Set<string>>,
  ): ValidationReport {
    const context: ConstraintContext = {
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      deviceOffDates,
      templates,
      groups,
      now: new Date(),
      personnelBlockedDates,
    };

    const allViolations: AssignmentViolation[] = [];

    for (const constraint of this.constraints) {
      const result = constraint.evaluate(context);
      // Central normalization point: every engine result obeys the same policy.
      allViolations.push(...result.violations.map(violation => normalizeViolationPolicy(violation)));
    }

    return {
      violations: allViolations,
      hasBlocking: allViolations.some(v => v.severity === 'BLOCKING'),
      hasOverridable: allViolations.some(v => v.isOverrideAllowed),
      checkedConstraints: this.constraints.length,
    };
  }

  validateWithOverride(
    assignment: Assignment,
    existingAssignments: AssignmentCollection,
    personnelLookup: PersonnelLookup,
    deviceLookup: DeviceLookup,
    holidays: Set<string>,
    deviceOffDates: Set<string>,
    templates: ShiftTemplateLookup,
    groups: GroupLookup,
    overrideRules: string[],
    personnelBlockedDates?: Map<string, Set<string>>,
  ): ValidationReport {
    const report = this.validate(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      deviceOffDates,
      templates,
      groups,
      personnelBlockedDates,
    );

    if (!report.hasBlocking) return report;

    const overridableViolations = report.violations.filter(
      v => v.severity === 'BLOCKING' && v.isOverrideAllowed && overrideRules.includes(v.rule),
    );
    const blockingViolations = report.violations.filter(
      v => !(v.severity === 'BLOCKING' && v.isOverrideAllowed && overrideRules.includes(v.rule)),
    );

    return {
      violations: blockingViolations,
      hasBlocking: blockingViolations.length > 0,
      hasOverridable: false,
      checkedConstraints: this.constraints.length,
    };
  }

  canOverride(
    assignment: Assignment,
    existingAssignments: AssignmentCollection,
    personnelLookup: PersonnelLookup,
    deviceLookup: DeviceLookup,
    holidays: Set<string>,
    deviceOffDates: Set<string>,
    templates: ShiftTemplateLookup,
    groups: GroupLookup,
    overrideRules: string[],
    personnelBlockedDates?: Map<string, Set<string>>,
  ): { canOverride: boolean; blockingViolations: AssignmentViolation[] } {
    const report = this.validate(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      deviceOffDates,
      templates,
      groups,
      personnelBlockedDates,
    );

    const blockingViolations = report.violations.filter(v => v.severity === 'BLOCKING');

    if (blockingViolations.length === 0) {
      return { canOverride: true, blockingViolations: [] };
    }

    const allOverridable = blockingViolations.every(
      v => v.isOverrideAllowed && overrideRules.includes(v.rule),
    );

    return {
      canOverride: allOverridable,
      blockingViolations,
    };
  }
}
