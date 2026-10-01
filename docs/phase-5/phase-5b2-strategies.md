# Phase 5B.2 — Optimization Strategies

## Strategy Pattern

```
OptimizationStrategy (interface)
    optimize(problem, context) → OptimizationResult

    ├── GreedyOptimizationStrategy (v1)
    ├── GeneticOptimizationStrategy (Phase 5B.3+)
    ├── ConstraintProgrammingStrategy (Phase 5C+)
    └── MILPStrategy (Phase 5C+)
```

## GreedyOptimizationStrategy

### Algorithm

1. **Generate candidate:** For each day, for each device, for each shift:
   - Find available personnel (rest, off-day, night eligibility, skills)
   - Select best candidate (lowest workload, fewest nights)
   - Assign

2. **Evaluate hard constraints:** Run all 12 hard constraints against candidate assignments
   - If any BLOCKING violation → candidate invalid

3. **Evaluate soft constraints:** If valid:
   - Fairness (CV-based)
   - Fatigue (penalty-based)
   - Workload balance (CV-based)

4. **Aggregate score:** Weighted average of soft constraint scores

5. **Produce result:** Assignments + score + explanations + metadata

### Properties

- **Deterministic:** Yes (no randomness)
- **Greedy:** Local optima, no backtracking
- **Fast:** O(days × devices × shifts × personnel)
- **Reuses existing logic:** Pattern from `ScheduleAutoGeneratorService`

### Fairness Modes

| Mode      | Selection Criteria       |
| --------- | ------------------------ |
| balanced  | Lowest workload first    |
| seniority | Position-based weighting |
| skill     | Skills count weighting   |
