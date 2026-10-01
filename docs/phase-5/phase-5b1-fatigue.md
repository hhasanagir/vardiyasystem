# Phase 5B.1 — Canonical Fatigue Engine

## Architecture

The canonical fatigue calculation lives in `backend/src/modules/schedules/domain/models/fatigue-engine.ts`.

## Penalty-Based Scoring

```
score = max(0, min(100, 100 - totalPenalty * 100))
```

## Fatigue Coefficients (Canonical)

| Factor                  | Coefficient | Description                             |
| ----------------------- | ----------- | --------------------------------------- |
| consecutiveNightPenalty | 0.15        | Per consecutive night shift             |
| weekendShiftPenalty     | 0.08        | Per weekend shift in current week       |
| holidayShiftPenalty     | 0.12        | Holiday shift penalty                   |
| shortRestPenalty        | 0.20        | Rest < minRecoveryHoursAfterNight (24h) |
| overtimePenalty         | 0.10        | Per overtime hour (>40h/week)           |
| consecutiveDaysPenalty  | 0.05        | Per day beyond maxConsecutiveDays (6)   |

## Workload Limits (Canonical)

| Limit                      | Value | Description                                |
| -------------------------- | ----- | ------------------------------------------ |
| maxWeeklyShifts            | 6     | Maximum shifts per week                    |
| maxNightShiftsPerWeek      | 3     | Maximum night shifts per week              |
| maxConsecutiveDays         | 6     | Maximum consecutive work days              |
| minRecoveryHoursAfterNight | 24    | Minimum recovery after night shift         |
| minRecoveryHoursLegal      | 11    | Legal minimum rest (= REQUIRED_REST_HOURS) |

## Risk Levels

| Score | Risk Level |
| ----- | ---------- |
| ≥70   | low        |
| 50-69 | medium     |
| 30-49 | high       |
| <30   | critical   |

**Exception:** Any short_rest factor → critical regardless of score.

## Hard vs Soft Separation

### HARD (in hard-constraints.ts)

- `RequiredRestConstraint`: rest < MIN_REST_HOURS (11h) → BLOCKING
- `RequiredRestConstraintNew`: consecutive nights without 1+ day rest → BLOCKING

### SOFT (in fatigue-engine.ts)

- Consecutive nights penalty → score reduction
- Weekend/holiday penalty → score reduction
- Short rest penalty → score reduction
- Overtime penalty → score reduction
- Consecutive days penalty → score reduction

## Characterization Tests

- `fatigue-engine.spec.ts`: 9 tests
  - Empty history → score 100, risk low
  - Weekend penalization
  - Holiday penalization
  - Canonical REQUIRED_REST_HOURS = 11
  - Canonical consecutiveNightPenalty = 0.15
  - Score never negative
  - Score never exceeds 100
  - Risk level is valid enum
  - Custom coefficients

## Input Structure

```typescript
interface FatigueInput {
  candidateDate: string;
  candidateShiftType: string;
  candidateStartTime: string;
  candidateEndTime: string;
  personnelId: string;
  existingAssignments: AssignmentCollection;
  holidays: Set<string>;
}
```
