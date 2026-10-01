# Phase 5B.4 — Score Invariants

## Invariant 1: Canonical Weight Consistency

For identical `CANONICAL_SCORING_WEIGHTS`:

- `ScoreAggregator` weights (default) = canonical weights for fairness/workload/fatigue
- `ScoringModel` weights (default) = canonical weights for all 4 dimensions
- Both read from the same `canonical-scoring.config.ts`

## Invariant 2: Score Component Transparency

`OptimizationResult.summary.scoreComponents` exposes:

```typescript
{
  fairness: { rawScore, weight, weightedScore },
  workload: { rawScore, weight, weightedScore },
  fatigue:  { rawScore, weight, weightedScore },
}
```

## Invariant 3: Weighted Score Calculation

For each soft constraint:

```
weightedScore = clamp(rawScore, 0, 100) * weight
total = sum(weightedScores) / softConstraintCount
```

## Invariant 4: ScoreAggregator Custom Override

When custom weights are provided:

- Only the specified weights are overridden
- Others fall back to canonical values
- Validation still ensures consistency

## Invariant 5: ScoringModel Weight Sum

ScoringModel weights MUST sum to 1.0:

```
coverage(0.15) + fairness(0.35) + workload(0.25) + fatigue(0.25) = 1.00
```

## Invariant 6: ScoreAggregator Soft Weight Sum

ScoreAggregator weights sum to 0.85 (coverage excluded from soft constraints):

```
fairness(0.35) + workload(0.25) + fatigue(0.25) = 0.85
```

## Validation

All invariants are validated by tests in:

- `5b4-preseeding.spec.ts` — GATE 4, GATE 5, Score Invariant sections
- `5b3-scoring-quality.spec.ts` — ScoreAggregator Quality section
- `5b2-optimizer.spec.ts` — ScoreAggregator tests
