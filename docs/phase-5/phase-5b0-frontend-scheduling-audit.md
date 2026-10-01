# Phase 5B.0: Frontend Scheduling Logic Audit

**Status: COMPLETE**

---

## Summary

12 frontend scheduling services audited. Key findings:

- **3 services are FULL DUPLICATES** of backend logic (safe to delete once backend is enriched)
- **3 services have NO backend equivalent** (must be created in backend)
- **3 services are PARTIAL DUPLICATES** (need merger)
- **3 services are infrastructure/orchestration** (frontend-only, acceptable)
- **1 critical bug** found: `RebalanceEngineService` improvement calculation always returns 0
- **1 critical inconsistency**: Frontend min rest = 11h, backend = 8h, constants.ts = 11h
- **1 stub**: `ScheduleGeneratorService.validateSchedule()` always returns valid

---

## Service-by-Service Audit

### 1. ConstraintSolverService (GENETIC ALGORITHM)

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| File               | `core/scheduling/constraint-solver.service.ts` |
| Lines              | 462                                            |
| Purpose            | Genetic algorithm schedule optimizer           |
| Backend Equivalent | **NONE**                                       |
| Classification     | **A (Pure Domain) + B (Application)**          |

**Methods:**

- `solve(schedule, personnel, devices, config?): SolverResult` — runs GA
- `optimize(schedule, personnel, devices): Schedule` — wraps solve()

**GA Parameters:**

- Population: 50 candidates
- Max iterations: 500
- Mutation types: reassign (40%), shift-change (30%), swap (30%)
- Crossover: single-point, rate 0.7
- Tournament selection: size 3
- Elitism: top 10%
- Early stop: 50 generations without improvement

**Fitness:** `rebalanceEngine.calculateScore().overall + penaltyScore`

- Error violations: -1000 + (-10 per violation)
- Warning violations: -5 per violation

**Domain Dependencies:** ComprehensiveConstraintValidatorService, FatigueEngineService, RebalanceEngineService

---

### 2. ConstraintValidatorService (SIMPLE)

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| File               | `core/scheduling/constraint-validator.service.ts` |
| Lines              | 215                                               |
| Purpose            | Basic constraint validation (5 checks)            |
| Backend Equivalent | `ConstraintEngine` (12 constraints)               |
| Classification     | **A (Pure Domain)** — DUPLICATE                   |
| Duplicate?         | **YES** — backend is more comprehensive           |

**Rules:**

1. Min rest < 11h → error (backend uses 8h — **INCONSISTENT**)
2. Night→Day violation → error
3. Max weekly shifts ≥ 6 → error
4. Skill mismatch → error
5. Max weekly night shifts ≥ 3 → warning

---

### 3. ComprehensiveConstraintValidatorService

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| File               | `core/scheduling/comprehensive-constraint-validator.service.ts`  |
| Lines              | 639                                                              |
| Purpose            | Full constraint validation with unit-specific rules              |
| Backend Equivalent | `ConstraintEngine` (partial)                                     |
| Classification     | **A (Pure Domain)** — PARTIAL DUPLICATE                          |
| Duplicate?         | **PARTIAL** — backend lacks radiation/personnel-protection rules |

**Unique rules NOT in backend:**

- **Unit-specific:** MR consecutive night limits, BT radiation certificates, Nuclear Medicine shift restrictions
- **Personnel protection:** Pregnancy in radiation units, under-18 restrictions, dosimeter requirements
- **Radiation dose:** Monthly dose ≥80%/90% thresholds
- **Fatigue integration:** Combines fatigue score with constraint evaluation

---

### 4. ConflictDetectorService

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| File               | `core/scheduling/conflict-detector.service.ts` |
| Lines              | 188                                            |
| Purpose            | Detect conflicts in existing schedules         |
| Backend Equivalent | `Conflict` domain model + `ConflictCode` enum  |
| Classification     | **A (Pure Domain)** — DUPLICATE                |
| Duplicate?         | **YES** — backend has richer `Conflict` model  |

**Conflict Types:** REST_VIOLATION, DOUBLE_ASSIGNMENT, SKILL_GAP, COVERAGE_GAP

---

### 5. FairnessBalancerService

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| File               | `core/scheduling/fairness-balancer.service.ts`      |
| Lines              | 193                                                 |
| Purpose            | Fairness metrics calculation                        |
| Backend Equivalent | `FairnessEngine`                                    |
| Classification     | **A (Pure Domain)** — DUPLICATE (different weights) |
| Duplicate?         | **YES** — same algorithm, different weights         |

**Frontend weights:** Night 30%, Weekend 25%, Holiday 20%, Device Rotation 25%
**Backend weights:** Night 25%, Weekend 20%, Holiday 15%, Workload 40%

Formula: `max(0, 1 - stdDev / (mean + 1))` — identical implementation.

---

### 6. FatigueEngineService

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| File               | `core/scheduling/fatigue-engine.service.ts` |
| Lines              | 462                                         |
| Purpose            | Fatigue scoring per personnel               |
| Backend Equivalent | **NONE**                                    |
| Classification     | **A (Pure Domain)** — NO DUPLICATE          |
| Duplicate?         | **NO** — entirely frontend-only             |

**Fatigue Factors:**

- Consecutive nights penalty
- Weekend work penalty
- Holiday work penalty
- Short rest penalty (< 11h)
- Consecutive days penalty (> max)
- Overtime penalty

**Score:** `max(0, min(100, 100 - totalPenalty * 100))`
**Risk Levels:** critical (< 30), high (< 50), medium (< 70), low (≥ 70)

**Migration Target:** New `FatigueEngine` domain service in backend

---

### 7. RebalanceEngineService

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| File               | `core/scheduling/rebalance-engine.service.ts`               |
| Lines              | 564                                                         |
| Purpose            | Swap-based schedule rebalancing                             |
| Backend Equivalent | Stub only (`recommendations.service.ts`)                    |
| Classification     | **B (Application Logic)** — NO DUPLICATE                    |
| Duplicate?         | **NO** — frontend has full implementation, backend has stub |
| **BUG**            | `improvementPercent` calculation always returns 0           |

**Score Dimensions:** Fairness 35%, Fatigue Safety 35%, Coverage 20%, Preference 10%
**Algorithm:** Greedy swap search, max 100 iterations, stops when improvement < 0.5

**Migration Target:** New `ScheduleRebalancer` domain service in backend

---

### 8. RecommendationEngineService

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| File               | `core/scheduling/recommendation-engine.service.ts`                       |
| Lines              | 712                                                                      |
| Purpose            | Generate swap/coverage/fairness/fatigue recommendations                  |
| Backend Equivalent | `RecommendationsService` (partial, DB-focused)                           |
| Classification     | **B (Application Logic)** — PARTIAL DUPLICATE                            |
| Duplicate?         | **PARTIAL** — backend has DB persistence, frontend has richer generation |

**Recommendation Types:** swap, coverage, fairness, fatigue
**Data Structures:** Recommendation, SwapRecommendation, CoverageRecommendation, RecommendationImpact

---

### 9. SchedulingEngineService (ORCHESTRATOR)

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| File               | `core/scheduling/scheduling-engine.service.ts`         |
| Lines              | 186                                                    |
| Purpose            | Orchestrate scheduling operations                      |
| Backend Equivalent | Controller layer (NestJS)                              |
| Classification     | **B (Application Logic)** — Frontend-only orchestrator |
| Duplicate?         | **NO** — frontend-specific Angular service             |

---

### 10. ScheduleGeneratorService

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| File               | `core/scheduling/schedule-generator.service.ts`                     |
| Lines              | 194                                                                 |
| Purpose            | Greedy schedule generation                                          |
| Backend Equivalent | `ScheduleAutoGeneratorService`                                      |
| Classification     | **B (Application Logic)** — PARTIAL DUPLICATE                       |
| Duplicate?         | **PARTIAL** — both generate greedily, different algorithms          |
| **STUB**           | `validateSchedule()` always returns `{ isValid: true, score: 100 }` |

---

### 11. SolverValidationService (TEST HARNESS)

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| File               | `core/scheduling/solver-validation.service.ts`   |
| Lines              | 907                                              |
| Purpose            | Test scenarios and solver performance validation |
| Backend Equivalent | **NONE**                                         |
| Classification     | **Test Infrastructure**                          |

**Test Scenarios:** normal-week, staff-shortage, bayram-week, device-failure, sick-leaves, high-demand

---

### 12. scheduling.models.ts (TYPES)

| Field              | Value                                     |
| ------------------ | ----------------------------------------- |
| File               | `core/scheduling/scheduling.models.ts`    |
| Lines              | 158                                       |
| Purpose            | Type definitions for scheduling domain    |
| Backend Equivalent | Domain entities + value objects           |
| Classification     | **DTO Types** — mirrors of backend domain |

---

## Classification Summary

| Category                            | Services                                                     | Action                       |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| **A — Pure Domain** (duplicates)    | ConstraintValidator, ConflictDetector, FairnessBalancer      | Delete when backend enriched |
| **A — Pure Domain** (unique)        | FatigueEngine                                                | Migrate to backend           |
| **B — Application** (unique)        | ConstraintSolver (GA), RebalanceEngine, RecommendationEngine | Migrate to backend           |
| **B — Application** (partial)       | ComprehensiveConstraintValidator, ScheduleGenerator          | Merge into backend           |
| **B — Application** (orchestration) | SchedulingEngine                                             | Frontend-only, keep          |
| **Test Infrastructure**             | SolverValidation                                             | Move to backend tests        |
| **DTO Types**                       | scheduling.models                                            | Align with backend DTOs      |

---

## Critical Findings

1. **MIN_REST_HOURS INCONSISTENCY:** Frontend = 11h, Backend `hard-constraints.ts` = 8h, Backend `constants.ts` = 11h
2. **RebalanceEngine Bug:** `improvementPercent` always returns 0 (line 91)
3. **ScheduleGenerator.validateSchedule() is a stub** — always returns valid
4. **Fairness weight mismatch:** Frontend 30/25/20/25 vs Backend 25/20/15/40

---

_Audit completed: 2026-08-25_
