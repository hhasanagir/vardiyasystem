import { SoftConstraint, ConstraintScore } from '../constraints/soft-constraint.interface';
import { ConstraintContext } from '../constraints/constraint.interface';
import { FairnessEngine, FairnessInput, FairnessPersonnelInfo } from '../models/fairness-engine';
import { daysInMonth } from '../value-objects/local-date';

export interface FairnessSoftConstraintConfig {
  nightWeight: number;
  weekendWeight: number;
  holidayWeight: number;
  workloadWeight: number;
}

const DEFAULT_FAIRNESS_CONFIG: FairnessSoftConstraintConfig = {
  nightWeight: 0.25,
  weekendWeight: 0.20,
  holidayWeight: 0.15,
  workloadWeight: 0.40,
};

export class FairnessSoftConstraint implements SoftConstraint {
  id = 'FAIRNESS';
  description = 'Fair distribution of night, weekend, holiday, and workload assignments across personnel';

  private readonly fairnessEngine: FairnessEngine;
  private readonly config: FairnessSoftConstraintConfig;

  constructor(config?: Partial<FairnessSoftConstraintConfig>) {
    this.config = { ...DEFAULT_FAIRNESS_CONFIG, ...config };
    this.fairnessEngine = new FairnessEngine();
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    // P2-02 — use the real problem roster (including personnel with zero
    // assignments) instead of deriving names/eligibility/caps from assignment
    // ids. The fallback only applies to minimal unit-test contexts that do not
    // expose a roster; production lookups always provide `all()`.
    const roster = context.personnelLookup.all?.();
    const personnelIds = new Set<string>((roster ?? []).map(p => p.id));
    for (const a of context.existingAssignments.all) {
      personnelIds.add(a.personnelId.value);
    }
    personnelIds.add(context.assignment.personnelId.value);

    const personnel: FairnessPersonnelInfo[] = Array.from(personnelIds).map(id => {
      const info = context.personnelLookup.findById(id) ?? roster?.find(p => p.id === id);
      return {
        id,
        name: info?.name ?? id,
        nightShiftEligible: info?.nightShiftEligible ?? true,
        maxWeeklyHours: info?.maxWeeklyHours ?? 40,
      };
    });

    const monthDays = context.year && context.month
      ? daysInMonth(context.year, context.month)
      : 30;

    const input: FairnessInput = {
      assignments: context.existingAssignments,
      personnel,
      holidays: context.holidays,
      monthDays,
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
        personnelCount: personnel.length,
        realPersonnelData: Boolean(roster),
        monthDays,
      },
    };
  }
}
