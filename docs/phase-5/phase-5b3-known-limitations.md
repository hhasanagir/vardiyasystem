# Phase 5B.3 — Known Limitations & Technical Debt

## Greedy Strategy Limitations

### 1. No Existing Assignment Pre-seeding

The greedy generator does not pre-load `problem.existingAssignments` into the candidate. This means:

- Existing assignments are not considered during generation
- Hard constraint evaluation detects overlaps with existing assignments
- **Impact:** Candidates with existing assignments may be marked invalid even when valid placements exist
- **Fix for 5B.4:** Pre-seed existing assignments into the candidate before generation

### 2. Single Candidate Greedy

The optimizer generates exactly 1 candidate per run:

- No local search or perturbation
- No multi-start or random restarts
- **Impact:** Suboptimal solutions possible for complex problems
- **Fix for 5B.4:** Add multi-candidate generation with comparison

### 3. ScoreAggregator vs ScoringModel Weight Mismatch

| Source          | Fairness | Workload | Fatigue | Gap      |
| --------------- | -------- | -------- | ------- | -------- |
| ScoreAggregator | 0.40     | 0.30     | 0.30    | —        |
| ScoringModel    | 0.35     | 0.30     | 0.25    | 0.10 Gap |

- **Impact:** Optimizer prioritizes fairness more than the historical scoring model
- **Recommendation:** Align weights in Phase 5B.4

### 4. No Unit-Specific Constraints

Frontend `comprehensive-constraint-validator.service.ts` has 11 unit-specific rules not yet ported:

- Ultrasound protocol-specific constraints
- Angio-specific device availability
- Mammography scheduling windows
- **Fix for Phase 5B.4:** Port rules to backend `ConstraintEngine`

### 5. Test Fixture Date Lock

All scenarios use January 2026. Edge cases around:

- Month boundaries
- Year transitions
- Leap years
- DST transitions
- **Recommendation:** Add cross-month scenarios in 5B.4

## Test File Pre-existing Failures

7 failures in `schedules.service.spec.ts` due to incomplete Prisma mock setup — not caused by Phase 5B work.
