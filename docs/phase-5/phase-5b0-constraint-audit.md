# Phase 5B.0: Constraint Audit + Soft Constraint Interface + Hard/Soft Separation

**Status: COMPLETE**

---

## PART 4: Existing Constraint System Analysis

### Backend Constraint Engine

**Location:** `backend/src/modules/schedules/domain/constraints/`

| Component      | File                      | Purpose                                                        |
| -------------- | ------------------------- | -------------------------------------------------------------- |
| Interface      | `constraint.interface.ts` | HardConstraint, ViolationRule (20), ConstraintContext          |
| Engine         | `constraint-engine.ts`    | ConstraintEngine (validate, validateWithOverride, canOverride) |
| Implementation | `hard-constraints.ts`     | 12 concrete constraint classes                                 |

### 12 Hard Constraints — Detailed Analysis

| #   | Class                              | ViolationRule             | Severity | Overridable | Domain-Specific | Backend | Frontend           | Reusable             |
| --- | ---------------------------------- | ------------------------- | -------- | ----------- | --------------- | ------- | ------------------ | -------------------- |
| 1   | PersonnelIsActiveConstraint        | INACTIVE_PERSONNEL        | BLOCKING | No          | Global          | ✅      | ✅ (Comprehensive) | ✅                   |
| 2   | DeviceIsRequiredConstraint         | DEVICE_REQUIRED           | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 3   | NoOverlappingAssignmentsConstraint | TIME_OVERLAP              | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 4   | RequiredRestConstraint             | REQUIRED_REST_NOT_MET     | WARNING  | Yes         | Global          | ✅ (8h) | ✅ (11h)           | ✅ (align threshold) |
| 5   | NightShiftEligibilityConstraint    | NOT_NIGHT_ELIGIBLE        | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 6   | OffDayConflictConstraint           | OFF_DAY_CONFLICT          | WARNING  | Yes         | Global          | ✅      | ✅                 | ✅                   |
| 7   | PersonnelInUnitConstraint          | PERSONNEL_NOT_IN_UNIT     | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 8   | PersonnelInGroupConstraint         | PERSONNEL_NOT_IN_GROUP    | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 9   | DeviceSkillsConstraint             | PERSON_DEVICE_NOT_ALLOWED | WARNING  | Yes         | Global          | ✅      | ✅                 | ✅                   |
| 10  | TemplateValidationConstraint       | TEMPLATE_NOT_FOUND        | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |
| 11  | GroupSlotOccupiedConstraint        | GROUP_SLOT_OCCUPIED       | WARNING  | Yes         | Global          | ✅      | ✅                 | ✅                   |
| 12  | RequiredRestConstraintNew          | REST_RULE_VIOLATION       | BLOCKING | No          | Global          | ✅      | ✅                 | ✅                   |

### Unused ViolationRules (6)

| ViolationRule         | Defined | Raised By | Status     |
| --------------------- | ------- | --------- | ---------- |
| DEVICE_BOOKED         | ✅      | Nothing   | **UNUSED** |
| GROUP_NOT_FOUND       | ✅      | Nothing   | **UNUSED** |
| GROUP_NOT_IN_UNIT     | ✅      | Nothing   | **UNUSED** |
| TEMPLATE_NOT_IN_GROUP | ✅      | Nothing   | **UNUSED** |
| TEMPLATE_NOT_IN_UNIT  | ✅      | Nothing   | **UNUSED** |
| SAME_SLOT             | ✅      | Nothing   | **UNUSED** |

### Frontend-Only Constraints (Not in Backend)

| Rule                                       | Location               | Type                 | Backend Status |
| ------------------------------------------ | ---------------------- | -------------------- | -------------- |
| MR consecutive nights (configurable limit) | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| BT radiation certificate required          | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| Nuclear Medicine no night/evening          | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| Nuclear Medicine Saturday→Sunday off       | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| Nuclear Medicine 12h min rest              | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| Nuclear license required                   | ComprehensiveValidator | Unit-specific        | **MISSING**    |
| Pregnancy in radiation units               | ComprehensiveValidator | Personnel protection | **MISSING**    |
| Under-18 in radiation units                | ComprehensiveValidator | Personnel protection | **MISSING**    |
| Dosimeter delivery skill                   | ComprehensiveValidator | Personnel protection | **MISSING**    |
| Monthly dose ≥80% + night shift            | ComprehensiveValidator | Radiation            | **MISSING**    |
| Monthly dose ≥90%                          | ComprehensiveValidator | Radiation            | **MISSING**    |

---

## PART 5: Soft Constraint Interface Design

### Proposed Interface

Following the existing `HardConstraint` pattern in the codebase:

```typescript
// domain/constraints/soft-constraint.interface.ts

export type SoftConstraintCategory =
  | "fairness"
  | "fatigue"
  | "preference"
  | "workload"
  | "coverage";

export interface SoftConstraintResult {
  passed: boolean;
  score: number; // 0-100, higher = better
  weight: number; // 0-1, contribution to overall score
  explanation: string; // Human-readable explanation
  details?: {
    current?: number;
    ideal?: number;
    deviation?: number;
  };
}

export interface SoftConstraintContext {
  assignment: Assignment;
  existingAssignments: AssignmentCollection;
  personnelLookup: PersonnelLookup;
  deviceLookup: DeviceLookup;
  holidays: Set<string>;
  templates: ShiftTemplateLookup;
  groups: GroupLookup;
  schedule: {
    totalAssignments: number;
    totalPersonnel: number;
    totalDays: number;
  };
  now: Date;
}

export interface SoftConstraint {
  code: string;
  category: SoftConstraintCategory;
  description: string;
  weight: number; // 0-1, default weight (can be overridden per config)
  evaluate(context: SoftConstraintContext): SoftConstraintResult;
}
```

### Proposed Soft Constraints

| #   | Code               | Category   | Weight | Description                       |
| --- | ------------------ | ---------- | ------ | --------------------------------- |
| 1   | `NIGHT_BALANCE`    | fairness   | 0.25   | Night shift distribution fairness |
| 2   | `WEEKEND_BALANCE`  | fairness   | 0.20   | Weekend distribution fairness     |
| 3   | `HOLIDAY_BALANCE`  | fairness   | 0.15   | Holiday distribution fairness     |
| 4   | `WORKLOAD_BALANCE` | workload   | 0.25   | Total hours distribution fairness |
| 5   | `CONSECUTIVE_DAYS` | fatigue    | 0.20   | Minimize consecutive working days |
| 6   | `PREFERENCE_MATCH` | preference | 0.10   | Respect shift preferences         |

### Composite Scoring

```typescript
function calculateCompositeScore(results: SoftConstraintResult[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 100;
}
```

---

## PART 6: Hard/Soft Separation

### Rule: Hard constraints invalidate candidates. Soft constraints score candidates.

| Category               | Effect                                     | Example                                          |
| ---------------------- | ------------------------------------------ | ------------------------------------------------ |
| **HARD**               | Candidate INVALID, cannot be assigned      | Personnel inactive, time overlap, missing skills |
| **HARD (overridable)** | Candidate INVALID unless override approved | Rest violation, off-day conflict                 |
| **SOFT**               | Candidate VALID, score adjusted            | Unequal night distribution, preference mismatch  |

### Separation Matrix

| Business Rule                   | Type               | Reason                        |
| ------------------------------- | ------------------ | ----------------------------- |
| Personnel inactive              | HARD               | Safety — cannot work          |
| Personnel not in unit           | HARD               | Organizational boundary       |
| Time overlap                    | HARD               | Physical impossibility        |
| Missing device skills           | HARD               | Safety — unqualified operator |
| Night shift not eligible        | HARD               | Safety — not trained          |
| Device not available            | HARD               | Physical constraint           |
| Template mismatch               | HARD               | Configuration error           |
| Group slot occupied             | HARD               | Capacity constraint           |
| Minimum rest (8h)               | HARD (overridable) | Safety with override path     |
| Off-day conflict                | HARD (overridable) | Preference with override path |
| Night→day rest (< 24h)          | SOFT               | Fatigue scoring               |
| Unequal night distribution      | SOFT               | Fairness scoring              |
| Unequal weekend distribution    | SOFT               | Fairness scoring              |
| Consecutive days > 4            | SOFT               | Fatigue scoring               |
| Overtime > 40h/week             | SOFT               | Fatigue scoring               |
| Shift preference mismatch       | SOFT               | Preference scoring            |
| Personnel prefers another shift | SOFT               | Preference scoring            |

### Critical Constraint

**Soft scoring MUST NEVER override hard constraints.**

```
Hard constraint violated → candidate REJECTED (score irrelevant)
Hard constraint passed → candidate evaluated by soft constraints
```

---

## Alignment Required

| Item                   | Current Value              | Target Value       | File                     |
| ---------------------- | -------------------------- | ------------------ | ------------------------ |
| MIN_REST_HOURS         | 8h (hard-constraints.ts)   | 11h (constants.ts) | `hard-constraints.ts:9`  |
| MIN_REST_HOURS         | 11h (scheduling.models.ts) | 11h                | Frontend already correct |
| Night→Day rest         | Not enforced               | 24h (constants.ts) | Add new constraint       |
| Max consecutive nights | Not enforced               | 3 (constants.ts)   | Add new constraint       |

---

_Audit completed: 2026-08-25_
