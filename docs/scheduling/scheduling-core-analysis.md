# Scheduling Core Analysis

**Date:** 2026-08-20

## Domain Model Overview

### Master Data (READ-ONLY for Scheduler)

| Model                  | Purpose                  | Key Fields                                                    |
| ---------------------- | ------------------------ | ------------------------------------------------------------- |
| Personnel              | Staff                    | role, skills[], nightShiftEligible, offDays[], maxWeeklyHours |
| Device                 | Imaging devices          | code, mode(vardiya/polyclinic), requiredSkills[], workDays[]  |
| Shifts                 | Device shift definitions | type, startTime, endTime, blockId, optionalOnWeekends         |
| PersonShiftTemplate    | Person shift templates   | shiftType, startTime, endTime, personnelGroupId               |
| PersonnelGroup         | Staff groups             | code, name, unitId                                            |
| Skill / PersonnelSkill | Qualification matrix     | certificationLevel, expiresAt                                 |
| Holiday                | Public holidays          | date, name, type, year                                        |

### Operational Data

| Model             | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| Schedule          | Monthly container (unitId, month, year, version, status)               |
| Assignment        | Core cell (personnelId, deviceId, date, shiftType, startTime, endTime) |
| AssignmentSlot    | Device availability (UNUSED in current services)                       |
| DutyRoster        | Alternative person-based roster                                        |
| ScheduleSnapshot  | Version snapshots for rollback                                         |
| ScheduleApproval  | Workflow audit trail                                                   |
| ShiftDateOverride | Per-date shift enable/disable                                          |

## Schedule State Machine

```
DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
  ↑          ↓
  ↑       REJECTED
  ↑__________|
```

Additional transitions:

- PUBLISHED → DRAFT (createRevision — new version)
- PUBLISHED/ARCHIVED → DRAFT (rollback to snapshot)

## Validation Rules (20 rules)

### BLOCKING (Cannot Override)

1. PERSONNEL_NOT_FOUND
2. DEVICE_REQUIRED / DEVICE_BOOKED
3. PERSONNEL_NOT_IN_UNIT / PERSONNEL_NOT_IN_GROUP
4. GROUP_NOT_FOUND / GROUP_NOT_IN_UNIT / GROUP_NOT_IN_GROUP
5. TEMPLATE_NOT_FOUND / TEMPLATE_NOT_IN_GROUP / TEMPLATE_NOT_IN_UNIT
6. TEMPLATE_SHIFT_MISMATCH
7. GROUP_SLOT_OCCUPIED / SAME_SLOT
8. INACTIVE_PERSONNEL

### WARNING (Can Override with Reason)

9. TIME_OVERLAP
10. NOT_NIGHT_ELIGIBLE
11. OFF_DAY_CONFLICT
12. REST_RULE_VIOLATION (only checks night→day)

## Auto-Generator

- **Algorithm:** Iterative greedy with scoring (named "Genetic" but isn't)
- **Constraints:** Rest hours (11h), consecutive days (6), consecutive nights (3), off-days, night eligibility, device workDays
- **Fairness:** Configurable mode, workload balancing

## Gaps

### Frontend/Backend Duplication

Frontend has 10 scheduling services (constraint-validator, fatigue-engine, fairness-balancer, etc.) that duplicate backend validation logic. No shared validation source of truth.

### Validation Gaps in Manual Assignment

- `maxWeeklyHours` NOT enforced
- `maxConsecutiveDays` NOT enforced (only in auto-generator)
- `maxConsecutiveNights` NOT enforced (only in auto-generator + alert post-hoc)
- Skill/certification NOT checked at assignment time (only at publish)
- Rest rule only checks night→day, not general minimum rest

### Workflow Gaps

- No partial approval
- No delegation
- No scheduled publish date
- `publishByUnit()` bypasses state machine shortcuts
- Archived is terminal (no reactivation)
