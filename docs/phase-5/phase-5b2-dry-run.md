# Phase 5B.2 — Dry-Run API

## Endpoint

```
POST /api/v1/schedules/optimize/dry-run
```

## Authentication

- JWT authentication required
- Minimum role: `HEAD_TECHNICIAN`
- Tenant isolation enforced
- Unit access verified via ScheduleAccessGuard

## Request DTO

```typescript
{
  scheduleId: string;      // Required
  unitType: string;        // Required (mr, bt, rontgen, nukleer, onkoloji)
  year: number;            // 2024-2030
  month: number;           // 1-12
  strategy?: 'greedy';    // Default: 'greedy'
  fairnessMode?: string;   // 'balanced' | 'seniority' | 'skill'
  maxOvertime?: number;    // 0-100
  includeWeekends?: boolean;
  includeNightShifts?: boolean;
  minRestHours?: number;   // 8-24
  maxConsecutiveDays?: number;
  maxConsecutiveNights?: number;
}
```

## Response

```typescript
{
  success: boolean;
  strategy: string;
  candidate: {
    assignments: CandidateAssignment[];
    isValid: boolean;
    hardConstraintViolations: Conflict[];
    softConstraintScores: ConstraintScore[];
    totalScore: number;
    scoreBreakdown: { fairness, workload, fatigue };
    explanations: string[];
  };
  summary: {
    totalAssignments: number;
    personnelCount: number;
    deviceCount: number;
    hardViolations: number;
    softViolations: number;
    totalScore: number;
    fairnessScore: number;
    workloadScore: number;
    fatigueScore: number;
  };
  metadata: {
    executionTimeMs: number;
    candidateGenerationTimeMs: number;
    hardConstraintTimeMs: number;
    softConstraintTimeMs: number;
    scoreAggregationTimeMs: number;
    candidatesGenerated: number;
    validCandidates: number;
    deterministic: boolean;
  };
  explanations: string[];
}
```

## Safety Guarantees

- **NO database writes**
- **NO schedule modification**
- **NO assignment creation/modification**
- **NO migration triggers**
- **Transactionally safe**

## Service

`ScheduleDryRunService` → builds `SchedulingProblem` from DB → calls `ScheduleOptimizerService.optimize()` → returns `OptimizationResult`
