# Phase 5B.1 — Canonical Fairness Engine

## Architecture

The canonical fairness calculation lives in `backend/src/modules/schedules/domain/models/fairness-engine.ts`.

Frontend `FairnessBalancerService` remains functional but is NOT the canonical source.

## Formula

### Per-Dimension Score (CV-based)

```
For each dimension (night, weekend, holiday):
  avg = mean(values)
  variance = mean((v - avg)^2 for v in values)
  stdDev = sqrt(variance)
  cv = stdDev / avg
  score = max(0, 100 - cv * 100)
```

### Workload Score

Same CV-based formula but scaled differently:

```
score = max(0, 100 - cv * 80)
```

### Overall Score

```
overallScore = nightScore * 0.25
             + weekendScore * 0.20
             + holidayScore * 0.15
             + workloadScore * 0.40
```

## Canonical Weights

| Dimension | Backend (Canonical) | Frontend |
| --------- | ------------------- | -------- |
| Night     | 0.25                | 0.30     |
| Weekend   | 0.20                | 0.25     |
| Holiday   | 0.15                | 0.20     |
| Workload  | 0.40                | 0.25     |

**Note:** Frontend uses different weights. Backend is canonical. Frontend will consume backend result in future phases.

## Characterization Tests

- `fairness-engine.spec.ts`: 4 tests
  - Empty personnel → score 100
  - Weight verification
  - Equal distribution → score 100
  - No negative scores

## Input Structure

```typescript
interface FairnessInput {
  assignments: AssignmentCollection;
  personnel: FairnessPersonnelInfo[];
  holidays: Set<string>;
  monthDays: number;
}
```

## Output Structure

```typescript
interface FairnessResult {
  overallScore: number; // 0..100
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetail[];
}
```
