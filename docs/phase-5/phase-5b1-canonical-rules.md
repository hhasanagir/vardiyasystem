# Phase 5B.1 — Canonical Business Rules

## Ownership Table

| #   | Business Rule                          | Canonical Location                                           | Hard/Soft | Scope   | Current       | Migration                               |
| --- | -------------------------------------- | ------------------------------------------------------------ | --------- | ------- | ------------- | --------------------------------------- |
| 1   | Personnel must be active               | `hard-constraints.ts:PersonnelIsActiveConstraint`            | HARD      | Global  | Backend       | ✅ Canonical                            |
| 2   | Device required for device assignments | `hard-constraints.ts:DeviceIsRequiredConstraint`             | HARD      | Global  | Backend       | ✅ Canonical                            |
| 3   | No overlapping assignments             | `hard-constraints.ts:NoOverlappingAssignmentsConstraint`     | HARD      | Global  | Backend       | ✅ Canonical                            |
| 4   | Minimum rest between shifts (11h)      | `hard-constraints.ts:RequiredRestConstraint`                 | HARD      | Global  | Backend       | ✅ Fixed: now imports from constants.ts |
| 5   | Night shift eligibility                | `hard-constraints.ts:NightShiftEligibilityConstraint`        | HARD      | Global  | Backend       | ✅ Canonical                            |
| 6   | Off day conflict                       | `hard-constraints.ts:OffDayConflictConstraint`               | HARD      | Global  | Backend       | ✅ Canonical                            |
| 7   | Personnel in unit                      | `hard-constraints.ts:PersonnelInUnitConstraint`              | HARD      | Global  | Backend       | ✅ Canonical                            |
| 8   | Personnel in group                     | `hard-constraints.ts:PersonnelInGroupConstraint`             | HARD      | Global  | Backend       | ✅ Canonical                            |
| 9   | Device skills match                    | `hard-constraints.ts:DeviceSkillsConstraint`                 | HARD      | Global  | Backend       | ✅ Canonical                            |
| 10  | Template validation                    | `hard-constraints.ts:TemplateValidationConstraint`           | HARD      | Global  | Backend       | ✅ Canonical                            |
| 11  | Group slot occupied                    | `hard-constraints.ts:GroupSlotOccupiedConstraint`            | HARD      | Global  | Backend       | ✅ Canonical                            |
| 12  | Consecutive night rest                 | `hard-constraints.ts:RequiredRestConstraintNew`              | HARD      | Global  | Backend       | ✅ Canonical                            |
| 13  | Night shift distribution fairness      | `soft-fairness.ts:FairnessSoftConstraint`                    | SOFT      | Global  | Backend       | ✅ NEW: canonical backend               |
| 14  | Fatigue scoring                        | `soft-fatigue.ts:FatigueSoftConstraint`                      | SOFT      | Global  | Frontend only | ✅ NEW: canonical backend               |
| 15  | Workload balance                       | `soft-workload.ts:WorkloadBalanceSoftConstraint`             | SOFT      | Global  | Frontend only | ✅ NEW: canonical backend               |
| 16  | Max consecutive days (6)               | `fatigue-engine.ts:WORKLOAD_LIMITS`                          | SOFT      | Global  | Frontend      | ✅ NEW: canonical backend               |
| 17  | Weekend shift penalty                  | `fatigue-engine.ts:DEFAULT_FATIGUE_COEFFICIENTS`             | SOFT      | Global  | Frontend      | ✅ NEW: canonical backend               |
| 18  | Holiday shift penalty                  | `fatigue-engine.ts:DEFAULT_FATIGUE_COEFFICIENTS`             | SOFT      | Global  | Frontend      | ✅ NEW: canonical backend               |
| 19  | Overtime penalty                       | `fatigue-engine.ts:DEFAULT_FATIGUE_COEFFICIENTS`             | SOFT      | Global  | Frontend      | ✅ NEW: canonical backend               |
| 20  | Imaging modality match                 | `scheduling-strategy.ts:ImagingSchedulingStrategy`           | HARD      | Imaging | Frontend      | ⏳ Strategy placeholder                 |
| 21  | Imaging device capability              | `scheduling-strategy.ts:ImagingSchedulingStrategy`           | HARD      | Imaging | Frontend      | ⏳ Strategy placeholder                 |
| 22  | RT dose limit                          | `scheduling-strategy.ts:RadiationOncologySchedulingStrategy` | HARD      | RT      | Frontend      | ⏳ Strategy placeholder                 |
| 23  | RT machine qualification               | `scheduling-strategy.ts:RadiationOncologySchedulingStrategy` | HARD      | RT      | Frontend      | ⏳ Strategy placeholder                 |

## Canonical Source: constants.ts

```
MIN_REST_HOURS = 11
REQUIRED_REST_HOURS = 11
NIGHT_TO_DAY_REST_HOURS = 24
MAX_CONSECUTIVE_NIGHTS = 3
STANDARD_SHIFT_HOURS = 8
```

## Canonical Source: fatigue-engine.ts

```
WORKLOAD_LIMITS.maxConsecutiveDays = 6
WORKLOAD_LIMITS.maxNightShiftsPerWeek = 3
WORKLOAD_LIMITS.minRecoveryHoursAfterNight = 24
WORKLOAD_LIMITS.minRecoveryHoursLegal = 11 (= REQUIRED_REST_HOURS)
```

## Migration Status

- **Backend canonical:** 15/23 rules (hard constraints + new soft constraints + fatigue engine)
- **Strategy placeholders:** 4/23 rules ( Imaging + RT domain-specific rules)
- **Frontend-only:** 4/23 rules (unit-specific MR/BT/Nuclear constraints)
