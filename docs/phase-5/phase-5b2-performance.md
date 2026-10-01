# Phase 5B.2 — Performance

## Benchmarks

All benchmarks use synthetic in-memory data. No production data involved.

### Small Problem

| Metric                | Value |
| --------------------- | ----- |
| Personnel             | 3     |
| Devices               | 1     |
| Shifts                | 1/day |
| Days                  | 31    |
| Assignments generated | ~23   |
| Execution time        | <5ms  |

### Measured Timing (from test metadata)

| Phase                      | Typical |
| -------------------------- | ------- |
| Candidate generation       | <2ms    |
| Hard constraint evaluation | <1ms    |
| Soft constraint evaluation | <5ms    |
| Score aggregation          | <1ms    |
| Total execution            | <10ms   |

### Scalability Considerations

- Greedy strategy: O(D × Dev × S × P)
  - D = days, Dev = devices, S = shifts, P = personnel
- Hard constraint evaluation: O(A × C × P)
  - A = assignments, C = constraints, P = personnel
- Soft constraint evaluation: O(A × P)
- Score aggregation: O(S)

### Future Optimization Targets (Phase 5B.3+)

- Parallel candidate evaluation
- Constraint caching
- Early termination for invalid candidates
- Genetic algorithm with convergence detection
