import {
  SoftConstraint,
  ConstraintScore,
} from '../constraints/soft-constraint.interface';
import { ConstraintContext } from '../constraints/constraint.interface';
import { FatigueEngine, FatigueInput } from '../models/fatigue-engine';

export class FatigueSoftConstraint implements SoftConstraint {
  id = 'FATIGUE';
  description =
    'Fatigue scoring based on consecutive shifts, rest intervals, and accumulated workload';

  private readonly fatigueEngine: FatigueEngine;

  constructor() {
    this.fatigueEngine = new FatigueEngine();
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const input: FatigueInput = {
      candidateDate: context.assignment.date.value,
      candidateShiftType: context.assignment.shiftType.value,
      candidateStartTime: context.assignment.timeSlot.startTime,
      candidateEndTime: context.assignment.timeSlot.endTime,
      personnelId: context.assignment.personnelId.value,
      existingAssignments: context.existingAssignments,
      holidays: context.holidays,
    };

    const result = this.fatigueEngine.evaluate(input);

    return {
      constraintId: this.id,
      rawScore: result.score,
      weight: 1,
      weightedScore: result.score,
      explanation: `Fatigue: score=${result.score.toFixed(1)} risk=${result.riskLevel} factors=${result.factors.length}`,
      metadata: {
        riskLevel: result.riskLevel,
        factorCount: result.factors.length,
        factorTypes: result.factors.map((f) => f.type),
      },
    };
  }
}
