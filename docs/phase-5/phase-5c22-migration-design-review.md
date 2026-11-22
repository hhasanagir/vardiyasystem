# Phase 5C.22 — Migration Design Review

**Review type:** READ-ONLY
**Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Verdict:** `APPROVED WITH CHANGES`
**No schema, migration, source, test, frontend, or configuration file was modified. Only this report was written.**

---

## 1. Executive Summary

Rigorously re-verified the current data model (independent of the prior report) and reviewed the proposed `PersonnelDateAvailability` migration for F-12.

**Answer to the review question:** Yes — `PersonnelDateAvailability` is the smallest, safest, architecturally correct schema foundation for F-12, **with a focused set of changes**:

1. **Uniqueness** must be `(personnelId, date)` — one authoritative row per person/date (the natural boundary). Drop `type` from the unique key.
2. **Drop `organizationId` and `unitId` columns** — personnel identity and tenancy are authoritatively owned by `Personnel`; the model is a parent-scoped line item exactly like `DeviceOffDate`/`ShiftDateOverride`/`DutyRoster`. Duplicating tenant columns violates the review mandate and the established line-item convention.
3. **`date` stays `String` `YYYY-MM-DD`** (calendar date, not timestamp) — matches every scheduling table and avoids the Prisma `DateTime`↔timezone hazard.
4. Keep the four-state enum `AVAILABLE / UNAVAILABLE / LEAVE / ABSENCE` — all four are semantically justified.
5. Keep `isActive` as the only soft-delete flag (resolved via the delete-semantics analysis); reuse of an existing date re-activates via UPDATE (unique key forbids re-insert).
6. Do **NOT** register the model in `TENANT_MODELS` — without an `organizationId` column the middleware is a no-op on it; tenancy is enforced by the existing guard/fail-closed resolver stack (same as `DeviceOffDate`).

The migration is **SAFE ADDITIVE**: one enum + one table + three indexes (one unique), zero DDL on existing tables, zero backfill, no behavior change to `offDays` or existing schedules, deployable ahead of application code.

---

## 2. Current Model Verification

All verified from the authoritative tree in this session (not inherited from the prior report):

| Claim | Verified: |
|---|---|
| `Personnel.offDays` is weekly `Int[]` | `schema.prisma:624` — weekday integers; no date context. |
| `Personnel.organizationId` optional, `unitId` required | `schema.prisma:611-612`. |
| `Personnel.employmentStatus` (may be `'leave'`) | `schema.prisma:621` — person-level flag, date-unaware. |
| `DeviceOffDate` — per-date, parent-scoped, **no org/unit column** | `schema.prisma:1445-1461`; `@@unique([deviceId, date])` at `:1458`; `isActive` soft-flag `:1450`; `reason` `:1449`; `createdById` required + relation `:1451,1456`. Closest precedent for the personnel model. |
| `ShiftDateOverride` — per-date, no org/unit column | `schema.prisma:758-772`; `@@unique([shiftId, date])` `:769`. |
| `DutyRoster` — personnel+date, no org/unit column (org FK inherits via parent) | `schema.prisma:574-602`; `@@unique([personnelId, date, shiftType])` `:596`. |
| `AttendanceRecord` — keyed by `userId`, post-hoc, `@@unique([userId, date])` | `schema.prisma:1319-1340`. |
| `Holiday` — global single date, no org/unit/person | `schema.prisma:941-950`. |
| `Unit.organizationId` optional | `schema.prisma:479`. |
| `Device.organizationId` optional (entity table DOES carry org) | `schema.prisma:694`. |
| Scheduling entity tables carry org; line-item tables do NOT | Entity: `Schedule :824`, `Assignment :895`, `Shifts :734-735`, `Device :694`. Line items: `DeviceOffDate`, `ShiftDateOverride`, `DutyRoster`, `Holiday` — none carry org/unit. **Convention is proven by the schema itself.** |
| No leave/absence/availability model in schema **or** any of the 27 on-disk migrations | Model grep on `*.prisma` = 0 matches; `migrations/` = 27 dirs (`20260519000000_v1_initial_baseline` … `20260902000003_v21_supervisor_rbac`); keyword sweep of `backend/src` for availability/leave/absence/izin/rapor data models = 0. |
| `LEAVE_CONFLICT` enum declared, never constructed | `domain/models/conflict.ts:6,105`; only these 2 occurrences in `backend/src`. |
| Frontend `leave-management` is an orphan (backend has no `/leave-requests`) | `frontend/.../leave-management.component.ts:684,706`; grep `LeaveRequest`/`leave-requests` in `backend` = 0. |

**Confirmed: no existing date-specific personnel availability model exists.**

---

## 3. Proposed Model (revised)

```prisma
enum PersonnelAvailabilityType {
  AVAILABLE    // explicit override of default-available (overrides weekly offDays for this date)
  UNAVAILABLE  // ad-hoc unavailability
  LEAVE        // formal leave (izin)
  ABSENCE      // absence (rapor / unexcused)
}

model PersonnelDateAvailability {
  id          String                    @id @default(uuid())
  personnelId String
  date        String                    // YYYY-MM-DD calendar date
  type        PersonnelAvailabilityType
  reason      String?
  isActive    Boolean                   @default(true)
  createdById String?
  createdAt   DateTime                  @default(now())
  updatedAt   DateTime                  @updatedAt

  personnel Personnel @relation(fields: [personnelId], references: [id], onDelete: Cascade)

  @@unique([personnelId, date])
  @@map("personnel_date_availability")
}
```

Removed vs. the earlier proposal: `type` in the unique key, `unitId`, `organizationId`. One row per (person, calendar date) is the single authoritative availability state.

---

## 4. Field Review

| Field | Verdict | Rationale |
|---|---|---|
| `id` (uuid PK) | **REQUIRED** | Prisma mandates an `@id`; every table follows this; enables stable PATCH/DELETE targets. |
| `personnelId` | **REQUIRED** | The domain key + authoritative tenancy root (see §6). |
| `date` | **REQUIRED** | The other domain key. `String` `YYYY-MM-DD` (see §7); must be validated with a real-calendar check in the service. |
| `type` | **REQUIRED** | The availability state (§5). |
| `reason` | **OPTIONAL** | Mirrors `DeviceOffDate.reason :1449`; parenthetical/secondary detail only, never used in eligibility decisions. |
| `isActive` | **RECOMMENDED (keep)** | Soft-flag parity with `DeviceOffDate :1450`; enables park/reactivate without data loss (see §11). Without it, hard-delete is equally workable — but the device precedent and audit expectations favor keeping it. |
| `createdById` | **OPTIONAL** | Matches `ShiftDateOverride.createdById String? :763` (shift line-item precedent treats as optional). Set by the service when a user acts; seeds/system writes may be null. |
| `createdAt` / `updatedAt` | **REQUIRED** | Project-wide convention; `@updatedAt` justification comes with the update semantics in §11. |
| `organizationId` | **REMOVED — UNNECESSARY** | `Personnel` authoritatively owns tenant identity (`personnelId → Personnel.organizationId`). No scheduling line-item table couples tenant identity (`DeviceOffDate`, `ShiftDateOverride`, `DutyRoster`, `Holiday` — none). Duplicating it "for convenience" violates the review mandate and reintroduces the stale-org-on-transfer hazard with zero enforcement benefit (see §6: the middleware cannot act without the column anyway). |
| `unitId` | **REMOVED — UNNECESSARY** | Same parent-owned argument (`personnelId → Personnel.unitId`). The scheduler derives the unit personnel set from `unitId` already (`loadPersonnel :509-526`) and scans availability by `personnelId IN … AND date` (§8). Removes the unit-transfer staleness problem completely. |
| `type` inside the unique key | **REMOVED — CHANGED** | With `(personnelId, date)` unique, overlapping type rows cannot exist; "precedence across multiple rows for the same date" degenerates into a write-time rule (see §5/§18). Deterministic by construction rather than by application resolution. |

---

## 5. Enum Review

| State | Keep? | Evidence / reasoning |
|---|---|---|
| `AVAILABLE` | **KEEP** | Cannot be fully represented by "absence of an exception": it is the explicit override of a **recurring weekly `offDays`** for a single date (review scenario B, §8 matrix). Rescuing a date from a weekly off-day without editing the global `offDays` requires a stored `AVAILABLE` row. |
| `UNAVAILABLE` | **KEEP** | Ad-hoc block with no formal approval; semantically distinct from leave and rapor. |
| `LEAVE` | **KEEP** | Formal approved leave (İzin). Domain reserves `ConflictCode.LEAVE_CONFLICT` (`conflict.ts:6,105`) and labels it 'İzin Çakışması'. |
| `ABSENCE` | **KEEP** | Rapor/unexcused. Distinct: `ShiftType.sick` = 'Raporlu' in exports (`schedules-export.service.ts:214`), `ShiftType.leave` = 'İzin'; `NON_WORKING_TYPES` distinguishes them (`shift-type.value-object.ts:7`). Collapsing would destroy the İzin-vs-Rapor distinction used by reporting/insights/export. |

**Collapse check:** `UNAVAILABLE`+`LEAVE`+`ABSENCE` all resolve to "NOT AVAILABLE", but the *reason* is domain-meaningful (conflict codes, reports, exports). "Would collapsing states lose domain meaning?" — yes. Keep all four. `AVAILABLE` is justified only because weekly `offDays` is an active constraint today and must remain overridable per-date.

---

## 6. Tenant / RBAC Integration

### Verified mechanisms
- `tenant.middleware.ts` (`infrastructure/prisma/middleware/tenant.middleware.ts`): injects `organizationId` into `create`/`where` **only for models in `TENANT_MODELS` (`:6-10`) that own a direct `organizationId` column** (`ORG_COLUMN_MODELS`, `:29-49`).
- `UnitScopeService` (`rbac/services/unit-scope.service.ts`): `canAccessUnit` **fails closed on NULL/undefined org** (`:120-121`) with the only exception the explicit platform system-admin (`isExplicitGlobalSystemAdmin :87-93`); FIELD_SUPERVISOR is strictly single-unit (`:43-46,53-55,158-160`); SUPERVISOR and above are org-scoped (`:128-130`); `resolveReadScope` yields `{ unitId, organizationId, denyAll }` for list confinement (`:155-173`).
- `resolveTargetUnitId`/`resolveTargetScope` (`:181-237`) resolve an entity's unit/org by id before mutation — the standard write-scope pattern.
- Scheduling controllers are protected by `ScheduleAccessGuard` (verified precedent; both schedule controllers).

### Exact integration requirements (do-not-implement list)
1. **Do NOT register `PersonnelDateAvailability` in `TENANT_MODELS`.** The model has no `organizationId` column, so middleware membership is a functional no-op (`tenant.middleware.ts:60-63`). Registering it would imply false safety.
2. Tenancy is therefore **parent-owned**: row → `personnelId` → `Personnel.unitId` (+ `.organizationId`), identical to `DeviceOffDate`/`ShiftDateOverride`/`DutyRoster`.
3. All reads/writes flow through endpoints covered by `ScheduleAccessGuard`; write endpoints additionally resolve the target personnel's unit/org via `resolveTargetUnitId`/`resolveTargetScope` and gate with `canAccessUnit` (FIELD_SUPERVISOR ⇒ `targetUnitId === strictUnitId`; SUPERVISOR ⇒ same-org; NULL-org ⇒ deny except explicit global system-admin).
4. The eligibility service takes an already-resolved `(personnelId, organizationId, unitId?)` and **fails closed**: if `organizationId` is null/unresolvable it returns NOT AVAILABLE (or throws), never default-open — mirroring `canAccessUnit :120-121`.
5. System-admin carve-out is inherited unchanged from `canAccessUnit` — no new logic in this domain.

No new roles, no new scope service, no new guard. **Nothing is weakened by the model's existence.**

---

## 7. Date Semantics

- **Calendar date, not timestamp.** Representation: `String 'YYYY-MM-DD'` — the established convention in every scheduling table (`Assignment.date :900`, `ShiftDateOverride.date :761`, `DutyRoster.date :580`, `Holiday.date :943`, `DeviceOffDate.date :1448`). Range scans already use string `gte/lte` (`schedule-auto-generator.service.ts:105-112,544-554,588-599`).
- **Prisma `DateTime` rejected** for this field: maps to `timestamptz`; `new Date('YYYY-MM-DD')` parses as UTC midnight; `.getDay()` then evaluates in the deployment-local timezone — the engine's existing `new Date(dateStr).getDay()` at `schedule-auto-generator.service.ts:201,622` and `greedy-strategy.ts:408-409` **shifts the weekday by one day in negative-offset timezones** (not Istanbul/UTC+3, but harmful in general). Forcing a *stored* `DateTime` would invite the same class of bug at the storage boundary.
- **Weekday derivation rule (contract):** compute from components, `new Date(Date.UTC(y, m-1, d)).getUTCDay()`, never `new Date('YYYY-MM-DD').getDay()`. The effective-month day count must come from `new Date(year, month, 0).getDate()` on the **scheduled** month — the correct pattern already at `schedule-auto-generator.service.ts:152`. **Never hardcode 28/30/31.** This directly prevents the F-15 pattern (`:666` uses the constant `new Date(options.year||2026, options.month||1, 0)` → always Feb 2026 = 28).
- Month boundaries, leap years (e.g., `2024-02-29`) and string-range scans are handled correctly by component-based validation and real-calendar day count; a per-date row model has no range-exclusion edge cases.
- Turkish local calendar: dates are stored/compared as naive strings in the hospital's own calendar; no UTC/local conversion at rest. Existing export/insight flows already follow this convention.

---

## 8. offDays Precedence (deterministic matrix)

Resolution order for `(personnelId, date)` — exactly one active row can exist (unique key), then weekly `offDays` applies as base rule, and the per-date row **overrides** it.

| # | Scenario | Weekly `offDays` matches? | Active row | Result |
|---|---|---|---|---|
| A | Sunday off, no record | yes (Sunday) | none | **NOT AVAILABLE** (weekly) |
| B | Sunday off + explicit AVAILABLE | yes | `AVAILABLE` | **AVAILABLE** — explicit override wins |
| C | Sunday off + LEAVE | yes | `LEAVE` | **NOT AVAILABLE** (LEAVE) |
| D | Sunday off + ABSENCE | yes | `ABSENCE` | **NOT AVAILABLE** (ABSENCE) |
| E | Monday working, no record | no | none | **AVAILABLE** |
| F | Monday working + UNAVAILABLE | no | `UNAVAILABLE` | **NOT AVAILABLE** (UNAVAILABLE) |
| G | Monday working + LEAVE | no | `LEAVE` | **NOT AVAILABLE** (LEAVE) |
| H | Monday working + ABSENCE | no | `ABSENCE` | **NOT AVAILABLE** (ABSENCE) |
| I | Monday working + AVAILABLE | no | `AVAILABLE` | **AVAILABLE** (explicit; redundant, valid) |

**Collapsed rule:** Any active row wins over the weekly base; a blocking type blocks regardless of `offDays`; `AVAILABLE` overrides an `offDays` match; no record ⇒ weekly base applies (empty table ≡ today's behavior). Deterministic and total; a single row per date makes intra-date precedence impossible.

**Write-path rule (protects fail-safe):** creating a **new** `AVAILABLE` row for a date that already has an **active** blocking row (LEAVE/ABSENCE/UNAVAILABLE) is **rejected (409)** — an operator must consciously UPDATE/replace the blocking row. This prevents an accidental availability row from silently un-blocking an approved leave. Blocking→blocking or blocking→(update with explicit type change) are normal UPDATEs.

---

## 9. Scheduler Query Analysis

Target: `ScheduleAutoGeneratorService` (`schedule-auto-generator.service.ts`).

- Snapshot load (in the existing initial `Promise.all` at `:99-103`):
  `prisma.personnelDateAvailability.findMany({ where: { personnelId: { in: unitPersonnelIds }, date: { gte: '<year>-<month>-01', lte: '<year>-<month>-<realDaysInMonth>' }, isActive: true } })`.
- In-memory structure identical to the existing `deviceOffSet` (`:115, :212`): a `Map<personnelId, Record<date, PersonnelAvailabilityType>>` (blocking types only) — mirrored into `findAvailablePersonnel` (`:608-672`) as one early reject `if (blocking.has(p.id) && blocking[p.id][dateStr]) return false;`, placed before the skill check (`:631`), after the `offDays` check (`:627`).
- **Index support:** the `@@unique([personnelId, date])` index serves the `IN + range` scan directly (leftmost prefix = `personnelId`). A bare `(date)` index is added **only if** product later needs org-wide/month-wide availability views; not required by any current query pattern → **no premature indexing**.
- Per-row lookups in the eligibility resolver use the same unique key (point reads).

---

## 10. Migration Impact

- Existing `Personnel` rows: untouched. **No backfill** — zero rows = today's behavior (weekly `offDays` base).
- Existing schedules/assignments: unaffected (no DDL on `schedules`/`assignments`).
- `offDays` behavior: unchanged until 5C.23 consumer code makes it the *base* rule under the precedence matrix.
- Additive by construction: new enum + new table + new indexes only.
- Safe to deploy ahead of application code: the table is inert until a consumer references it.
- Classified: **SAFE ADDITIVE** (no data-affecting change, no backfill). Deployment coordination: not required; rollback = `DROP TABLE` + `DROP TYPE`.

---

## 11. Delete / Update Semantics

- **Update:** yes — `(personnelId, date)` unique makes overwrite an UPDATE (type/reason/isActive). This is the natural "overwrite" path.
- **Delete / soft delete:** keep `isActive`; deactivation = `UPDATE isActive=false`. Because of the unique key, re-adding the same date **after a soft delete cannot be an INSERT** — it must re-activate via `UPDATE isActive=true`. This is exactly how `DeviceOffDate` behaves today and is the correct, determined semantic. (Hard-delete is an acceptable leaner variant if product prefers; both are one-column decisions — flagged below.)
- **History:** none at row level; do NOT add an event/audit table. Existing architecture already provides `AuditLog`, `ScheduleSnapshot` (schedule versions), and `Assignment.overriddenBy/At` for mutational provenance. Requirement: all availability mutations pass the existing audit-log module.
- No event sourcing introduced (nothing in the repo's availability domain requires it).

---

## 12. Retention

Historical availability rows have **no current domain consumer** (no reporting/accrual pipeline exists). Do not introduce automatic deletion/retention.

**Status: OPEN PRODUCT DECISION.** Until a product requirement defines retention, rows persist until manually deactivated/deleted; no TTL, no job, no archive.

---

## 13. Concurrency

- Current scheduling semantics: `generate()` takes a **single coherent snapshot** at start (`Promise.all`, `:99-103`) — personnel/devices/holidays/device-off read once; mid-generation edits are not visible; no locking exists; schedule mutation consistency comes only from the optimistic `version` bump on apply (`:494-504`) + published-mutation gate.
- Availability reads join the **same snapshot** — identical coherence contract, no change needed.
- Availability **writes** are single-row `upsert`-style; the unique `(personnelId, date)` is the atomicity backstop; last-writer-wins per person/date. No row/tx locks.
- **No new transaction or lock architecture is required.** A cross-machine generation/write consistency overhaul is out of scope (5C.21 F-08/F-18) and must stay out.

---

## 14. Security Impact

| Risk | Assessment |
|---|---|
| Cross-tenant | None new — parent-scoped (`personnelId → Personnel.organizationId`); all row access flows through `ScheduleAccessGuard` + `canAccessUnit` (same-org, fail-closed `:120-121`). |
| Cross-unit | None new — FIELD_SUPERVISOR write path validates `targetUnitId === strictUnitId` (`unit-scope.service.ts:158-160`) via `resolveTargetUnitId`; list reads constrained by `resolveReadScope` (`denyAll` for unassigned field supervisors, `:168-170`). |
| Privilege escalation | None — no new roles/permissions; AVAILABLE-override write rule (409) prevents accidental un-blocking of LEAVE/ABSENCE by a lesser-privileged user. |
| Data enumeration | Bounded — availability rows are only reachable via the personnel/schedule/unit the caller is already authorized for; the model adds no global listing surface on its own. |
| Audit gap | Closed by routing mutations through the existing audit-log module (§11). Resolver must never log availability content (PII-ish) into unredacted logs. |

All existing fail-closed guarantees remain; the model adds **no** new risk surface.

---

## 15. Future Optimizer Compatibility

Verified contracts: the optimizer never touches Prisma. Domain input comes from `SchedulingProblemPersonnel` (`domain/optimization/scheduling-problem.ts:4-15`, carries `offDays`), populated by `PersonnelRepositoryPort.findById/findMany` → `PersonnelRecord` (`domain/repositories/schedule-repository.port.ts:33-52`, carries `offDays`), and consumed in `greedy-strategy.findAvailable` (`:395-413`, weekly `offDays` reject at `:413`).

**Correct slot for availability:** extend `PersonnelRecord`/`SchedulingProblemPersonnel` with `unavailableDates: string[]` (or a `Record<date, type>`) **resolved by the application-level availability resolver BEFORE the problem is built** (same place `offDays` is copied today). The greedy/local-search eligibility filter adds the same one-line reject pattern used for `offDays`.

Architecture confirmed as desired:

```
Persistence (personnel_date_availability)
  → Application: PersonnelAvailabilityResolver  (no domain import, no Prisma in domain)
  → Domain input: SchedulingProblemPersonnel.{offDays, unavailableDates}
  → Greedy/LocalSearch eligibility filter
```

`PersonnelDateAvailability` is a **clean input** and does not couple the optimizer to Prisma.

---

## 16. Migration Design (conceptual — NOT created)

```sql
CREATE TYPE "PersonnelAvailabilityType" AS ENUM ('AVAILABLE','UNAVAILABLE','LEAVE','ABSENCE');

CREATE TABLE "personnel_date_availability" (
  "id"          TEXT NOT NULL,
  "personnelId" TEXT NOT NULL,
  "date"        TEXT NOT NULL,                       -- YYYY-MM-DD
  "type"        "PersonnelAvailabilityType" NOT NULL,
  "reason"      TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personnel_date_availability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personnel_date_availability_personnelId_date_key"
  ON "personnel_date_availability" ("personnelId", "date");

ALTER TABLE "personnel_date_availability"
  ADD CONSTRAINT "personnel_date_availability_personnelId_fkey"
  FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- **Columns/types/nullability/defaults:** as above. `id` TEXT (uuid), `date` TEXT (naive calendar), `type` enum NOT NULL, `reason`/`createdById` nullable, `isActive` default true, timestamps with `CURRENT_TIMESTAMP` defaults.
- **PK:** `id`.
- **Unique:** `(personnelId, date)`.
- **Indexes:** the unique key only (per §9). Optional `(date)` index deferred to a product view that needs it.
- **FK + ON DELETE:** `personnelId → personnel(id)` `ON DELETE CASCADE` (row dies with the person; personnel deletion is a terminal action), `ON UPDATE CASCADE`. No FK to unit/org (parent-owned). `createdById` bare `TEXT` (no FK, matching the `ShiftDateOverride` line-item precedent; optional relation may be added in 5C.23 — one-line choice, not schema-critical).
- Prisma generates the enum as a Postgres type; rollback = `DROP TABLE` + `DROP TYPE`.

---

## 17. Alternatives

Scoring 1 (poor) … 5 (excellent).

| Option | Domain correctness | Scheduler usability | Data integrity | Tenant safety | Optimizer compat | Migration complexity | Total |
|---|---|---|---|---|---|---|---|
| **A. `PersonnelDateAvailability`** | 5 | 5 | 4 | 5 | 5 | 5 (1 enum + 1 table) | **29** |
| B. Extend `Personnel.offDays` | 1 (weekly ints; no dates) | 1 | 1 | 4 | 1 | 3 (column change, wrong semantics) | 11 |
| C. `ShiftDateOverride` | 2 (shift, not person) | 2 | 2 | 4 | 2 | 3 (new FK shape) | 15 |
| D. `DutyRoster` | 1 (inverted: commitment not restriction) | 1 | 2 | 4 | 1 | 3 (semantic misuse) | 12 |
| E. `AttendanceRecord` | 1 (post-hoc output, `userId`-keyed) | 1 | 2 | 4 | 1 | 3 | 12 |
| F. Separate `Leave` + `Availability` models | 4 | 4 | 3 | 4 | 4 | 4 (two tables + join/precedence) | 23 |

A wins: single-date-row domain model, direct mirror of the proven `DeviceOffDate` pattern, tenant-safe by parent-scoping, clean optimizer input, and minimal migration. F is over-modeled (no consumer needs the extra split; it reintroduces precedence/join cost).

---

## 18. Final Verdict

**`APPROVED WITH CHANGES`**

Required changes vs. the prior proposal (each evidenced above):

1. Uniqueness: `@@unique([personnelId, date])` — one row per person/date; drop `type` from the key (§4, §8).
2. Remove `organizationId` and `unitId` columns — parent-owned tenancy via the `Personnel` FK, matching every scheduling line-item table (§4, §6). Do **not** register in `TENANT_MODELS`.
3. `date` as `String 'YYYY-MM-DD'`; weekday must be computed UTC-safe; never hardcoded day counts (§7, F-15 prevention).
4. Keep all four enum values (§5). Add the AVAILABLE-override write rule: 409 when creating an `AVAILABLE` row over an active blocking row (§8).
5. Keep `isActive` soft-flag with reactivation-by-UPDATE semantics (§11); hard-delete is the documented leaner alternative — make this one call at implementation.
6. Enforce tenancy ONLY via `ScheduleAccessGuard` + `UnitScopeService` (+ fail-closed resolver), with the explicit global-system-admin carve-out inherited from `canAccessUnit` (§6).

Rejected alternatives are documented in §17; no replacement design needed.

---

## 19. Phase 5C.23 Implementation Contract (if approved — NOT implemented)

1. **Schema changes** — add `PersonnelAvailabilityType` enum + `PersonnelDateAvailability` model to `backend/prisma/schema.prisma` exactly per §3/§16.
2. **Migration** — `cd backend`; `npx prisma migrate dev --name add_personnel_date_availability --create-only`; review the generated SQL (expected: §16); then `npx prisma migrate dev` and `npx prisma generate`. Do not alter any existing migration.
3. **TENANT_MODELS** — no change (documented no-op; do not register).
4. **Eligibility service** — new `backend/src/modules/schedules/services/personnel-eligibility.service.ts`:
   - `isPersonnelAvailableForDate(personnelId, date, organizationId, unitId?): Promise<{ available: boolean; blocking: 'LEAVE'|'ABSENCE'|'UNAVAILABLE'|null }>`
   - source: `Personnel.offDays` base + active `PersonnelDateAvailability` row, precedence per §8; fail-closed on unresolved/null org; reuses `UnitScopeService`.
5. **Scheduler integration** — load availability in the `Promise.all` snapshot (`schedule-auto-generator.service.ts:99-103`); build `Map<personnelId, Record<date,type>>`; reject in `findAvailablePersonnel` (`:608-672`) before the skill check; mirror into collision validation (`schedules.service.ts:998-1001,1331-1339`) and DDD `validatePersonnelForAssignment` via `ConflictCode.LEAVE_CONFLICT`/`AVAILABILITY_CONFLICT`. No generator swap, no optimizer migration, no BullMQ, no frontend.
6. **API requirements** — guarded CRUD behind `ScheduleAccessGuard` (schedules module):
   - `GET /personnel-availability?unitId&date` (list scoped via `resolveReadScope`)
   - `POST /personnel-availability` (upsert; **409** on `AVAILABLE` over active blocking row)
   - `PATCH /personnel-availability/:id` (type/reason/isActive; UPDATE semantics §11)
   - `DELETE /personnel-availability/:id` (soft delete via `isActive=false`)
   Audit every mutation via the existing audit-log module.
7. **Authorization** — reuse `ScheduleAccessGuard` + `UnitScopeService` only; no new roles. FIELD_SUPERVISOR: verify `resolveTargetUnitId('personnel', id) === strictUnitId`; SUPERVISOR: same-org via `canAccessUnit`; NULL-org: deny except explicit global system-admin.
8. **Tests** — new `backend/src/modules/schedules/__tests__/5c22-availability-eligibility.spec.ts`, non-vacuous, no weakening/skips:
   1. No record ⇒ available (weekly base).
   2. `UNAVAILABLE` ⇒ not assignable.
   3. `LEAVE` ⇒ prevented.
   4. `ABSENCE` ⇒ prevented.
   5. Date boundary (`2026-03-15` blocks only that date).
   6. Month boundary (`2026-02-28` vs `2026-03-01`).
   7. Leap year `2024-02-29` weekday correctness.
   8. Duplicate insert for same `(personnelId, date)` violates unique / blocked; AVAILABLE-over-blocking insert ⇒ 409 (replaces the old multi-row test).
   9. Precedence matrix §8 red/green for rows A–I (deterministic, repeat runs identical).
   10. Resolver with NULL/undefined `organizationId` fails closed.
   11. FIELD_SUPERVISOR single-unit confined (create/read).
   12. SUPERVISOR org-scoped (multi-unit).
   13. Cross-tenant row cannot influence scheduling.
   14. Empty availability table ⇒ byte-identical behavior to today (weekly-only regression).
   15. Generator regression: `ScheduleAutoGeneratorService.generate` never emits an assignment to a person with an active blocking row on that date (mirrors `deviceOffSet` test style); plus a UTC weekday-boundary case reproducing the §7 timezone hazard.
9. **Regression tests** — 5C.17/5C.18/5C.20 suites (organization isolation, NULL-org fail-closed, FIELD_SUPERVISOR, SUPERVISOR org scope, system-admin carve-out, schedule mutation auth); existing scheduling suites; FE untouched (no FE changes this phase).
10. **Validation commands** — record counts exactly:
    - `npx tsc --noEmit` (backend)
    - `npm run build` (backend `nest build`)
    - `npx vitest run --pool=threads --no-file-parallelism backend/src/modules/schedules/__tests__/5c22-availability-eligibility.spec.ts backend/src/modules/schedules/__tests__/5c17-*.spec.ts backend/src/modules/schedules/__tests__/5c18-*.spec.ts backend/src/modules/schedules/__tests__/5c20-*.spec.ts` (focused + regressions)
    - Expect the known environment-only `device-off` DB failures (`Can't reach database server at localhost:5432`) to remain — do not alter or claim fixed.

**This contract is not executed in this phase.** Wait for explicit approval.

STOP.