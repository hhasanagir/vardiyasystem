# Phase 5B.0: Architecture — Fairness, Fatigue, Rebalancing Analysis

**Status: COMPLETE**

---

## PART 7: Fairness Engine Analysis

### Backend FairnessEngine

**Location:** `backend/src/modules/schedules/domain/models/fairness-engine.ts` (112 lines)

**Algorithm:** Coefficient of Variation (CV) based scoring

```
For each dimension:
  avg = mean(values)
  variance = mean((v - avg)² for v in values)
  stdDev = sqrt(variance)
  cv = stdDev / avg
  score = max(0, 100 - cv × 100)  // for night/weekend/holiday
  score = max(0, 100 - cv × 80)   // for workload (more lenient)
```

**Dimension Weights:**
| Dimension | Weight | Calculation |
|---|---|---|
| Night distribution | 25% | CV of night counts per person |
| Weekend distribution | 20% | CV of weekend working-day counts |
| Holiday distribution | 15% | CV of holiday working-day counts |
| Workload (total hours) | 40% | CV of total hours per person |

**Output:** `FairnessResult { overallScore, nightScore, weekendScore, holidayScore, workloadScore, details[] }`

**Critical Issue:** Each `FairnessDetail.score` is set to the same `overallScore`. Per-person fairness differentiation is lost.

### Frontend FairnessBalancerService

**Location:** `frontend/src/app/core/scheduling/fairness-balancer.service.ts` (193 lines)

**Algorithm:** Identical CV-based scoring with different formula variant

```
score = max(0, 1 - stdDev / (mean + 1))  // ranges 0-1
```

**Dimension Weights:**
| Dimension | Weight |
|---|---|
| Night distribution | 30% |
| Weekend assignment | 25% |
| Holiday assignment | 20% |
| Device rotation | 25% |

### Comparison

| Aspect            | Backend            | Frontend              | Consistent?          |
| ----------------- | ------------------ | --------------------- | -------------------- |
| Algorithm         | CV-based           | CV-based              | ✅                   |
| Score range       | 0-100              | 0-1                   | ❌ (different scale) |
| Night weight      | 25%                | 30%                   | ❌                   |
| Weekend weight    | 20%                | 25%                   | ❌                   |
| Holiday weight    | 15%                | 20%                   | ❌                   |
| Fourth dimension  | Workload (40%)     | Device Rotation (25%) | ❌                   |
| Per-person detail | Same score for all | Different per person  | ❌                   |

### Canonical Decision

**Backend `FairnessEngine` is canonical.** Frontend weights must be aligned. The backend formula (`100 - CV × 100`) is more intuitive (0-100 scale). The frontend should consume backend results.

---

## PART 8: Fatigue Engine Analysis

### Backend: NO Fatigue Engine

The backend has only a `FatigueMetrics` interface in `validation-result.ts`:

```typescript
interface FatigueMetrics {
  maxConsecutiveDays: number;
  avgRestHours: number;
  minRestHours: number;
  nightShiftsPerPerson: Record<string, number>;
  overtimeHours: number;
  overtimePersonnel: string[];
}
```

This is consumed by `ScoringModel.calculatePreferenceScore()` but there is NO standalone fatigue engine.

### Frontend FatigueEngineService

**Location:** `frontend/src/app/core/scheduling/fatigue-engine.service.ts` (462 lines)

**Fatigue Factors & Coefficients:**

| Factor                   | Coefficient               | Threshold | Severity |
| ------------------------ | ------------------------- | --------- | -------- |
| Consecutive nights       | `consecutiveNightPenalty` | ≥ 2       | High     |
| Weekend work             | `weekendShiftPenalty`     | Per shift | Medium   |
| Holiday work             | `holidayShiftPenalty`     | Flat      | Medium   |
| Short rest (< 11h)       | `shortRestPenalty`        | < 11h     | Critical |
| Consecutive days (> max) | `consecutiveDaysPenalty`  | > max (6) | High     |
| Overtime (> 45h/week)    | `overtimePenalty`         | > 45h     | High     |

**Score Formula:**

```
totalPenalty = Σ(factor × coefficient)
score = max(0, min(100, 100 - totalPenalty × 100))
```

**Risk Levels:**
| Score | Risk |
|---|---|
| < 30 or has short_rest | CRITICAL |
| < 50 or consecutive_nights > 0.2 | HIGH |
| < 70 | MEDIUM |
| ≥ 70 | LOW |

**Profile:**

- `currentFatigue` — today's fatigue score
- `weeklyFatigue` — weekly aggregated score
- `monthlyFatigue` — monthly aggregated score
- `riskFlags[]` — high_consecutive_nights, overtime_violation, consecutive_days_exceeded, rest_violation

### Safety vs Soft Separation

| Rule                   | Type | Implementation                         |
| ---------------------- | ---- | -------------------------------------- |
| Min rest ≥ 8h          | HARD | `RequiredRestConstraint` (backend)     |
| Min rest ≥ 11h         | HARD | Should be aligned (constants.ts = 11h) |
| Night→day rest < 24h   | SOFT | Fatigue scoring                        |
| Consecutive nights ≥ 2 | SOFT | Fatigue scoring                        |
| Consecutive days > 6   | SOFT | Fatigue scoring                        |
| Overtime > 45h/week    | SOFT | Fatigue scoring                        |

### Assumptions

1. Fatigue is a **scoring metric**, not a medical measurement
2. Coefficients are based on occupational health guidelines, not clinical data
3. The formula does NOT claim medical or legal validity
4. Coefficients should be configurable per organization

### Migration Target

**NEW** backend `FatigueEngine` domain service, extracted from frontend `FatigueEngineService`.

---

## PART 9: Rebalancing Analysis

### Backend: Stub Only

`recommendations.service.ts` has a `rebalance()` method that calculates basic fairness/fatigue scores but performs NO actual rebalancing/swapping.

### Frontend RebalanceEngineService

**Location:** `frontend/src/app/core/scheduling/rebalance-engine.service.ts` (564 lines)

**Score Dimensions:**
| Dimension | Weight | Formula |
|---|---|---|
| Fairness | 35% | Gini coefficient on night/weekend/total distributions |
| Fatigue Safety | 35% | Risk penalties + average fatigue |
| Coverage | 20% | Covered slots / total slots |
| Preference Match | 10% | Unavailable dates compliance |

**Overall:** `fairness×0.35 + fatigueSafety×0.35 + coverage×0.20 + preferenceMatch×0.10`

**Rebalance Algorithm:**

1. `findBestImprovement()` — iterate all same-date assignment pairs + replacement candidates
2. `evaluateSwap()` — calculate fatigue improvement from swapping two personnel's assignments
3. `findBetterReplacement()` — find lower-fatigue personnel to replace current assignee
4. `applyChange()` — swap personnelIds between two assignments
5. Loop max 100 iterations, stops when improvement < 0.5

**CRITICAL BUG:** Line 91 — `improvementPercent` calculation:

```typescript
const improvementPercent =
  ((currentScore.overall - previousScore.overall) / currentScore.overall) * 100;
```

This divides by `currentScore.overall` instead of `previousScore.overall`, making improvement always 0 or negative. The loop never actually improves.

### What Rebalancing Does

| Operation         | Description                                        |
| ----------------- | -------------------------------------------------- |
| Swap personnel    | Exchange two assignments' `personnelId`            |
| Replace personnel | Find a lower-fatigue alternative for an assignment |
| Score comparison  | Calculate before/after fairness + fatigue          |
| Convergence       | Stop when improvement < 0.5 or max iterations      |

### What Rebalancing Does NOT Do

| Operation                | Status                                |
| ------------------------ | ------------------------------------- |
| Change dates             | No                                    |
| Change shift types       | No                                    |
| Change devices           | No                                    |
| Add/remove assignments   | No                                    |
| Persist results          | No (returns modified schedule object) |
| Respect hard constraints | Partially (uses fatigue check only)   |

### Future Architecture

```
Current Schedule
    ↓
Candidate Swap Generation
    ↓ (same-date pairs, replacement candidates)
Hard Constraint Validation
    ↓ (reject invalid swaps)
Score Difference Calculation
    ↓ (fairness + fatigue improvement)
Rank by Improvement
    ↓
Apply Top Improvements
    ↓
Repeat Until Converged
```

### Migration Target

**NEW** backend `ScheduleRebalancer` domain service, based on frontend `RebalanceEngineService` with bug fix and hard constraint integration.

---

## Architecture Summary

### What Exists (Backend)

| Component                  | Status        | Quality                         |
| -------------------------- | ------------- | ------------------------------- |
| ConstraintEngine (12 hard) | ✅ Production | High                            |
| FairnessEngine             | ✅ Production | Medium (per-person score issue) |
| ScoringModel               | ✅ Production | High                            |
| SeededRandom               | ✅ Production | High                            |
| Schedule aggregate         | ✅ Production | High                            |
| Domain events              | ✅ Production | High                            |
| Version management         | ✅ Production | High                            |

### What Must Be Created (Phase 5B)

| Component                    | Source                                    | Priority | Effort    |
| ---------------------------- | ----------------------------------------- | -------- | --------- |
| FatigueEngine                | Frontend FatigueEngineService             | HIGH     | 1 week    |
| SoftConstraint interface     | New                                       | HIGH     | 3 days    |
| 6 soft constraints           | New                                       | HIGH     | 1 week    |
| ScheduleOptimizer            | Frontend ConstraintSolverService (GA)     | HIGH     | 2-3 weeks |
| ScheduleRebalancer           | Frontend RebalanceEngineService           | MEDIUM   | 1 week    |
| ScheduleGenerator (enhanced) | Merge backend + frontend generators       | MEDIUM   | 1 week    |
| Unit-specific constraints    | Frontend ComprehensiveConstraintValidator | MEDIUM   | 1 week    |
| Dry-run API                  | New                                       | MEDIUM   | 3 days    |

---

_Audit completed: 2026-08-25_
