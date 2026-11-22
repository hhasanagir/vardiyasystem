import { describe, it, expect } from 'vitest';
import { ScoreAggregator } from '../domain/optimization/score-aggregator';
import {
  CANONICAL_SCORING_WEIGHTS,
  SOFT_CONSTRAINT_WEIGHTS,
  validateCanonicalWeights,
} from '../domain/optimization/canonical-scoring.config';
import { LocalSearchOptimizationStrategy } from '../domain/optimization/local-search-strategy';
import { OptimizationStrategyId } from '../dto/dry-run-optimization.dto';

describe('P2-02 — scoring weights and strategy DTO', () => {
  it('exposes the canonical 0.15 coverage weight through ScoreAggregator', () => {
    const aggregator = new ScoreAggregator();
    const weights = aggregator.getWeights();

    expect(weights.coverage).toBe(CANONICAL_SCORING_WEIGHTS.coverage);
    expect(weights.fairness + weights.workload + weights.fatigue + weights.coverage)
      .toBeCloseTo(1.0);
    expect(validateCanonicalWeights()).toBe(true);
    expect(SOFT_CONSTRAINT_WEIGHTS.COVERAGE).toBe(0.15);
  });

  it('aggregates COVERAGE scores instead of discarding them', () => {
    const result = new ScoreAggregator().aggregate([
      { constraintId: 'COVERAGE', rawScore: 100, weight: 1, weightedScore: 100, explanation: 'coverage' },
    ]);

    expect(result.breakdown.coverage).toBe(15);
    expect(result.total).toBe(15);
  });

  it('allows the registered local-search strategy from the DTO', () => {
    expect(OptimizationStrategyId.LOCAL_SEARCH).toBe('local-search');
    expect(new LocalSearchOptimizationStrategy().id).toBe('local-search');
  });
});
