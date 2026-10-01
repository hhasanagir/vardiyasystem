# Phase 5B.1 — Canonical Workload Calculator

## Architecture

The canonical workload calculation lives in `backend/src/modules/schedules/domain/models/workload-calculator.ts`.

## Formula

### Per-Person Metrics

```
totalShifts = working assignments count
totalHours = sum of durationHours for working assignments
nightShifts = night shift count
weekendShifts = working shifts on Saturday/Sunday
holidayShifts = working shifts on holidays
workingDays = unique dates with working assignments
```

### Balance Score

```
avgHours = mean(totalHours across all personnel)
variance = mean((h - avgHours)^2 for h in hours)
stdDev = sqrt(variance)
cv = stdDev / avgHours
balancePercent = max(0, 100 - cv * 100)
```

## Output Structure

```typescript
interface WorkloadResult {
  details: WorkloadDetail[];
  avgHoursPerPerson: number;
  maxHoursPerPerson: number;
  minHoursPerPerson: number;
  stdDeviation: number;
  balancePercent: number;  // 0..100
}
```

## Characterization Tests

- `workload-calculator.spec.ts`: 4 tests
  - Empty personnel → 0 values
  - Single personnel → balance 100%
  - Balance never negative
  - Balance never exceeds 100

## Usage

The WorkloadCalculator is used by:
1. `WorkloadBalanceSoftConstraint` — as a soft constraint in scheduling evaluation
2. `ScoringModel` — via `workload.balancePercent` for overall schedule quality scoring
