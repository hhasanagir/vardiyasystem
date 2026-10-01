# Phase 5B.4 — Regression Report

## Test Results

**289 total tests: 281 pass, 8 pre-existing failures**

### Pre-existing Failures (unchanged from 5B.3)

File: `schedules.service.spec.ts` (8 failures)

- Mock setup issues: `findMany is not a function`, `$transaction is not a function`
- NOT caused by Phase 5B.4 changes

### Phase 5B.4 New Tests

| File                   | Tests | Status      |
| ---------------------- | ----- | ----------- |
| 5b4-preseeding.spec.ts | 37    | ✅ ALL PASS |

### Updated Tests

| File                        | Change                            | Status        |
| --------------------------- | --------------------------------- | ------------- |
| 5b2-optimizer.spec.ts       | ScoreAggregator canonical weights | ✅ 16/16 PASS |
| 5b3-quality-gates.spec.ts   | Updated weight sum check (0.85)   | ✅ 27/27 PASS |
| 5b3-scoring-quality.spec.ts | Unchanged                         | ✅ 22/22 PASS |

### All Phase 5B Test Suites

| Suite                           | Tests | Status  |
| ------------------------------- | ----- | ------- |
| 5b1-domain-architecture.spec.ts | 16    | ✅ PASS |
| 5b2-optimizer.spec.ts           | 16    | ✅ PASS |
| 5b3-quality-gates.spec.ts       | 27    | ✅ PASS |
| 5b3-scoring-quality.spec.ts     | 22    | ✅ PASS |
| 5b3-performance-failure.spec.ts | 12    | ✅ PASS |
| 5b4-preseeding.spec.ts          | 37    | ✅ PASS |

### Data Integrity

- **Before 5B.4**: 11 schedules, 626 assignments
- **After 5B.4**: 11 schedules, 626 assignments
- **Change**: 0 (zero side effects)

### TypeScript Compilation

- Clean (zero errors)

### Files Modified (Phase 5B.4)

1. `canonical-scoring.config.ts` — NEW: canonical scoring weights
2. `candidate-schedule.ts` — Added `isPreSeeded` flag
3. `greedy-strategy.ts` — Pre-seeding implementation
4. `score-aggregator.ts` — Canonical weights integration
5. `scoring-model.ts` — Canonical weights integration, v2.0.0
6. `optimization-result.ts` — ScoreComponent, scoreComponents
7. `schedule-optimizer.service.ts` — Canonical config re-exports

### Files Created (Phase 5B.4)

1. `5b4-preseeding.spec.ts` — 37 comprehensive tests
2. `docs/phase-5/phase-5b4-pre-seeding.md`
3. `docs/phase-5/phase-5b4-canonical-scoring.md`
4. `docs/phase-5/phase-5b4-score-invariants.md`
5. `docs/phase-5/phase-5b4-partial-optimization.md`
6. `docs/phase-5/phase-5b4-regression.md`
