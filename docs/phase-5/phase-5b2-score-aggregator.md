# Phase 5B.2 — Score Aggregator

## Purpose

Collect soft constraint results, apply configured weights, and produce a deterministic total score with breakdown.

## Architecture

```
ScoreAggregator
    │
    ├── Input: ConstraintScore[]
    │   ├── FAIRNESS → weight 0.40
    │   ├── WORKLOAD_BALANCE → weight 0.30
    │   └── FATIGUE → weight 0.30
    │
    └── Output: AggregatedScore
        ├── total (0..100)
        ├── breakdown { fairness, workload, fatigue }
        ├── scores (raw)
        └── explanations
```

## Formula

```
total = fairness * 0.40 + workload * 0.30 + fatigue * 0.30
```

## Score Normalization

All soft constraints produce scores on 0..100 scale.
The `ScoreAggregator` clamps values to 0..100 via `normalizeScore()`.

## Default Weights

| Dimension | Weight | Source            |
| --------- | ------ | ----------------- |
| Fairness  | 0.40   | Backend canonical |
| Workload  | 0.30   | Backend canonical |
| Fatigue   | 0.30   | Backend canonical |

## Characterization Tests

- Default weight aggregation
- Empty scores → total 0
- Score clamping to 0..100
- Custom weights
- Determinism

## Usage

Used by `GreedyOptimizationStrategy` after soft constraint evaluation.
Used by `ScheduleOptimizerService` for score aggregation.
