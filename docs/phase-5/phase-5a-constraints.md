# Phase 5A: Constraint System Reference

**VardiyaOS — Scheduling Constraints**

---

## Architecture Overview

```
ConstraintEngine
├── HardConstraint[]          (12 existing, extensible)
├── validate()                → ValidationReport
├── validateWithOverride()    → ValidationReport (with override filtering)
└── canOverride()             → { canBlocking, blockingViolations }

Future (Phase 5B):
├── SoftConstraint[]          (new interface)
└── validateSoft()            → SoftValidationReport
```

---

## Existing Hard Constraints (12)

### 1. PersonnelIsActiveConstraint

- **Rule:** `INACTIVE_PERSONNEL`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Personnel must be active with active employment status
- **Lookup:** `PersonnelLookup.findById()`

### 2. DeviceIsRequiredConstraint

- **Rule:** `DEVICE_REQUIRED`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Device-kind assignments must have a device
- **No lookup needed**

### 3. NoOverlappingAssignmentsConstraint

- **Rule:** `TIME_OVERLAP`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Personnel cannot have overlapping assignments on the same date
- **Lookup:** `AssignmentCollection.findByPersonnelAndDate()`
- **Note:** Non-working shifts are excluded from overlap check

### 4. RequiredRestConstraint

- **Rule:** `REQUIRED_REST_NOT_MET`
- **Severity:** BLOCKING (overridable)
- **Overridable:** Yes (WARNING)
- **Logic:** Minimum 8 hours rest between consecutive shifts
- **Lookup:** `AssignmentCollection.getLastAssignmentBefore()`
- **Constant:** `MIN_REST_HOURS = 8`

### 5. NightShiftEligibilityConstraint

- **Rule:** `NOT_NIGHT_ELIGIBLE`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Only night-eligible personnel can be assigned night shifts
- **Lookup:** `PersonnelLookup.findById()`

### 6. OffDayConflictConstraint

- **Rule:** `OFF_DAY_CONFLICT`
- **Severity:** BLOCKING (overridable)
- **Overridable:** Yes (WARNING)
- **Logic:** Personnel cannot be assigned on their configured off days
- **Lookup:** `PersonnelLookup.findById()`
- **Note:** Uses `date.dayOfWeek` (0=Sunday)

### 7. PersonnelInUnitConstraint

- **Rule:** `PERSONNEL_NOT_IN_UNIT`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Personnel must belong to the unit they are assigned to
- **Lookup:** `PersonnelLookup.findById()`

### 8. PersonnelInGroupConstraint

- **Rule:** `PERSONNEL_NOT_IN_GROUP`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Personnel must belong to the group they are assigned to
- **Lookup:** `PersonnelLookup.findById()`
- **Note:** Skipped if no group specified

### 9. DeviceSkillsConstraint

- **Rule:** `PERSON_DEVICE_NOT_ALLOWED`
- **Severity:** BLOCKING (overridable)
- **Overridable:** Yes (WARNING)
- **Logic:** Personnel must have required skills for the assigned device
- **Lookup:** `DeviceLookup.findById()`, `PersonnelLookup.findById()`
- **Note:** Checks both `skills` and `deviceSkills` arrays

### 10. TemplateValidationConstraint

- **Rule:** `TEMPLATE_NOT_FOUND`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Shift template must exist, be active, and match assignment shift type
- **Lookup:** `ShiftTemplateLookup.findById()`
- **Rules checked:** Template exists, template is active, shift type matches

### 11. GroupSlotOccupiedConstraint

- **Rule:** `GROUP_SLOT_OCCUPIED`
- **Severity:** BLOCKING (overridable)
- **Overridable:** Yes (WARNING)
- **Logic:** Group slot for the shift must not already be occupied
- **Lookup:** `AssignmentCollection.all`
- **Note:** Checks same group + same template + same date

### 12. RequiredRestConstraintNew

- **Rule:** `REST_RULE_VIOLATION`
- **Severity:** BLOCKING
- **Overridable:** No
- **Logic:** Night shift requires 1+ day rest between consecutive nights
- **Lookup:** `AssignmentCollection.getLastNightShiftBefore()`
- **Note:** Different from RequiredRestConstraint (which checks hours)

---

## All Violation Rules (20)

```typescript
type ViolationRule =
  | "PERSONNEL_NOT_FOUND" // Personnel doesn't exist
  | "DEVICE_REQUIRED" // Device needed for device assignment
  | "DEVICE_BOOKED" // Device already booked (mapped to DEVICE_OVERLAP)
  | "PERSON_DEVICE_NOT_ALLOWED" // Skills mismatch
  | "PERSONNEL_NOT_IN_UNIT" // Unit mismatch
  | "PERSONNEL_NOT_IN_GROUP" // Group mismatch
  | "GROUP_NOT_FOUND" // Group doesn't exist
  | "GROUP_NOT_IN_UNIT" // Group unit mismatch
  | "TEMPLATE_NOT_FOUND" // Template doesn't exist
  | "TEMPLATE_NOT_IN_GROUP" // Template group mismatch
  | "TEMPLATE_NOT_IN_UNIT" // Template unit mismatch
  | "TEMPLATE_SHIFT_MISMATCH" // Template shift type mismatch
  | "GROUP_SLOT_OCCUPIED" // Group slot taken
  | "SAME_SLOT" // Same slot conflict (mapped to PERSON_OVERLAP)
  | "TIME_OVERLAP" // Time overlap (mapped to PERSON_OVERLAP)
  | "INACTIVE_PERSONNEL" // Personnel inactive
  | "NOT_NIGHT_ELIGIBLE" // Not night-eligible
  | "OFF_DAY_CONFLICT" // Off day conflict
  | "REST_RULE_VIOLATION" // Night rest rule
  | "REQUIRED_REST_NOT_MET"; // Minimum rest not met
```

---

## Mapping: ViolationRule → ConflictCode

| ViolationRule             | ConflictCode     |
| ------------------------- | ---------------- |
| PERSONNEL_NOT_FOUND       | RULE_VIOLATION   |
| DEVICE_REQUIRED           | RULE_VIOLATION   |
| DEVICE_BOOKED             | DEVICE_OVERLAP   |
| PERSON_DEVICE_NOT_ALLOWED | RULE_VIOLATION   |
| PERSONNEL_NOT_IN_UNIT     | RULE_VIOLATION   |
| PERSONNEL_NOT_IN_GROUP    | RULE_VIOLATION   |
| GROUP_NOT_FOUND           | RULE_VIOLATION   |
| GROUP_NOT_IN_UNIT         | RULE_VIOLATION   |
| TEMPLATE_NOT_FOUND        | RULE_VIOLATION   |
| TEMPLATE_NOT_IN_GROUP     | RULE_VIOLATION   |
| TEMPLATE_NOT_IN_UNIT      | RULE_VIOLATION   |
| TEMPLATE_SHIFT_MISMATCH   | RULE_VIOLATION   |
| GROUP_SLOT_OCCUPIED       | DEVICE_OVERLAP   |
| SAME_SLOT                 | PERSON_OVERLAP   |
| TIME_OVERLAP              | PERSON_OVERLAP   |
| INACTIVE_PERSONNEL        | RULE_VIOLATION   |
| NOT_NIGHT_ELIGIBLE        | RULE_VIOLATION   |
| OFF_DAY_CONFLICT          | OFF_DAY_CONFLICT |
| REST_RULE_VIOLATION       | REST_VIOLATION   |
| REQUIRED_REST_NOT_MET     | REST_VIOLATION   |

---

## ConstraintContext Interface

```typescript
interface ConstraintContext {
  assignment: Assignment; // The assignment being validated
  existingAssignments: AssignmentCollection; // All existing assignments in schedule
  personnelLookup: PersonnelLookup; // Personnel data (in-memory map)
  deviceLookup: DeviceLookup; // Device data (in-memory map)
  holidays: Set<string>; // Holiday dates (YYYY-MM-DD)
  templates: ShiftTemplateLookup; // Shift templates (in-memory map)
  groups: GroupLookup; // Personnel groups (in-memory map)
  now: Date; // Current timestamp
}
```

---

## Lookup Interfaces

### PersonnelLookup

```typescript
interface PersonnelLookup {
  findById(id: string): PersonnelInfo | undefined;
}

interface PersonnelInfo {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus: string;
  unitId: string;
  groupId: string | null;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  offDays: number[];
  maxWeeklyHours: number;
}
```

### DeviceLookup

```typescript
interface DeviceLookup {
  findById(id: string): DeviceInfo | undefined;
}

interface DeviceInfo {
  id: string;
  code: string;
  name: string;
  unitId: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  isActive: boolean;
}
```

### ShiftTemplateLookup

```typescript
interface ShiftTemplateLookup {
  findById(id: string): ShiftTemplateInfo | undefined;
}

interface ShiftTemplateInfo {
  id: string;
  unitId: string;
  personnelGroupId: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
```

### GroupLookup

```typescript
interface GroupLookup {
  findById(id: string): GroupInfo | undefined;
}

interface GroupInfo {
  id: string;
  unitId: string;
  name: string;
  code: string;
  isActive: boolean;
}
```

---

## Proposed Soft Constraints (Phase 5B)

Soft constraints are advisory — they produce warnings, not blocking violations.

### 1. WeekendBalanceConstraint

- **Description:** Prefer balanced weekend distribution
- **Weight:** Configurable (default 0.3)
- **Calculation:** Coefficient of variation of weekend counts

### 2. NightBalanceConstraint

- **Description:** Prefer balanced night shift distribution
- **Weight:** Configurable (default 0.25)
- **Calculation:** CV of night counts

### 3. ConsecutiveDaysConstraint

- **Description:** Prefer fewer consecutive working days
- **Weight:** Configurable (default 0.2)
- **Threshold:** 4+ consecutive days = warning

### 4. PreferenceConstraint

- **Description:** Respect personnel shift preferences
- **Weight:** Configurable (default 0.15)
- **Data source:** Personnel preference settings

### 5. SeniorityConstraint

- **Description:** Senior personnel get priority for desirable shifts
- **Weight:** Configurable (default 0.1)
- **Logic:** Higher seniority → higher priority for day shifts, lower for nights

---

## Extending the Constraint Engine

To add a new constraint:

1. Create a class implementing `HardConstraint`:

```typescript
export class MyNewConstraint implements HardConstraint {
  code: ViolationRule = "MY_NEW_RULE";
  description = "Description of the constraint";

  evaluate(ctx: ConstraintContext): ConstraintResult {
    // Validation logic
    // Return result([]) for pass, result([violation]) for fail
  }
}
```

2. Add to `ALL_HARD_CONSTRAINTS` array in `hard-constraints.ts`:

```typescript
export const ALL_HARD_CONSTRAINTS: HardConstraint[] = [
  // ... existing constraints ...
  new MyNewConstraint(),
];
```

3. Add violation rule mapping in `schedule-validation.service.ts`:

```typescript
const VIOLATION_RULE_TO_CONFLICT_CODE: Record<ViolationRule, ConflictCode> = {
  // ... existing mappings ...
  MY_NEW_RULE: ConflictCode.RULE_VIOLATION,
};
```

The constraint will be automatically included in all validation operations.
