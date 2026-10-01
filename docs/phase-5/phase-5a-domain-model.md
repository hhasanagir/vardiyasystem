# Phase 5A: Domain Model Reference

**VardiyaOS — Scheduling Domain Model**

---

## Aggregate: Schedule

| Property       | Type           | Description                                            |
| -------------- | -------------- | ------------------------------------------------------ |
| id             | string (uuid)  | Aggregate identity                                     |
| unitId         | string         | Unit this schedule belongs to                          |
| organizationId | string?        | Organization (multi-tenant)                            |
| month          | number         | Month (1-12)                                           |
| year           | number         | Year                                                   |
| version        | number         | Optimistic concurrency version                         |
| status         | ScheduleStatus | draft → under_review → approved → published → archived |
| publishedAt    | Date?          | When published                                         |
| createdById    | string?        | Creator user ID                                        |
| assignments    | Assignment[]   | All shift assignments                                  |
| approvalData   | ApprovalData?  | Approval workflow state                                |

### Schedule Status Flow

```
draft → under_review → approved → published → archived
  ↑         ↓
  └── rejected
```

### Schedule Methods

| Method                                                      | Description          |
| ----------------------------------------------------------- | -------------------- |
| `addAssignment(params, userId)`                             | Add new assignment   |
| `overrideAssignment(params, userId, reason, rules)`         | Override with reason |
| `updateAssignment(assignmentId, changes, userId)`           | Modify assignment    |
| `removeAssignment(assignmentId, userId)`                    | Remove assignment    |
| `submitForReview(userId, name, role, comment?)`             | Submit for review    |
| `approve(userId, name, role, comment?)`                     | Approve (four-eyes)  |
| `reject(userId, name, role, reason)`                        | Reject               |
| `publish(userId, name, role)`                               | Publish              |
| `archive(userId, name, role)`                               | Archive              |
| `revertToDraft(userId, name, role)`                         | Revert to draft      |
| `rollback(targetVersion, data, userId, name, role, reason)` | Rollback to version  |

---

## Entity: Assignment

| Property         | Type             | Description                                                          |
| ---------------- | ---------------- | -------------------------------------------------------------------- |
| id               | string (uuid)    | Entity identity                                                      |
| scheduleId       | string           | Parent schedule                                                      |
| personnelId      | PersonnelId (VO) | Assigned person                                                      |
| deviceId         | DeviceId? (VO)   | Assigned device                                                      |
| unitId           | string?          | Unit                                                                 |
| personnelGroupId | string?          | Personnel group                                                      |
| shiftTemplateId  | string?          | Shift template                                                       |
| kind             | AssignmentKind   | 'device' or 'person'                                                 |
| source           | AssignmentSource | 'manual', 'auto_generated', 'override', 'swap', 'template', 'import' |
| date             | Date (VO)        | Assignment date                                                      |
| shiftType        | ShiftType (VO)   | 'day', 'evening', 'night', etc.                                      |
| startTime        | string           | e.g. "08:00"                                                         |
| endTime          | string           | e.g. "16:00"                                                         |
| personnelType    | string           | e.g. "technician"                                                    |
| isConfirmed      | boolean          | Personnel confirmation                                               |
| overrideReason   | string?          | Override reason                                                      |
| overriddenBy     | string?          | Who overrode                                                         |
| overriddenAt     | Date?            | When overrode                                                        |

### Assignment Unique Constraints

```sql
-- Device-based: one device per shift type per day per schedule
UNIQUE(scheduleId, deviceId, date, shiftType, personnelType)

-- Person-based: one person per shift type per day (global)
UNIQUE(personnelId, date, shiftType)
```

---

## Value Objects

### PersonnelId

- Wraps a string UUID
- Ensures non-empty, valid format

### DeviceId

- Wraps a string UUID
- Optional (person-kind assignments may not have a device)

### Date

- Wraps a string "YYYY-MM-DD"
- Properties: `dayOfWeek` (0=Sunday), `isWeekend`, `isSameDay(other)`, `daysUntil(other)`

### ShiftType

- Wraps a string
- Properties: `isNightShift`, `isWorking`, `isNonWorking`, `label`
- Values: day, evening, night, morning, off, leave, sick, training, backup

### TimeSlot

- Wraps startTime + endTime strings
- Properties: `overlaps(other)`, `durationHours`

---

## Domain Events

| Event                   | Trigger                | Payload                                    |
| ----------------------- | ---------------------- | ------------------------------------------ |
| `ScheduleCreated`       | `Schedule.create()`    | scheduleId, unitId, month, year            |
| `ScheduleGenerated`     | Generation complete    | scheduleId, assignmentCount, algorithm     |
| `ScheduleStatusChanged` | Status transition      | scheduleId, from, to, userId               |
| `ScheduleValidated`     | Validation complete    | scheduleId, valid, violationCount          |
| `ScheduleRolledBack`    | Rollback               | scheduleId, fromVersion, toVersion, reason |
| `AssignmentAdded`       | `addAssignment()`      | scheduleId, assignment                     |
| `AssignmentChanged`     | `updateAssignment()`   | scheduleId, assignmentId, changes          |
| `AssignmentOverridden`  | `overrideAssignment()` | scheduleId, assignmentId, reason, rules    |
| `AssignmentRemoved`     | `removeAssignment()`   | scheduleId, assignmentId                   |

---

## Repository Ports

### ScheduleRepositoryPort

```typescript
interface ScheduleRepositoryPort {
  findById(id: string): Promise<Schedule | null>;
  findByUnitMonthYear(
    unitId: string,
    month: number,
    year: number,
  ): Promise<Schedule | null>;
  findAll(filter: ScheduleFilter): Promise<Schedule[]>;
  save(schedule: Schedule, expectedVersion?: number): Promise<void>;
  delete(id: string): Promise<void>;
  count(filter?: ScheduleFilter): Promise<number>;
  findPendingApprovals(): Promise<Schedule[]>;
  getVersionSnapshot(
    scheduleId: string,
    version: number,
  ): Promise<VersionSnapshotRecord | null>;
}
```

### PersonnelRepositoryPort

```typescript
interface PersonnelRepositoryPort {
  findById(id: string): Promise<PersonnelRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<PersonnelRecord[]>;
}
```

### DeviceRepositoryPort

```typescript
interface DeviceRepositoryPort {
  findById(id: string): Promise<DeviceRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<DeviceRecord[]>;
}
```

### ShiftTemplateRepositoryPort

```typescript
interface ShiftTemplateRepositoryPort {
  findById(id: string): Promise<ShiftTemplateRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<ShiftTemplateRecord[]>;
}
```

---

## Master Data Snapshot

The `MasterDataSnapshot` provides a point-in-time view of all scheduling-relevant data:

```typescript
interface MasterDataSnapshot {
  personnel: MasterPersonnelRecord[];
  devices: MasterDeviceRecord[];
  shiftTemplates: MasterShiftTemplateRecord[];
  loadedAt: Date;
}
```

Each record type contains all fields needed for constraint validation and scoring.

---

## Validation Functions (master-data.ts)

| Function                               | Input                                       | Output     |
| -------------------------------------- | ------------------------------------------- | ---------- |
| `validatePersonnelForAssignment()`     | PersonnelRecord, date, shiftType, dayOfWeek | Conflict[] |
| `validateDeviceForAssignment()`        | DeviceRecord, date, shiftType, dayOfWeek    | Conflict[] |
| `validateShiftTemplateForAssignment()` | ShiftTemplateRecord                         | Conflict[] |
