# Phase 5A: Optimization & Generation Reference

**VardiyaOS — Schedule Optimization Architecture**

---

## Current State

### Backend: Greedy Generation

`ScheduleAutoGeneratorService` (637 lines) performs greedy schedule generation:

```
For each day in month:
  For each device shift:
    For each device:
      1. Find eligible personnel (active, skills match, not assigned)
      2. Score candidates (seniority, night eligibility, off-day avoidance)
      3. Assign best candidate
      4. Validate against constraints
      5. Record assignment
```

**Limitations:**

- No global optimization (greedy, first-fit)
- No fairness-aware distribution
- No fatigue consideration
- No lookahead for future assignments
- No iterative improvement

### Frontend: Genetic Algorithm

`ConstraintSolverService` (350 lines) implements genetic algorithm optimization:

```
1. Initialize population (multiple random schedules)
2. Evaluate fitness:
   - Constraint violations (penalty)
   - Fairness score
   - Coverage score
   - Workload balance
3. Selection (tournament)
4. Crossover (single-point)
5. Mutation (random swap)
6. Repeat for maxIterations
7. Return best candidate
```

**Capabilities:**

- Global optimization
- Multi-objective fitness
- Population-based search
- Configurable parameters (population size, iterations, mutation rate)

### Frontend: Additional Engines

| Engine                        | Purpose                      | Lines |
| ----------------------------- | ---------------------------- | ----- |
| `FairnessBalancerService`     | Fairness metrics calculation | 180   |
| `FatigueEngineService`        | Fatigue scoring              | 120   |
| `RebalanceEngineService`      | Swap-based rebalancing       | 300   |
| `RecommendationEngineService` | Smart swap recommendations   | 450   |
| `ConflictDetectorService`     | Conflict detection           | 250   |
| `SchedulingEngineService`     | Orchestrator                 | 200   |

---

## Proposed Backend Optimizer (Phase 5B)

### ScheduleOptimizerService

```typescript
@Injectable()
export class ScheduleOptimizerService {
  constructor(
    private readonly validationService: ScheduleValidationService,
    private readonly fairnessEngine: FairnessEngine,
    private readonly scoringModel: ScoringModel,
  ) {}

  async optimize(
    scheduleId: string,
    config: OptimizationConfig,
  ): Promise<OptimizationResult> {
    // 1. Load current schedule + master data
    // 2. Initialize population
    // 3. Evaluate fitness
    // 4. Evolve for maxIterations
    // 5. Return best solution
  }

  async dryRun(params: DryRunParams): Promise<DryRunResult> {
    // 1. Build master data snapshot
    // 2. Generate schedule (without persisting)
    // 3. Validate with constraints
    // 4. Calculate fairness
    // 5. Calculate score
    // 6. Return full result (no DB write)
  }
}
```

### OptimizationConfig

```typescript
interface OptimizationConfig {
  algorithm: "genetic" | "greedy" | "backtracking";
  populationSize: number; // Default: 50
  maxIterations: number; // Default: 1000
  mutationRate: number; // Default: 0.1
  crossoverRate: number; // Default: 0.7
  tournamentSize: number; // Default: 3
  seed: number; // For deterministic results
  fairnessMode: "balanced" | "night-focused" | "weekend-focused";
  maxConsecutiveDays: number; // Default: 6
  minRestHours: number; // Default: 8
  allowOvertime: boolean; // Default: false
}
```

### OptimizationResult

```typescript
interface OptimizationResult {
  schedule: Schedule;
  assignments: Assignment[];
  conflicts: Conflict[];
  validation: ValidationResult;
  fairness: FairnessResult;
  score: ScoringOutput;
  optimizationTime: number;
  algorithm: string;
  iterations: number;
  improvementGain: number; // score improvement vs initial
  metadata: OptimizationMetadata;
}

interface DryRunResult {
  assignments: Assignment[];
  conflicts: Conflict[];
  validation: ValidationResult;
  fairness: FairnessResult;
  score: ScoringOutput;
  warnings: string[];
  generatedAt: Date;
  // No scheduleId — not persisted
}
```

---

## Candidate Generation

### Backend Candidate Generation (Phase 5B)

For each assignment slot (day × device × shift type):

1. **Filter eligible personnel:**
   - Active
   - In correct unit
   - Has required skills
   - Not already assigned at this time
   - Not on off day (unless override)
   - Night-eligible (for night shifts)

2. **Score candidates:**
   - Seniority weight
   - Night shift count (prefer lower)
   - Weekend count (prefer lower)
   - Hours worked (prefer balanced)
   - Skill match quality

3. **Select:**
   - Greedy: highest-scoring candidate
   - Genetic: random selection with tournament

### Candidate Evaluation

```typescript
interface CandidateEvaluation {
  personnelId: string;
  score: number;
  constraintViolations: AssignmentViolation[];
  fairnessImpact: FairnessImpact;
  fatigueImpact: FatigueImpact;
}
```

---

## Dry-Run API Design

### Endpoint

```
POST /api/v1/schedules/dry-run
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
  validation: ValidationResultDTO;
  fairness: FairnessResultDTO;
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

### Frontend Integration

The frontend already has:

- `ScheduleService.previewSchedule()` → calls `/schedules/generate/preview`
- `AutoGenerateDialogComponent` with preview state machine

Phase 5B will:

1. Enhance backend `preview()` to use `ScheduleOptimizerService`
2. Return full scoring/fairness/conflict data
3. Frontend displays enhanced preview with scoring

---

## Performance Considerations

### Genetic Algorithm Complexity

- **Population size:** 50-200 candidates
- **Per iteration:** O(P × N × M) where P=population, N=assignments, M=constraints
- **Total:** O(iterations × P × N × M)
- **Typical:** 1000 × 50 × 2700 × 12 = ~1.6 billion operations
- **Optimized with lookup maps:** ~100ms per iteration
- **Total time:** ~100 seconds for 1000 iterations

### Optimization Strategies

1. **Lookup maps** — Pre-build personnel/device/template maps (O(1) lookup)
2. **Incremental validation** — Only revalidate changed assignments
3. **Early termination** — Stop if no improvement for N iterations
4. **Parallel evaluation** — Evaluate population members in parallel
5. **Caching** — Cache constraint evaluation results for unchanged assignments

### Recommended Limits

| Parameter       | Min  | Default | Max  |
| --------------- | ---- | ------- | ---- |
| Population size | 10   | 50      | 200  |
| Max iterations  | 100  | 1000    | 5000 |
| Mutation rate   | 0.01 | 0.1     | 0.3  |
| Crossover rate  | 0.5  | 0.7     | 0.9  |
| Timeout         | 10s  | 120s    | 300s |

---

## Frontend Preview Enhancement

### Current Preview Flow

```
User → AutoGenerateDialog → ScheduleService.previewSchedule()
  → POST /schedules/generate/preview
  → Backend generates (greedy)
  → Returns assignments[]
  → Dialog shows preview table
  → User clicks "Apply"
  → POST /schedules/:id/generate
```

### Enhanced Preview Flow (Phase 5B)

```
User → AutoGenerateDialog → ScheduleService.dryRun()
  → POST /schedules/dry-run
  → Backend generates (genetic algorithm)
  → Validates with all constraints
  → Calculates fairness + scoring
  → Returns full result (assignments + conflicts + validation + fairness + score)
  → Dialog shows:
    - Preview table (assignments)
    - Score dashboard (overall, coverage, fairness, workload)
    - Conflict list (hard violations, warnings)
    - Fairness breakdown (per-person night/weekend/workload)
  → User adjusts configuration
  → Re-runs dry-run
  → Satisfied → clicks "Apply"
  → POST /schedules/:id/generate (with same config)
```

### Score Dashboard (Frontend)

```
┌─────────────────────────────────────────────────┐
│  Schedule Score: 87.3/100                       │
│                                                 │
│  Coverage:    ████████████░░░  92%              │
│  Fairness:    ██████████░░░░░  85%              │
│  Workload:    ████████████░░░  88%              │
│  Preference:  █████████████░░  91%              │
│                                                 │
│  Hard Violations: 0                             │
│  Soft Warnings: 12                              │
│  Conflicts: 3 (all overridable)                 │
│                                                 │
│  Generation Time: 45.2s                         │
│  Algorithm: Genetic (pop=50, iter=1000)         │
└─────────────────────────────────────────────────┘
```
