# Phase 5B.0: Canonical Business Logic + Optimizer + Dry-Run Boundaries

**Status: COMPLETE**

---

## PART 14: Canonical Source of Truth Table

### Principle: ONE BUSINESS RULE → ONE CANONICAL IMPLEMENTATION

| Business Rule                            | Current Location (Backend)                        | Current Location (Frontend)                                              | Duplicate?           | Canonical Future Location            | Migration Risk                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------- | ------------------------------------ | -------------------------------- |
| **Hard constraint validation**           | `ConstraintEngine` (12 constraints)               | `ConstraintValidatorService` + `ComprehensiveConstraintValidatorService` | YES                  | Backend `ConstraintEngine`           | LOW — extend, don't replace      |
| **Conflict code enum**                   | `domain/models/conflict.ts` (10 codes)            | `features/scheduling/models/conflict.models.ts` (10 codes)               | YES                  | Backend `conflict.ts`                | LOW — frontend uses DTO          |
| **Conflict detection**                   | `Conflict` model + `createConflict()`             | `ConflictDetectorService`                                                | YES                  | Backend domain                       | LOW                              |
| **Fairness calculation**                 | `FairnessEngine` (4 dimensions)                   | `FairnessBalancerService` (4 dimensions, different weights)              | YES (weights differ) | Backend `FairnessEngine`             | MEDIUM — weight alignment needed |
| **Fatigue scoring**                      | `FatigueMetrics` interface only                   | `FatigueEngineService` (full implementation)                             | NO                   | **NEW** backend `FatigueEngine`      | HIGH — must create from scratch  |
| **Rebalancing**                          | Stub in `recommendations.service.ts`              | `RebalanceEngineService` (full implementation)                           | NO                   | **NEW** backend `ScheduleRebalancer` | HIGH — must create from scratch  |
| **Genetic algorithm**                    | NONE                                              | `ConstraintSolverService` (full GA)                                      | NO                   | **NEW** backend `ScheduleOptimizer`  | HIGH — must create from scratch  |
| **Score calculation**                    | `ScoringModel` (weighted average)                 | `RebalanceEngineService.calculateScore()`                                | PARTIAL              | Backend `ScoringModel`               | LOW — already canonical          |
| **Schedule generation**                  | `ScheduleAutoGeneratorService` (greedy)           | `ScheduleGeneratorService` (greedy, different algorithm)                 | PARTIAL              | Backend generator                    | MEDIUM — algorithm differences   |
| **Recommendations**                      | `RecommendationsService` (DB-focused)             | `RecommendationEngineService` (rich generation)                          | PARTIAL              | Backend `SchedulingInsightsService`  | MEDIUM — merge generation logic  |
| **Constraint types/models**              | `domain/constraints/` (DDD)                       | `core/scheduling/scheduling.models.ts` (flat)                            | YES                  | Backend domain entities              | LOW — frontend uses DTOs         |
| **Validation result types**              | `domain/models/validation-result.ts`              | `features/scheduling/models/validation.models.ts`                        | YES                  | Backend types                        | LOW — frontend uses DTOs         |
| **Personnel info**                       | `Personnel` Prisma model + `PersonnelInfo`        | `Personnel` interface (frontend)                                         | YES                  | Backend Prisma → DTO                 | LOW                              |
| **Device info**                          | `Device` Prisma model + `DeviceInfo`              | `Device` interface (frontend)                                            | YES                  | Backend Prisma → DTO                 | LOW                              |
| **Shift type logic**                     | `ShiftTypeVO` (value object)                      | `SHIFT_TYPES_OFF` constant                                               | YES                  | Backend value object                 | LOW                              |
| **Holiday handling**                     | `Holiday` Prisma model                            | `TURKISH_HOLIDAYS_2026` constant                                         | PARTIAL              | Backend `Holiday` model              | LOW                              |
| **Schedule status machine**              | `Schedule` aggregate (6 states)                   | Frontend status types                                                    | YES                  | Backend aggregate                    | LOW                              |
| **Version management**                   | `ScheduleSnapshot` + `VersionDiff`                | None                                                                     | NO                   | Backend only                         | N/A                              |
| **Override logic**                       | `ScheduleApplicationService.overrideAssignment()` | None                                                                     | NO                   | Backend only                         | N/A                              |
| **Workflow transitions**                 | `Schedule` aggregate methods                      | Frontend status types                                                    | YES                  | Backend aggregate                    | LOW                              |
| **Unit-specific rules (MR/BT/Nuclear)**  | NONE                                              | `ComprehensiveConstraintValidatorService`                                | NO                   | **NEW** backend constraints          | HIGH — must create               |
| **Personnel protection (pregnancy/age)** | NONE                                              | `ComprehensiveConstraintValidatorService`                                | NO                   | **NEW** backend constraints          | HIGH — must create               |
| **Radiation dose tracking**              | NONE                                              | `ComprehensiveConstraintValidatorService`                                | NO                   | **NEW** backend constraints          | HIGH — must create               |

### Summary

| Category                                          | Count   | Action                            |
| ------------------------------------------------- | ------- | --------------------------------- |
| **Backend is canonical** (frontend is duplicate)  | 8 rules | Delete frontend, use backend DTOs |
| **Frontend is canonical** (no backend equivalent) | 5 rules | Create in backend                 |
| **Both have different versions** (need merger)    | 6 rules | Align weights/algorithms          |
| **Backend only** (no frontend logic)              | 4 rules | Already correct                   |
| **Neither has full implementation**               | 3 rules | Create in backend                 |

---

## PART 12: Backend Optimizer Boundary

### ScheduleOptimizerService (Future)

```
┌──────────────────────────────────────────────────────┐
│                  ScheduleOptimizerService             │
│                                                      │
│  INPUT:                                               │
│  ┌──────────────────────────────────────────────┐    │
│  │  SchedulingProblem                            │    │
│  │  - unitId: string                             │    │
│  │  - month: number                              │    │
│  │  - year: number                               │    │
│  │  - personnel: GenerationPersonnelInfo[]       │    │
│  │  - devices: GenerationDeviceInfo[]            │    │
│  │  - holidays: Set<string>                      │    │
│  │  - existingAssignments?: Assignment[]          │    │
│  │  - configuration: OptimizationConfig          │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  INTERNALS:                                           │
│  ┌──────────────────────────────────────────────┐    │
│  │  1. Build master data snapshot                │    │
│  │  2. Initialize population (if GA)             │    │
│  │  3. For each candidate:                       │    │
│  │     a. Generate assignments                   │    │
│  │     b. Validate with HardConstraints          │    │
│  │     c. Score with SoftConstraints             │    │
│  │     d. Calculate composite score              │    │
│  │  4. Evolve (selection, crossover, mutation)   │    │
│  │  5. Return best candidate                     │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  OUTPUT:                                              │
│  ┌──────────────────────────────────────────────┐    │
│  │  OptimizationResult                           │    │
│  │  - assignments: Assignment[]                  │    │
│  │  - conflicts: Conflict[]                      │    │
│  │  - validation: ValidationResult               │    │
│  │  - fairness: FairnessResult                   │    │
│  │  - score: ScoringOutput                       │    │
│  │  - optimizationTime: number                   │    │
│  │  - iterations: number                         │    │
│  │  - improvementGain: number                    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Dependencies

```
ScheduleOptimizerService
├── ConstraintEngine (hard constraints)
├── SoftConstraint[] (soft constraints — new)
├── FairnessEngine (fairness calculation)
├── ScoringModel (score calculation)
├── FatigueEngine (fatigue scoring — new)
├── SeededRandom (deterministic randomness)
├── ScheduleValidationService (orchestration)
└── PrismaScheduleRepository (data access)
```

---

## PART 13: Dry-Run Boundary

### API Design

```
POST /api/v1/schedules/dry-run

Guarantee: NO DATABASE MUTATION.
```

### Request

```typescript
interface DryRunRequest {
  unitId: string;
  month: number;
  year: number;
  algorithm?: "greedy" | "genetic";
  configuration?: Partial<OptimizationConfig>;
  existingAssignments?: AssignmentDTO[]; // Optional: include existing
}
```

### Response

```typescript
interface DryRunResponse {
  assignments: AssignmentDTO[];
  conflicts: ConflictDTO[];
  validation: {
    valid: boolean;
    hardViolations: HardViolationSummary;
    softViolations: SoftViolationSummary;
    warnings: string[];
  };
  fairness: FairnessResultDTO;
  workload: WorkloadMetricsDTO;
  coverage: CoverageMetricsDTO;
  score: ScoringOutputDTO;
  summary: {
    totalAssignments: number;
    totalConflicts: number;
    hardViolations: number;
    softWarnings: number;
    coveragePercent: number;
    fairnessScore: number;
    overallScore: number;
    generationTime: number;
  };
  warnings: string[];
}
```

### Dry-Run Implementation Boundary

```
Dry-Run Request
    ↓
ScheduleOptimizerService.dryRun()
    ↓
Build in-memory master data (NO DB writes)
    ↓
Generate candidate schedule
    ↓
Validate with constraints
    ↓
Calculate fairness + scoring
    ↓
Return full result
    ↓
NO PERSISTENCE. NO EVENTS. NO WEBSOCKET BROADCAST.
```

### What Dry-Run MUST NOT Do

- Write to database
- Emit domain events
- Broadcast via WebSocket
- Modify schedule state
- Create snapshots
- Send notifications
- Queue jobs

---

_Audit completed: 2026-08-25_
