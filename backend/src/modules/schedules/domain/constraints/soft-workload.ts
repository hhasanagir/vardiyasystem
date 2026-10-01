import {
  SoftConstraint,
  ConstraintScore,
} from '../constraints/soft-constraint.interface';
import { ConstraintContext } from '../constraints/constraint.interface';
import {
  WorkloadCalculator,
  WorkloadPersonnelInfo,
} from '../models/workload-calculator';

export class WorkloadBalanceSoftConstraint implements SoftConstraint {
  id = 'WORKLOAD_BALANCE';
  description =
    'Balanced distribution of total hours, shifts, and types across personnel';

  private readonly calculator: WorkloadCalculator;

  constructor() {
    this.calculator = new WorkloadCalculator();
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const personnelIds = new Set<string>();
    for (const a of context.existingAssignments.all) {
      personnelIds.add(a.personnelId.value);
    }
    personnelIds.add(context.assignment.personnelId.value);

    const personnel: WorkloadPersonnelInfo[] = Array.from(personnelIds).map(
      (id) => ({
        id,
        name: id,
        maxWeeklyHours: 40,
      }),
    );

    const result = this.calculator.calculate({
      assignments: context.existingAssignments,
      personnel,
      holidays: context.holidays,
    });

    return {
      constraintId: this.id,
      rawScore: result.balancePercent,
      weight: 1,
      weightedScore: result.balancePercent,
      explanation: `Workload balance: ${result.balancePercent.toFixed(1)}% avg=${result.avgHoursPerPerson.toFixed(1)}h max=${result.maxHoursPerPerson}h min=${result.minHoursPerPerson}h`,
      metadata: {
        avgHoursPerPerson: result.avgHoursPerPerson,
        maxHoursPerPerson: result.maxHoursPerPerson,
        minHoursPerPerson: result.minHoursPerPerson,
        stdDeviation: result.stdDeviation,
      },
    };
  }
}
