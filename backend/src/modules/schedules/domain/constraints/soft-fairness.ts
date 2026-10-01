import {
  SoftConstraint,
  ConstraintScore,
} from '../constraints/soft-constraint.interface';
import { ConstraintContext } from '../constraints/constraint.interface';
import {
  FairnessEngine,
  FairnessInput,
  FairnessPersonnelInfo,
} from '../models/fairness-engine';

export interface FairnessSoftConstraintConfig {
  nightWeight: number;
  weekendWeight: number;
  holidayWeight: number;
  workloadWeight: number;
}

const DEFAULT_FAIRNESS_CONFIG: FairnessSoftConstraintConfig = {
  nightWeight: 0.25,
  weekendWeight: 0.2,
  holidayWeight: 0.15,
  workloadWeight: 0.4,
};

export class FairnessSoftConstraint implements SoftConstraint {
  id = 'FAIRNESS';
  description =
    'Fair distribution of night, weekend, holiday, and workload assignments across personnel';

  private readonly fairnessEngine: FairnessEngine;
  private readonly config: FairnessSoftConstraintConfig;

  constructor(config?: Partial<FairnessSoftConstraintConfig>) {
    this.config = { ...DEFAULT_FAIRNESS_CONFIG, ...config };
    this.fairnessEngine = new FairnessEngine();
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const personnelIds = new Set<string>();
    for (const a of context.existingAssignments.all) {
      personnelIds.add(a.personnelId.value);
    }
    personnelIds.add(context.assignment.personnelId.value);

    const personnel: FairnessPersonnelInfo[] = Array.from(personnelIds).map(
      (id) => ({
        id,
        name: id,
        nightShiftEligible: true,
        maxWeeklyHours: 40,
      }),
    );

    const input: FairnessInput = {
      assignments: context.existingAssignments,
      personnel,
      holidays: context.holidays,
      monthDays: 30,
    };

    const result = this.fairnessEngine.calculate(input);

    return {
      constraintId: this.id,
      rawScore: result.overallScore,
      weight: 1,
      weightedScore: result.overallScore,
      explanation: `Fairness: night=${result.nightScore.toFixed(1)} weekend=${result.weekendScore.toFixed(1)} holiday=${result.holidayScore.toFixed(1)} workload=${result.workloadScore.toFixed(1)}`,
      metadata: {
        nightScore: result.nightScore,
        weekendScore: result.weekendScore,
        holidayScore: result.holidayScore,
        workloadScore: result.workloadScore,
      },
    };
  }
}
