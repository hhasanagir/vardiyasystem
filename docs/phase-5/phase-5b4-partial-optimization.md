# Phase 5B.4 — Partial Schedule Optimization

## Concept

The optimizer now supports two modes:

### Full Optimization

- `problem.existingAssignments` is empty
- Optimizer generates all assignments from scratch
- Identical to 5B.2 behavior

### Partial Optimization

- `problem.existingAssignments` contains pre-existing assignments
- Existing assignments are pre-seeded into the candidate
- Optimizer generates only unfilled slots
- Existing assignments are preserved and not modified

## Pipeline

```
Existing Schedule
  ↓
Existing Assignments (problem.existingAssignments)
  ↓
Pre-seed Candidate (mark as isPreSeeded: true)
  ↓
Build tracking state (workload, nights, consecutive days)
  ↓
Identify unfilled slots (device × date × shiftType)
  ↓
Generate candidates for unfilled slots only
  ↓
Hard constraint validation (new assignments only)
  ↓
Soft constraint scoring (full candidate: existing + new)
  ↓
Score aggregation (canonical weights)
  ↓
Return result with component scores
```

## Constraints on Partial Mode

1. Existing assignments are IMMUTABLE during optimization
2. Existing assignments ARE included in fairness/workload/fatigue calculations
3. Existing assignments are NOT re-validated against hard constraints
4. New assignments are validated against hard constraints
5. Soft constraints score the FULL candidate (existing + new)

## Use Cases

1. **Fill missing shifts**: Some shifts filled manually, optimizer fills the rest
2. **Optimize remaining slots**: After partial manual scheduling
3. **What-if analysis**: "If I keep these assignments, what's the optimal completion?"
4. **Incremental optimization**: Optimize only new/changed slots
