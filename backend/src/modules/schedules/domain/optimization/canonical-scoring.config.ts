/**
 * Canonical Scoring Configuration — Phase 5B.4
 *
 * Single source of truth for ALL scoring weights in the optimizer.
 * Both ScoreAggregator and ScoringModel MUST read from this configuration.
 *
 * ScoringModel (historical):
 *   coverage=0.35, fairness=0.30, workload=0.25, preference=0.10
 *   Used by: ScheduleValidationService for existing schedule scoring.
 *
 * ScoreAggregator (optimization):
 *   fairness=0.40, workload=0.30, fatigue=0.30
 *   Used by: GreedyOptimizationStrategy during candidate generation.
 *
 * CANONICAL WEIGHTS (Phase 5B.4):
 *   fairness=0.35, workload=0.25, fatigue=0.25, coverage=0.15
 *
 * Reason:
 *   - fairness stays at ScoringModel level (0.35) — domain-proven
 *   - workload stays at 0.25 — balanced with fatigue
 *   - fatigue replaces preference at 0.25 — fatigue IS the preference signal
 *   - coverage at 0.15 — fills remaining weight, ensures coverage matters
 *   - Total: 1.00
 */
export interface CanonicalScoringWeights {
  readonly fairness: number;
  readonly workload: number;
  readonly fatigue: number;
  readonly coverage: number;
}

export const CANONICAL_SCORING_WEIGHTS: CanonicalScoringWeights = {
  fairness: 0.35,
  workload: 0.25,
  fatigue: 0.25,
  coverage: 0.15,
} as const;

/**
 * Soft constraint ID to canonical weight mapping.
 * Used by ScoreAggregator to look up weights.
 */
export const SOFT_CONSTRAINT_WEIGHTS: Record<string, number> = {
  FAIRNESS: CANONICAL_SCORING_WEIGHTS.fairness,
  WORKLOAD_BALANCE: CANONICAL_SCORING_WEIGHTS.workload,
  FATIGUE: CANONICAL_SCORING_WEIGHTS.fatigue,
} as const;

/**
 * Penalty multiplier for hard constraint violations.
 * Matches ScoringModel's penaltyMultiplier.
 */
export const PENALTY_MULTIPLIER = 2.0;

/**
 * Validates that canonical weights sum to 1.0 (within floating-point tolerance).
 */
export function validateCanonicalWeights(): boolean {
  const sum =
    CANONICAL_SCORING_WEIGHTS.fairness +
    CANONICAL_SCORING_WEIGHTS.workload +
    CANONICAL_SCORING_WEIGHTS.fatigue +
    CANONICAL_SCORING_WEIGHTS.coverage;
  return Math.abs(sum - 1.0) < 0.001;
}
