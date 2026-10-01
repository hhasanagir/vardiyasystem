# Phase 5B.3 — Regression Test Report

## Full Test Suite Results

**252 total tests: 245 pass, 7 pre-existing failures**

### Pre-existing Failures (not caused by Phase 5B)

File: `schedules.service.spec.ts` (7 failures)

- Mock setup issue: `this.prisma.assignment.findMany is not a function`
- Mock setup issue: `this.prisma.$transaction is not a function`
- These are legacy test mock problems, not regressions

### Phase 5B Test Breakdown

| Suite                               | Tests  | Status      |
| ----------------------------------- | ------ | ----------- |
| constraint-engine.spec.ts           | 4      | ✅ PASS     |
| fairness-engine.spec.ts             | 4      | ✅ PASS     |
| fatigue-engine.spec.ts              | 9      | ✅ PASS     |
| workload-calculator.spec.ts         | 4      | ✅ PASS     |
| 5b1-domain-architecture.spec.ts     | 16     | ✅ PASS     |
| 5b2-optimizer.spec.ts               | 16     | ✅ PASS     |
| security-closure-4.1.spec.ts        | 38     | ✅ PASS     |
| security-invariants.spec.ts         | 12     | ✅ PASS     |
| device-shift-visibility.spec.ts     | 14     | ✅ PASS     |
| **5b3-quality-gates.spec.ts**       | **27** | ✅ **PASS** |
| **5b3-scoring-quality.spec.ts**     | **22** | ✅ **PASS** |
| **5b3-performance-failure.spec.ts** | **12** | ✅ **PASS** |

### New Tests Added in Phase 5B.3

**61 tests** across 3 test files + 12 fixture scenarios

### Data Integrity

- **Before Phase 5B.3:** 11 schedules, 626 assignments
- **After Phase 5B.3:** 11 schedules, 626 assignments
- **Change:** 0 (zero side effects)

### TypeScript Compilation

- Clean (zero errors, zero warnings)
