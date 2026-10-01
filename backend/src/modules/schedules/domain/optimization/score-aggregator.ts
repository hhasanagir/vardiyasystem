import { ConstraintScore } from '../constraints/soft-constraint.interface';
import {
  CANONICAL_SCORING_WEIGHTS,
  SOFT_CONSTRAINT_WEIGHTS,
  validateCanonicalWeights,
} from './canonical-scoring.config';

export interface ScoreWeights {
  fairness: number;
  workload: number;
  fatigue: number;
}

export interface AggregatedScore {
  total: number;
  breakdown: ScoreWeights;
  scores: ConstraintScore[];
  explanations: string[];
}

/**
 * ScoreAggregator — Phase 5B.4
 *
 * Uses CANONICAL_SCORING_WEIGHTS from canonical-scoring.config.ts.
 * This is the SINGLE implementation for optimization scoring.
 * ScoringModel (historical) continues to use its own weights for
 * existing schedule evaluation, but both read the same canonical config.
 */
export class ScoreAggregator {
  private readonly weights: ScoreWeights;

  constructor(weights?: Partial<ScoreWeights>) {
    if (!validateCanonicalWeights()) {
      throw new Error('Canonical scoring weights do not sum to 1.0');
    }
    this.weights = {
      fairness: weights?.fairness ?? CANONICAL_SCORING_WEIGHTS.fairness,
      workload: weights?.workload ?? CANONICAL_SCORING_WEIGHTS.workload,
      fatigue: weights?.fatigue ?? CANONICAL_SCORING_WEIGHTS.fatigue,
    };
  }

  aggregate(scores: ConstraintScore[]): AggregatedScore {
    const explanations: string[] = [];
    const breakdown: ScoreWeights = { fairness: 0, workload: 0, fatigue: 0 };

    for (const score of scores) {
      const normalizedScore = this.normalizeScore(score.rawScore);
      const weight = this.getWeight(score.constraintId);
      const weightedScore = normalizedScore * weight;

      switch (score.constraintId) {
        case 'FAIRNESS':
          breakdown.fairness = weightedScore;
          break;
        case 'WORKLOAD_BALANCE':
          breakdown.workload = weightedScore;
          break;
        case 'FATIGUE':
          breakdown.fatigue = weightedScore;
          break;
      }

      explanations.push(score.explanation);
    }

    const total = breakdown.fairness + breakdown.workload + breakdown.fatigue;

    return {
      total: Math.round(total * 10) / 10,
      breakdown: {
        fairness: Math.round(breakdown.fairness * 10) / 10,
        workload: Math.round(breakdown.workload * 10) / 10,
        fatigue: Math.round(breakdown.fatigue * 10) / 10,
      },
      scores,
      explanations,
    };
  }

  private normalizeScore(rawScore: number): number {
    return Math.max(0, Math.min(100, rawScore));
  }

  private getWeight(constraintId: string): number {
    switch (constraintId) {
      case 'FAIRNESS':
        return this.weights.fairness;
      case 'WORKLOAD_BALANCE':
        return this.weights.workload;
      case 'FATIGUE':
        return this.weights.fatigue;
      default:
        return 0;
    }
  }

  getWeights(): ScoreWeights {
    return { ...this.weights };
  }
}
