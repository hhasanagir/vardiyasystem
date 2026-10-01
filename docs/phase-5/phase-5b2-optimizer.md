# Phase 5B.2 — Schedule Optimizer

## Architecture

```
ScheduleOptimizerService
    │
    ├── SchedulingProblem (input)
    │   ├── personnel, devices, shifts
    │   ├── existing assignments
    │   ├── holidays, configuration
    │   └── service line
    │
    ├── OptimizationStrategy (pluggable)
    │   └── GreedyOptimizationStrategy (v1)
    │
    └── OptimizationResult (output)
        ├── candidate (CandidateSchedule)
        ├── summary
        ├── metadata (timing, determinism)
        └── explanations
```

## Service Interface

```typescript
class ScheduleOptimizerService {
  registerStrategy(strategy: OptimizationStrategy): void;
  optimize(problem, strategyId?, config?): OptimizationResult;
  getAvailableStrategies(): Array<{ id; name }>;
}
```

## Strategies

| ID       | Name                | Status         |
| -------- | ------------------- | -------------- |
| `greedy` | Greedy Optimization | ✅ Implemented |

Future:

- `genetic` — Genetic Algorithm (Phase 5B.3+)
- `constraint-programming` — CP-SAT (Phase 5C+)
- `milp` — Mixed Integer Linear Programming (Phase 5C+)

## Files

- `domain/optimization/scheduling-problem.ts` — Input representation
- `domain/optimization/candidate-schedule.ts` — In-memory optimization object
- `domain/optimization/optimization-strategy.ts` — Strategy abstraction
- `domain/optimization/optimization-result.ts` — Result with metadata
- `domain/optimization/greedy-strategy.ts` — Greedy implementation
- `domain/optimization/score-aggregator.ts` — Soft constraint aggregation
- `domain/optimization/schedule-optimizer.service.ts` — Orchestration service
- `schedule-dry-run.service.ts` — Dry-run API service
- `dto/dry-run-optimization.dto.ts` — Dry-run request DTO
- `__tests__/5b2-optimizer.spec.ts` — 16 tests
