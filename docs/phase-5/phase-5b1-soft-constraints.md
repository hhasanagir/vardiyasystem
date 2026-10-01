# Phase 5B.1 — Soft Constraints

## Architecture

```
HardConstraint (existing)          SoftConstraint (NEW)
    ↓ evaluate(ctx)                   ↓ evaluate(ctx)
    → ConstraintResult                → ConstraintScore
    → passed: boolean                 → rawScore: number
    → violations[]                    → weight: number
    → BLOCKING or WARNING             → weightedScore: number
                                     → explanation: string
                                     → metadata?: Record<string, unknown>
```

## Interface: `soft-constraint.interface.ts`

```typescript
export interface ConstraintScore {
  constraintId: string;
  rawScore: number;      // 0..100 scale
  weight: number;         // multiplier
  weightedScore: number;  // rawScore * weight
  explanation: string;
  metadata?: Record<string, unknown>;
}

export interface SoftConstraint {
  id: string;
  description: string;
  evaluate(context: ConstraintContext): ConstraintScore;
}
```

## Implemented Soft Constraints

### 1. FairnessSoftConstraint (`soft-fairness.ts`)

**ID:** `FAIRNESS`
**Formula:** CV-based fairness across night/weekend/holiday/workload dimensions
**Weights:** night=0.25, weekend=0.20, holiday=0.15, workload=0.40
**Canonical source:** `FairnessEngine` in `models/fairness-engine.ts`
**Explanation format:** `Fairness: night=X weekend=X holiday=X workload=X`

### 2. FatigueSoftConstraint (`soft-fatigue.ts`)

**ID:** `FATIGUE`
**Formula:** Penalty-based scoring (100 - totalPenalty * 100)
**Coefficients:** consecutiveNight=0.15, weekend=0.08, holiday=0.12, shortRest=0.20, overtime=0.10, consecutiveDays=0.05
**Canonical source:** `FatigueEngine` in `models/fatigue-engine.ts`
**Risk levels:** low (≥70), medium (50-69), high (30-49), critical (<30)

### 3. WorkloadBalanceSoftConstraint (`soft-workload.ts`)

**ID:** `WORKLOAD_BALANCE`
**Formula:** CV-based balance across total hours
**Canonical source:** `WorkloadCalculator` in `models/workload-calculator.ts`
**Explanation format:** `Workload balance: X% avg=Xh max=Xh min=Xh`

## Key Invariants

1. Soft constraints MUST NOT invalidate candidates
2. Soft constraints score 0..100
3. Hard constraints remain authoritative (BLOCKING)
4. Soft constraint metadata is informational only

## Files

- `domain/constraints/soft-constraint.interface.ts` — Interface definitions
- `domain/constraints/soft-fairness.ts` — FairnessSoftConstraint
- `domain/constraints/soft-fatigue.ts` — FatigueSoftConstraint
- `domain/constraints/soft-workload.ts` — WorkloadBalanceSoftConstraint
- `__tests__/5b1-domain-architecture.spec.ts` — Hard/soft invariant tests
- `__tests__/fairness-engine.spec.ts` — Fairness characterization tests
- `__tests__/fatigue-engine.spec.ts` — Fatigue characterization tests
- `__tests__/workload-calculator.spec.ts` — Workload characterization tests
