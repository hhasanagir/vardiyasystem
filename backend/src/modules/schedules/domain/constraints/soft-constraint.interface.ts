import { ConstraintContext } from './constraint.interface';

export interface ConstraintScore {
  constraintId: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
  explanation: string;
  metadata?: Record<string, unknown>;
}

export interface SoftConstraint {
  id: string;
  description: string;
  evaluate(context: ConstraintContext): ConstraintScore;
}
