# Phase 5B.4 — Canonical Scoring Model

## Problem

Phase 5B.3 identified that ScoreAggregator and ScoringModel used different weight systems:

| System                 | Fairness | Workload | Fatigue/Preference | Coverage | Total |
| ---------------------- | -------- | -------- | ------------------ | -------- | ----- |
| ScoreAggregator (5B.2) | 0.40     | 0.30     | 0.30               | —        | 1.00  |
| ScoringModel (5B.1)    | 0.30     | 0.25     | 0.10               | 0.35     | 1.00  |

## Solution

Created `canonical-scoring.config.ts` as the single source of truth:

```typescript
CANONICAL_SCORING_WEIGHTS = {
  fairness: 0.35,
  workload: 0.25,
  fatigue: 0.25,
  coverage: 0.15,
};
```

## Justification

1. **Fairness 0.35**: Kept at ScoringModel level — domain-proven in hospital scheduling literature
2. **Workload 0.25**: Balanced between fatigue and fairness
3. **Fatigue 0.25**: Elevated from preference (0.10) — fatigue IS the preference signal in scheduling
4. **Coverage 0.15**: Fills remaining weight, ensures coverage matters
5. **Total**: 1.00

## ScoreAggregator

- Uses `fairness + workload + fatigue` = 0.85 for soft constraint optimization
- Coverage is handled separately (not a soft constraint in the optimization loop)
- Custom weights can override via constructor

## ScoringModel

- Uses all 4 weights from canonical config
- Maps: `coverageWeight = 0.15`, `fairnessWeight = 0.35`, `workloadWeight = 0.25`, `preferenceWeight = 0.25`
- Updated version to `2.0.0`

## Score Component Exposure

`OptimizationResult.summary.scoreComponents` now exposes per-constraint:

- `rawScore` — raw score from soft constraint (0-100)
- `weight` — canonical weight used
- `weightedScore` — final weighted contribution to total

## Files Created/Modified

- **Created**: `canonical-scoring.config.ts` — single source of truth
- **Modified**: `score-aggregator.ts` — imports canonical weights
- **Modified**: `scoring-model.ts` — imports canonical weights, version 2.0.0
- **Modified**: `optimization-result.ts` — added `ScoreComponent`, `scoreComponents` to summary
- **Modified**: `schedule-optimizer.service.ts` — added canonical config re-exports
