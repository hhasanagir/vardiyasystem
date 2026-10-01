# Phase 5B.2 — Genetic Algorithm Evaluation

## Summary

The frontend Genetic Algorithm (`ConstraintSolverService`) has been evaluated for potential backend migration.

## Frontend Implementation Location

`frontend/src/app/core/scheduling/constraint-solver.service.ts` (462 lines)

## Architecture

```
ConstraintSolverService
├── initializePopulation(schedule, personnel, size)
├── evaluatePopulation(population, personnel) → sorted by score
├── crossover(parent1, parent2) → ChildSchedule
├── mutate(child, personnel, devices) → MutatedSchedule
├── runGA(population, config) → SolverResult
└── evaluate(schedule, personnel) → Score
```

**Dependencies:**

- `ComprehensiveConstraintValidatorService` — unit-specific constraint validation
- `FatigueEngineService` — fatigue scoring
- `RebalanceEngineService` — swap scoring

## Evaluation Criteria

### 1. Can it implement `OptimizationStrategy`?

**Answer: YES, with adapters.**

The `ConstraintSolverService.solve()` method already takes a Schedule + Personnel + Devices and returns a `SolverResult` with score and validation. This maps directly to `OptimizationStrategy.optimize(problem, context) → OptimizationResult`.

**Adapters needed:**

- `SchedulingProblem` → `Schedule` conversion
- `OptimizationResult` → `SolverResult` mapping
- Domain entity bridging (frontend `ShiftAssignment` ↔ backend `Assignment`)

### 2. Is it deterministic?

**Answer: PARTIALLY.**

- Uses `performance.now()` for timing (not seeded)
- Population initialization may use random selection
- Mutation uses random swaps
- **Without a seeded PRNG, results vary between runs**

**Requirement:** Implement seeded random (backend `SeededRandom` exists in `domain/models/seeded-random.ts`).

### 3. Performance characteristics?

- `maxIterations: 500`, `populationSize: 50`
- Per iteration: evaluate all 50 candidates × constraint validation
- Estimated: 500 × 50 × (constraint check + fatigue + rebalance) per run
- **Browser: ~2-5s. Backend: likely faster (no UI thread blocking).**

### 4. Does it rely on browser/UI state?

**Answer: NO.**

Pure computation. No DOM access. No browser APIs. No localStorage.

### 5. Does its scoring match canonical backend scoring?

**Answer: PARTIALLY.**

| Aspect                | Frontend                                                  | Backend (Canonical)                           |
| --------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Constraint validation | `ComprehensiveConstraintValidatorService` (unit-specific) | `ConstraintEngine` (12 hard constraints)      |
| Fatigue scoring       | `FatigueEngineService` (penalty-based)                    | `FatigueEngine` (penalty-based, same formula) |
| Rebalancing           | `RebalanceEngineService` (swap scoring)                   | No backend equivalent yet                     |
| Overall scoring       | `RebalanceScore` (custom)                                 | `ScoreAggregator` (weighted average)          |

**Key differences:**

- Frontend has unit-specific constraints (MR/BT/Nuclear) not in backend
- Frontend scoring weights differ from backend canonical weights
- Frontend `RebalanceScore` combines coverage + fairness + workload differently

### 6. Dependencies on frontend-only services?

| Dependency                                | Backend Equivalent                    | Status                          |
| ----------------------------------------- | ------------------------------------- | ------------------------------- |
| `ComprehensiveConstraintValidatorService` | `ConstraintEngine` + soft constraints | Partial (missing unit-specific) |
| `FatigueEngineService`                    | `FatigueEngine`                       | ✅ Equivalent                   |
| `RebalanceEngineService`                  | None                                  | ⚠️ No backend equivalent        |

## Recommendation

**NOT READY FOR DIRECT MIGRATION.**

The GA requires:

1. Seeded PRNG for determinism
2. Adapter layer for domain entity bridging
3. Alignment with canonical scoring weights
4. Unit-specific constraint migration
5. Backend RebalanceEngine (or skip for now)

**Preferred approach for Phase 5B.3+:**

1. Implement `GreedyOptimizationStrategy` (done in 5B.2)
2. Create backend `GeneticOptimizationStrategy` from scratch using canonical scoring
3. Port GA logic incrementally, not wholesale
4. Verify equivalence through parallel testing

## Conclusion

| Criterion                            | Status                 |
| ------------------------------------ | ---------------------- |
| Can implement `OptimizationStrategy` | YES (with adapters)    |
| Deterministic                        | NO (needs seeded PRNG) |
| Performance suitable                 | YES                    |
| No browser dependency                | YES                    |
| Scoring matches canonical            | PARTIALLY              |
| Ready for migration                  | NOT YET                |

**GENETIC ALGORITHM: NOT READY FOR MIGRATION**
