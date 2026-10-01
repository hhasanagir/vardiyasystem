# Device Shift Visibility Fix

**Date:** 2026-08-24
**Status:** COMPLETE — All Verification Gates Passed

---

## Root Cause

The DDD Schedule aggregate was serialized directly to the API response, exposing internal domain structure (`_id`, `props`, `_domainEvents`, etc.) instead of the flat DTO contract expected by the frontend. Additionally, the legacy `/schedules/unit/:unit` endpoint's assignment mapping omitted the `deviceCode` field, causing device filtering to fall back to opaque UUIDs.

Two separate issues were identified and fixed:

1. **DDD endpoint (`/schedules-ddd`)**: `SchedulesDDDController` returned raw `Schedule` aggregate instances. NestJS `JSON.stringify` serialized all enumerable own properties: `_id`, `props`, `_createdAt`, `_updatedAt`, `_version`, `_domainEvents`. Prototype getters (`unitId`, `status`, etc.) were NOT serialized. The frontend expected `{ id, unitId, month, ... }` but received `{ _id, props: { assignments } }`.

2. **Legacy endpoint (`/schedules`)**: `SchedulesService.findByUnitType()` correctly enriched `personnelName` via `a.personnel?.name` but did NOT include `deviceCode` from `a.device?.code`. The frontend's `ScheduleStore` uses `a.deviceCode ?? a.deviceId` for display, falling back to UUIDs when `deviceCode` is absent.

3. **Domain `Assignment.toSnapshot()`**: Produced a raw snapshot missing `id`, `personnelName`, and `deviceCode`. The DDD persistence layer used this for DB writes (correct), but the API layer also returned it to the client (incorrect).

---

## Before

### DDD endpoint response (broken)

```json
{
  "_id": "uuid-123",
  "_createdAt": "2026-08-24T...",
  "_version": 1,
  "props": {
    "assignments": [
      {
        "personnelId": "p-1",
        "deviceId": "d-1",
        "date": "2026-08-15",
        "shiftType": "day",
        "startTime": "08:00",
        "endTime": "20:00"
      }
    ]
  }
}
```

### Legacy endpoint assignment (missing deviceCode)

```json
{
  "id": "sched-1",
  "assignments": [
    {
      "id": "assign-1",
      "personnelId": "p-1",
      "personnelName": "Dr. Ayşe Yılmaz",
      "deviceId": "d-1",
      "date": "2026-08-15"
    }
  ]
}
```

---

## After

### DDD endpoint response (fixed)

```json
{
  "id": "sched-1",
  "unitId": "unit-radioloji",
  "month": 8,
  "year": 2026,
  "status": "draft",
  "version": 1,
  "createdById": "user-1",
  "publishedAt": null,
  "assignments": [
    {
      "id": "assign-1",
      "scheduleId": "sched-1",
      "personnelId": "p-1",
      "personnelName": "Dr. Ayşe Yılmaz",
      "deviceId": "d-1",
      "deviceCode": "BT-01",
      "unitId": "unit-radioloji",
      "kind": "device",
      "source": "manual",
      "date": "2026-08-15",
      "shiftType": "day",
      "startTime": "08:00",
      "endTime": "20:00",
      "personnelType": "technician",
      "isConfirmed": false,
      "overrideReason": null,
      "overriddenBy": null,
      "overriddenAt": null
    }
  ],
  "approvalData": null
}
```

### Legacy endpoint assignment (fixed)

```json
{
  "id": "sched-1",
  "assignments": [
    {
      "id": "assign-1",
      "personnelId": "p-1",
      "personnelName": "Dr. Ayşe Yılmaz",
      "deviceId": "d-1",
      "deviceCode": "BT-01"
    }
  ]
}
```

---

## API Contract

### `ScheduleResponseDto` (DDD endpoint)

| Field          | Type                      | Source                                |
| -------------- | ------------------------- | ------------------------------------- |
| `id`           | `string`                  | `Schedule.id` (aggregate getter)      |
| `unitId`       | `string`                  | `Schedule.unitId`                     |
| `month`        | `number`                  | `Schedule.month`                      |
| `year`         | `number`                  | `Schedule.year`                       |
| `status`       | `string`                  | `Schedule.status`                     |
| `version`      | `number`                  | `Schedule.scheduleVersion`            |
| `createdById`  | `string \| null`          | `Schedule.createdById`                |
| `publishedAt`  | `string \| null`          | `Schedule.publishedAt?.toISOString()` |
| `assignments`  | `AssignmentResponseDto[]` | Enriched from Prisma                  |
| `approvalData` | `object \| null`          | `Schedule.approvalData`               |

### `AssignmentResponseDto`

| Field              | Type                   | Source                        |
| ------------------ | ---------------------- | ----------------------------- |
| `id`               | `string`               | `assignment.id` (DB)          |
| `scheduleId`       | `string`               | `assignment.scheduleId`       |
| `personnelId`      | `string`               | `assignment.personnelId`      |
| `personnelName`    | `string`               | `personnel.name` (JOIN)       |
| `deviceId`         | `string \| null`       | `assignment.deviceId`         |
| `deviceCode`       | `string \| null`       | `device.code` (JOIN)          |
| `unitId`           | `string \| null`       | `assignment.unitId`           |
| `personnelGroupId` | `string \| null`       | `assignment.personnelGroupId` |
| `shiftTemplateId`  | `string \| null`       | `assignment.shiftTemplateId`  |
| `kind`             | `'device' \| 'person'` | `assignment.kind`             |
| `source`           | `string`               | `assignment.source`           |
| `date`             | `string`               | `assignment.date`             |
| `shiftType`        | `string`               | `assignment.shiftType`        |
| `startTime`        | `string`               | `assignment.startTime`        |
| `endTime`          | `string`               | `assignment.endTime`          |
| `personnelType`    | `string`               | `assignment.personnelType`    |
| `isConfirmed`      | `boolean`              | `assignment.isConfirmed`      |
| `overrideReason`   | `string \| null`       | `assignment.overrideReason`   |
| `overriddenBy`     | `string \| null`       | `assignment.overriddenBy`     |
| `overriddenAt`     | `string \| null`       | `assignment.overriddenAt`     |

---

## Backend Changes

### 1. New file: `dto/schedule-response.dto.ts`

Created `ScheduleResponseDto`, `AssignmentResponseDto`, and `EnrichedAssignment` interfaces. Created `toScheduleResponseDto()` and `toScheduleListResponseDto()` mapper functions that convert DDD aggregates to flat DTOs.

Architecture:

```
Schedule Aggregate → toSnapshot() + getters → toScheduleResponseDto(schedule, enrichedAssignments) → ScheduleResponseDto
```

The domain aggregate is NOT exposed to the API. The mapper reads aggregate properties via public getters (`id`, `unitId`, `month`, `year`, etc.) and combines them with Prisma-enriched assignment data (including `personnel.name` and `device.code` JOINs).

### 2. Modified: `schedules-ddd.controller.ts`

- Added `enrichAssignments(scheduleId)` private method that queries Prisma with `include: { personnel: { select: { name, role } }, device: { select: { code } } }`.
- Added `toDto(schedule)` and `toDtoList(schedules)` private methods that map aggregates to DTOs.
- ALL schedule-returning endpoints now use the mapper: `create`, `list`, `getOne`, `addAssignment`, `overrideAssignment`, `updateAssignment`, `removeAssignment`, `submitForReview`, `approve`, `reject`, `publish`, `archive`, `revertToDraft`, `rollback`.
- Batch enrichment for list endpoint: single Prisma query with `scheduleId: { in: ids }`, grouped into a Map.

### 3. Modified: `schedules.service.ts` (legacy endpoint)

Added `deviceCode: a.device?.code || null` to the assignment mapping in `findByUnitType()` for both `assignments` (device-kind) and `personAssignments` (person-kind).

### N+1 Prevention

The DDD controller uses a single Prisma query per endpoint:

- Single schedule: `assignment.findMany({ where: { scheduleId } })`
- List: `assignment.findMany({ where: { scheduleId: { in: ids } })` (batch)

No N+1 queries introduced. The enrichment query is separate from the aggregate reconstitution but results in 2 queries total per endpoint (1 for aggregate + 1 for enriched assignments).

---

## Frontend Changes

### Modified: `domain/models/scheduling.ts`

Added `deviceCode?: string` field to the `ShiftAssignment` interface (line 46). This matches the `AssignmentDTO` interface in `features/scheduling/models/schedule.models.ts` which already declared `deviceCode?: string | null`.

No component changes required — all device view components already use `a.deviceCode ?? a.deviceId` fallback pattern:

- `device-view.component.ts:74`: `deviceCode: a.deviceCode ?? a.deviceId`
- `schedule.store.ts:143`: `(a.deviceCode ?? '').toLowerCase().includes(term)`
- `schedule.store.ts:164`: `{ id: a.deviceId, code: a.deviceCode ?? a.deviceId }`

---

## Data Integrity

- **No new schedules created.** No existing schedules modified.
- **No new assignments created.** No existing assignments modified.
- **No database migration required.** No schema changes.
- **No Prisma model changes.** All fields already existed in the `Assignment`, `Personnel`, and `Device` models.
- The fix is purely at the serialization/mapping layer.

---

## Tests

### New: `dto/__tests__/device-shift-visibility.spec.ts` — 14 tests

| #   | Test                                                   | Type       |
| --- | ------------------------------------------------------ | ---------- |
| 1   | Schedule response contains `id` (flat, not `_id`)      | Structural |
| 2   | Schedule response contains `assignments` array         | Structural |
| 3   | Assignment contains `deviceId`                         | Behavioral |
| 4   | Assignment contains `personnelId`                      | Behavioral |
| 5   | Device code is returned when available                 | Behavioral |
| 6   | Device code is null when device is null                | Behavioral |
| 7   | Personnel name is returned when available              | Behavioral |
| 8   | Device A shows only Device A assignments               | Filtering  |
| 9   | Device B shows only Device B assignments               | Filtering  |
| 10  | Schedule response has no `_id` or `props` properties   | Structural |
| 11  | `toScheduleListResponseDto` maps multiple schedules    | Structural |
| 12  | Schedule DTO contains correct month/year/status        | Contract   |
| 13  | Assignment DTO preserves shiftType, startTime, endTime | Contract   |
| 14  | Schedule DTO returns null assignments as empty array   | Edge case  |

All 14 tests instantiate real DDD `Schedule` aggregates via `Schedule.create()` and exercise the actual `toScheduleResponseDto()` mapper with enriched assignment data.

---

## Regression

| Test Suite                          | Tests     | Status   |
| ----------------------------------- | --------- | -------- |
| **device-shift-visibility.spec.ts** | **14/14** | **PASS** |
| security-closure-4.1.spec.ts        | 38/38     | PASS     |
| security-invariants.spec.ts         | 12/12     | PASS     |
| **Total**                           | **64/64** | **PASS** |

Zero regressions. All Phase 4.1 security tests remain green.

---

## Build

| Gate             | Command                          | Result               |
| ---------------- | -------------------------------- | -------------------- |
| TypeScript check | `npx tsc --noEmit`               | **Clean — 0 errors** |
| TypeScript build | `npx tsc -p tsconfig.build.json` | **BUILD SUCCEEDED**  |

---

## Remaining Risks

1. **DDD controller mutation endpoints add 1 query per call**: `addAssignment`, `updateAssignment`, `removeAssignment`, etc. each execute an extra `assignment.findMany` for enrichment after the aggregate mutation. For high-throughput scenarios, this could be optimized by using the in-memory aggregate snapshot and enriching only the changed assignments. Current load does not warrant this optimization.

2. **Legacy `/schedules/unit/:unit` endpoint still uses Prisma directly**: It does not go through the DDD aggregate. Both endpoints now return the same contract shape. Future consolidation should retire the legacy endpoint in favor of the DDD one.

3. **`deviceCode` is optional (`string | null`)**: When a device is deleted or `deviceId` is null, `deviceCode` will be `null`. Frontend fallback `a.deviceCode ?? a.deviceId` handles this correctly.
