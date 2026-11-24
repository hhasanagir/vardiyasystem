# Phase 5C.22 — Availability & Leave Domain Foundation

**Status:** BLOCKED — MIGRATION REQUIRED
**Authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Phase mode:** Read-only discovery + design gate. **No source code, schema, migration, test, or frontend file was modified.** Only this report was written.

---

## 1. Executive Summary

Phase 5C.22 targets F-12 (per-date leave/availability modeling) from the 5C.21 audit.

Read-only discovery across the authoritative repository reached the **design gate** (phase Step 2) and determined:

> The existing Prisma schema **cannot** represent `PERSON × DATE × AVAILABILITY` without a schema change. Adding the minimum required domain model **requires a Prisma migration**.

Per the phase rules:

- Step 2 → "If a Prisma migration is technically required: **STOP BEFORE IMPLEMENTING**."
- Step 11 → "NO migration unless technically unavoidable… **Do not create migration files. Report the exact required migration and wait for approval.**"

Therefore **no implementation was performed**. This report documents the exact schema deficiency, the proposed minimal model, the migration impact, and the deferred 5C.23 implementation plan.

**Final verdict: `BLOCKED — MIGRATION REQUIRED`**

---

## 2. F-12 Root Cause

F-12 states: *no adequate per-date leave/availability modeling for authoritative scheduling.*

Verified root cause in the authoritative tree:

| Evidence | Location | Behavior |
|---|---|---|
| `Personnel.offDays` is `Int[]` of weekday numbers | `backend/prisma/schema.prisma:624` | Weekly pattern only (0–6 via `Date.getDay()`). Cannot express a specific date, a date range, or the leave-vs-absence distinction. |
| No `Leave` / `Absence` / `Availability` / personnel-date model | entire `schema.prisma` (2992 lines) + all 27 `migrations/*/migration.sql` | Grep for `model (Leave\|Absence\|Availability\|...)` = **0 matches**; keyword sweep `availability\|leave\|absence\|izin\|rapor` in `backend/src` = **0 data models** (only shift-type labels, export labels, and a never-constructed enum). |
| No date-range columns in scheduling/personnel domain | `schema.prisma` `startDate\|endDate\|validFrom\|validUntil` = 13 matches, **all** in unrelated enterprise modules (Consent, Maintenance, Procurement) | No reusable date-range abstraction for personnel scheduling. |
| `ConflictCode.LEAVE_CONFLICT` declared, **never constructed** | `domain/models/conflict.ts:6` (enum), `conflict.ts:105` (label) — grep `LEAVE_CONFLICT` = only these 2 declarations | The domain "reserves" a leave-conflict code but no data source feeds it today. |
| `ShiftType` values `leave` / `sick` | `domain/value-objects/shift-type.value-object.ts:3,45-46`; `NON_WORKING_TYPES` includes them | These are **assignment output labels** (a slot marked leave/sick), not availability *input* state. |
| `Personnel.employmentStatus` string may be `'leave'` | `schema.prisma:621`; `loadPersonnel` filter at `schedule-auto-generator.service.ts:525` | Coarse person-level flag, date-unaware. |
| Frontend `LeaveManagementComponent` calls `GET/PUT /leave-requests` | `frontend/src/app/components/leave-management/leave-management.component.ts:684,706` | Backend **has no `/leave-requests` endpoint or module** (grep `leave-requests\|LeaveRequest` in `backend` = 0). The frontend leave screen is an orphan — no backend data source exists for it. |

**Conclusion:** the only availability signal the backend can act on is the weekly `offDays` array. Per-date leave/absence/unavailability cannot be stored, queried, or enforced anywhere.

---

## 3. Existing Domain Analysis

### 3.1 Models that could plausibly represent "person is not available on date X"

| Candidate | Location | Verdict — why it is NOT reusable |
|---|---|---|
| `Personnel.offDays Int[]` | `schema.prisma:624` | Weekday indices only; no dates. F-12 root cause. |
| `DutyRoster` | `schema.prisma:574-602` | Represents a *planned duty commitment* (person **must** work date+shift, unique `[personnelId,date,shiftType]`, requires `role`, `startTime`, `endTime`). Inverting it into "unavailable" corrupts its meaning for swap/export/insight consumers. Rejection reason: semantic inversion — not conservative reuse. |
| `AttendanceRecord` | `schema.prisma:1319-1340` | Post-hoc actual-work record keyed by **`userId` (login user, not Personnel)**, linked to an `Assignment`, `status default 'pending'`. It is an output/audit artifact, not a forward-looking input; requires an existing assignment; no availability semantics. |
| `ShiftDateOverride` | `schema.prisma:758-772` | Shift-calendar enable/disable (`shiftId+date`), **not** personnel-scoped. |
| `Holiday` | `schema.prisma:941-950` | Global single date, not personnel-scoped, not org-scoped. |
| `Schedule` / `Assignment` / `ScheduleApproval` / conflicts | `schema.prisma:821-939`; `domain/models/conflict.ts` | Outputs of scheduling, not inputs. |

### 3.2 How production code consumes availability today (weekly only)

- **Generator eligibility** — `schedule-auto-generator.service.ts`:
  - `loadPersonnel` (`:509-526`) loads by `unitId + isActive`, then filters `employmentStatus === 'active'`; selects `offDays`.
  - `findAvailablePersonnel` (`:608-672`) rejects when `offDays.includes(new Date(dateStr).getDay())` at `:627`.
  - Weekday is derived from the date string (`:622`), so the *mechanism* for date→weekday exists; only the *date-specific* data is missing.
- **Manual/collision validation** — `schedules.service.ts:998-1001` and `:1331-1339` reject assignments on weekly `offDays` (`getDay()` match) with a hard error.
- **DDD validation** — `domain/models/master-data.ts:93-108` emits `AVAILABILITY_CONFLICT` (WARNING, overridable) for weekly `offDays`; `domain/constraints/hard-constraints.ts:150-156` emits an overridable constraint.
- **Optimizer (dry-run only)** — `domain/optimization/greedy-strategy.ts:409-413` applies the same weekly `offDays` check.
- **Insights** — `recommendations/scheduling-insights.service.ts:312-346` detects *"assigned on weekly off day"*.

All five consumers derive availability from the **same weekly weekday array**. A date-aware input must be added once and can then feed every one of them.

### 3.3 Existing patterns that the new model should mirror

- Device per-date unavailability already exists as `DeviceOffDate` (`schema.prisma:1445-1461`) and the generator builds `${deviceId}:${date}` keys (`schedule-auto-generator.service.ts:107-115, 212`). **Personnel availability should mirror this exact mechanism** with `${personnelId}:${date}` keys — minimal diff, same shape.
- Date values are naive `YYYY-MM-DD` strings everywhere in scheduling (`Assignment.date :900`, `ShiftDateOverride.date :761`, `DutyRoster.date :580`, `Holiday.date :943`, `DeviceOffDate.date`), and month-range reads use string `gte/lte` (`schedule-auto-generator.service.ts:107-112, 544-554, 588-599`).

---

## 4. Design Decision

### 4.1 Design gate result (phase Step 2)

**Q:** Can the existing schema represent `PERSON × DATE × AVAILABILITY` without a migration?

**A: No.** Every candidate model is either (a) week-numbered, (b) a semantic inversion, (c) post-hoc output, (d) not personnel-scoped, or (e) not date-scoped. There is no column set or existing table that can represent "person P is on leave from D1…D2" or "P is unavailable on 2026-09-15" without changing the data model.

### 4.2 Why a migration is unavoidable

Availability is a new *entity* (new table + new enum). Prisma cannot express a new table without a migration; runtime `prisma db push` is inconsistent with this project's versioned `prisma/migrations/` practice (27 sequential migrations, `migration_lock.toml` present). A schema-edit-without-migration would leave the database, generated client, and migration history divergent — a P0-grade integrity risk. A migration is technically unavoidable.

### 4.3 Proposed model (proposal only — NOT created)

Recommended: **single-date-row model** `PersonnelDateAvailability`, mirroring `DeviceOffDate` (per-date rows, indexed by person+date, loaded by `gte/lte` month scan). An alternative range-row model (`startDate`/`endDate` inclusive) was considered but rejected for this phase because (a) every scheduling date in the codebase is a single string, (b) the generator already has the exact `Set<"id:date">` loading pattern to mirror, and (c) row-per-date keeps resolution trivially deterministic (no range-overlap edge cases, no leap-exclusion decisions).

```prisma
enum PersonnelAvailabilityType {
  AVAILABLE    // explicit override of the default-available state
  UNAVAILABLE  // explicit temporary unavailability (ad-hoc)
  LEAVE        // approved leave (izin)
  ABSENCE      // absence (rapor / unexcused)
}

model PersonnelDateAvailability {
  id             String                      @id @default(uuid())
  personnelId    String
  unitId         String
  organizationId String?
  date           String                      // YYYY-MM-DD (matches Assignment.date convention)
  type           PersonnelAvailabilityType
  reason         String?
  isActive       Boolean                     @default(true)
  createdById    String?
  createdAt      DateTime                    @default(now())
  updatedAt      DateTime                    @updatedAt

  personnel    Personnel     @relation(fields: [personnelId], references: [id], onDelete: Cascade)
  unit         Unit          @relation(fields: [unitId], references: [id])
  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)

  @@unique([personnelId, date, type]) // one row per (person, date, type) — deterministic precedence input
  @@index([personnelId, date])
  @@index([organizationId, date])
  @@index([unitId, date])
  @@index([date])
  @@map("personnel_date_availability")
}
```

**Fields deliberately omitted** (keep-minimal): no `startTime/endTime` override (shift is the Assignment's job), no `approvedBy` workflow (leave approval is out of scope), no `version` optimistic lock per row (create/update flows reuse the existing `createdAt/updatedAt`; schedule-level versioning already exists).

**Index rationale:**
- `@@unique([personnelId, date, type])` — at most one row per person/date/type; collision-free precedence input (STOP condition "deterministic precedence").
- `@@index([personnelId, date])` — the eligibility lookup `isPersonnelAvailableForDate`.
- `@@index([organizationId, date])`, `@@index([unitId, date])`, `@@index([date])` — tenant-scoped month scans and the generator's `gte/lte` load.

### 4.4 Proposed migration DDL (proposal only — NOT created, NOT written to disk as a file)

```sql
CREATE TYPE "PersonnelAvailabilityType" AS ENUM ('AVAILABLE','UNAVAILABLE','LEAVE','ABSENCE');

CREATE TABLE "personnel_date_availability" (
  "id"             TEXT NOT NULL,
  "personnelId"    TEXT NOT NULL,
  "unitId"         TEXT NOT NULL,
  "organizationId" TEXT,
  "date"           TEXT NOT NULL,
  "type"           "PersonnelAvailabilityType" NOT NULL,
  "reason"         TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personnel_date_availability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personnel_date_availability_personnelId_date_type_key"
  ON "personnel_date_availability"("personnelId","date","type");
CREATE INDEX "personnel_date_availability_personnelId_date_idx"
  ON "personnel_date_availability"("personnelId","date");
CREATE INDEX "personnel_date_availability_organizationId_date_idx"
  ON "personnel_date_availability"("organizationId","date");
CREATE INDEX "personnel_date_availability_unitId_date_idx"
  ON "personnel_date_availability"("unitId","date");
CREATE INDEX "personnel_date_availability_date_idx"
  ON "personnel_date_availability"("date");

ALTER TABLE "personnel_date_availability"
  ADD CONSTRAINT "personnel_date_availability_personnelId_fkey"
  FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personnel_date_availability"
  ADD CONSTRAINT "personnel_date_availability_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personnel_date_availability"
  ADD CONSTRAINT "personnel_date_availability_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

*(Table/FK names follow the existing snake_case `@@map` convention; exact generated DDL will be produced by `prisma migrate dev --create-only` ONLY after explicit approval.)*

### 4.5 Migration impact

- **Objects:** 1 new enum, 1 new table, 1 unique index, 4 secondary indexes, 3 FKs. **No DDL on any existing table.**
- **Data migration:** none. Empty new table — safe on `draft`/`published` schedules, no backfill needed.
- **Downtime/availability:** none (additive DDL).
- **Client regeneration:** required (`prisma generate`) before any 5C.23 consumer code compiles.
- **Tenant middleware:** must add `'PersonnelDateAvailability'` to `TENANT_MODELS` in `backend/src/infrastructure/prisma/middleware/tenant.middleware.ts:6-10`. The model owns a direct `organizationId` column, so it is automatically admitted to `ORG_COLUMN_MODELS` via DMMF (`:29-49`) and receives create/query injection. **Until that line is added, org scoping falls to the eligibility service guard layer** (fail-closed).
- **Compatibility:** zero impact on existing tables, seeds, or tests. New model is inert until consumer code (5C.23) references it.

---

## 5. Files Changed

| File | Change |
|---|---|
| `docs/phase-5/phase-5c22-implementation-report.md` | Created (this report). |
| Everything else | **Unchanged.** No source, schema, migration, seed, test, config, or frontend file was touched. Verified via `git status --porcelain` after discovery (no changes attributable to this phase; `docs/` is untracked in the single-commit import and only this file is new). |

---

## 6. Domain Semantics

Definitions (applied consistently to the new model):

| Term | Definition |
|---|---|
| **AVAILABLE** | The person **can** be assigned on the date. This is the *default* state; an explicit `AVAILABLE` row only re-asserts it inside a range of non-available rows. |
| **UNAVAILABLE** | The person is explicitly **not** available on the date (ad-hoc, personal, not a formal leave). |
| **LEAVE** | Formal, approved leave (`izin`) covering the date. |
| **ABSENCE** | Absence (`rapor`/unexcused) covering the date — mirrors `ShiftType.sick → 'Raporlu'` label (`schedules-export.service.ts:214`). |

**Deterministic precedence per (person, date)** — resolution is a single sorted pass; ties broken by type order, never by insertion order, never by RNG:

1. `LEAVE` or `ABSENCE` (isActive) present → **NOT AVAILABLE** (blocking reason: leave/absence).
2. else `UNAVAILABLE` (isActive) present → **NOT AVAILABLE**.
3. else `AVAILABLE` (isActive) present → **AVAILABLE**.
4. else → **default AVAILABLE** (empty table = today's behavior; preserves 5C.22 test #14 requirement).

All three non-available states are **hard blockers for the production generator** (fail-safe: never assign a person on leave). The DDD validation layer may keep an overridable/`overrideReason` channel for deliberate manual assignment, consistent with `master-data.ts:106-108` (isOverridable) and `Assignment.overrideReason` (`schema.prisma:906`) — resolution must be identical in both layers.

---

## 7. Availability / Leave Resolution (proposed, not implemented)

New application service (proposed shape for 5C.23):

```
PersonnelEligibilityService.isPersonnelAvailableForDate(
  personnelId, date /*YYYY-MM-DD*/, organizationId, unitId?
): Promise<{ available: boolean; blocking: 'LEAVE'|'ABSENCE'|'UNAVAILABLE'|null }>
```

Resolution inputs (single coherent read):
- weekly `offDays` of the person (existing rule, unchanged);
- `personnel_date_availability` rows for `(personnelId, date, isActive=true)` — precedence per §6.

**Backend authoritative, deterministic, fail-safe.** No cross-tenant queries (see §9).

---

## 8. Scheduler Integration (feasibility; NOT implemented)

The integration is a **small controlled change**, fully feasible — this is the measured design for 5C.23:

1. In `generate()` (`schedule-auto-generator.service.ts:82-103`), extend the initial `Promise.all` with a load of `personnel_date_availability` rows for the month (`date gte startDate lte endDate` using the **computed** last day of month), mirroring the `deviceOffDate` load at `:107-115`.
2. Build `unavailableDates = new Set<string>()` of `${personnelId}:${date}` for `LEAVE/ABSENCE/UNAVAILABLE` (precedence resolved at load time).
3. In `findAvailablePersonnel` (`:608-672`), add one fail-safe filter before the skill check (`:631`): `if (unavailableDates.has(`${p.id}:${dateStr}`)) return false;`.
4. Mirror the same guard into `schedules.service.ts` collision validation (`:998-1001`, `:1331-1339`) and the DDD `validatePersonnelForAssignment` (`master-data.ts:55-112`) using the reserved `LEAVE_CONFLICT` code.

No changes to `ScheduleAutoGeneratorService` structure, output shape, or fairness logic. No replacement with the domain optimizer. No BullMQ, no frontend.

---

## 9. Security / Tenant Scope

- New reads must fail closed: if `organizationId` is unresolved/`null` at the service boundary, return NOT AVAILABLE (or throw) — never default-open. This mirrors the established `canAccessUnit` fail-closed rule (`rbac/services/unit-scope.service.ts:120-122`).
- Reuse of existing scope classes: **no new RBAC/scope logic**. `FIELD_SUPERVISOR` (single-unit) vs `SUPERVISOR` (organization) enforcement stays entirely in `ScheduleAccessGuard`/`unit-scope.service` — the new model inherits it because it is always reached through those guards (same as `DeviceOffDate`).
- Tenant isolation: `organizationId` column + (after 5C.23 wiring) `TENANT_MODELS` registration in `tenant.middleware.ts:6-10`. Until registered, eligibility lookups execute only inside guard-scoped, org-resolved requests.
- Cross-tenant personnel influence: impossible by construction — rows are keyed by `personnelId` and always filtered through the requesting org/unit path.

---

## 10. Date Semantics (audit findings that inform the design)

| # | Finding | Location | Consequence for 5C.22/23 |
|---|---|---|---|
| 10.1 | Scheduling dates are naive `YYYY-MM-DD` strings; no timezone conversion at rest. | `Assignment.date :900`, generator `:199` | New model must use the same string convention. |
| 10.2 | **F-15 pattern confirmed:** `findAvailablePersonnel` workload cap uses `new Date(options.year || 2026, options.month || 1, 0)` (`schedule-auto-generator.service.ts:666`) — `options` contains **no** year/month (`:88-97`), so it always evaluates to **February 2026 = 28 days**, never the scheduled month. | `:666` | MUST NOT replicate. New code computes day count from the real `(year, month)` exactly as the correct `daysInMonth` at `:152`. Never hardcode 28/30/31. |
| 10.3 | Month-scan sentinels hardcode `-31` endDate (`:106, :546, :590`) — harmless under string `gte/lte` but sloppy. | `:105-106, 544-554, 588-599` | New month scan must compute the true last day (e.g., `new Date(year, month, 0).getDate()`). |
| 10.4 | `new Date('YYYY-MM-DD').getDay()` is **timezone-sensitive**: `'YYYY-MM-DD'` parses as UTC midnight, so in negative-offset deployments the weekday can shift by one day. Used at `schedule-auto-generator.service.ts:201,622`, `schedules.service.ts:894,998,1118,1331,1952`. | many | New eligibility code derives `dayOfWeek` via `new Date(Date.UTC(y,m-1,d)).getUTCDay()` or the existing `assignment-date.value-object.ts` parse (`:41-46`). Documented as existing fragility — not fixed in this phase. |
| 10.5 | Month boundaries / leap years are already handled correctly by the day loop (`:152, 198-199`); 2024-02-29 compare-and-scan works with string dates. | `:152,198` | Row-per-date model sidesteps leap/range-exclusion entirely. |

---

## 11. Concurrency Analysis

- **Current behavior:** `generate()` takes one **coherent snapshot** at start via the single `Promise.all` (`:99-103`) of personnel/devices/holidays/device-off. Employees' `offDays`/`employmentStatus` are read once per generation; a mid-generation change to those fields is **not** observed. There is **no locking architecture** anywhere; schedule-level consistency is enforced only by the optimistic `version` bump at apply time (`:494-504`) and the published-mutation gate.
- **Decision (documented, not invented):** the new availability read participates in the *same* initial snapshot (`Promise.all`). Consistency guarantee = identical to today's `offDays` guarantee — a coherent read at generation start; concurrent `device-off`-style edits during generation are not visible. This is the established, acceptable contract.
- **Not introduced:** row-level locks, advisory locks, or a new optimistic-versioning scheme per availability row. A cross-machine concurrency overhaul is explicitly deferred (5C.21 F-08/F-18, out of scope for 5C.22).

---

## 12. Tests

**No tests were added or modified** (blocked — no implementation). The 15 required test cases are specified for 5C.23 `backend/src/modules/schedules/__tests__/5c22-availability-eligibility.spec.ts` (mirroring existing spec conventions such as `5b2-optimizer.spec.ts`, `5c18-*.spec.ts`):

1. Available person (no records) can be considered for assignment.
2. `UNAVAILABLE` row → person cannot be assigned on that date.
3. `LEAVE` row → assignment prevented.
4. `ABSENCE` row → assignment prevented.
5. Date boundary: row for `2026-03-15` blocks only that date, not `14`/`16`.
6. Month boundary: row on last day of month blocks only that day (e.g., `2026-02-28` vs `2026-03-01`).
7. Leap year: `2024-02-29` computes a valid weekday and does not shift adjacent dates.
8. Multiple records same person/date → precedence resolves deterministically (`LEAVE/ABSENCE > UNAVAILABLE > AVAILABLE`).
9. Deterministic precedence: same inputs → same result across repeated calls (no RNG, no insertion-order dependence).
10. `NULL`/undefined `organizationId` at the eligibility boundary → fails closed (NOT AVAILABLE or error), never open.
11. `FIELD_SUPERVISOR` scope: eligibility restricted to that supervisor's single unit.
12. `SUPERVISOR` scope: eligibility within the organization (multi-unit) only.
13. Cross-tenant: personnel of org A cannot be influenced by rows of org B.
14. Existing scheduling behavior intact with **zero** availability rows (empty table == today's weekly-`offDays` semantics).
15. Regression: production `ScheduleAutoGeneratorService.generate` never emits an assignment to a person with a `LEAVE`/`ABSENCE`/`UNAVAILABLE` row on that date (generator-level test mirroring the `deviceOffSet` test style).

No existing test is weakened, skipped, or threshold-changed.

---

## 13. Build Validation

Not executed — **no code changed**. Baseline from the 5C.20 closure audit (tree unchanged since): `tsc --noEmit` clean, `nest build` PASS, FE-01 15/15, FE `tsc` clean, FE prod build PASS (2 pre-existing 200 kB budget warnings). When implementation is approved, the 5C.22 required set is: backend `tsc`, backend `nest build`, focused 5C.22 tests, scope/auth regressions (5C.17/18/20), existing scheduling tests.

---

## 14. Regression Validation

Not executed — **no code changed**, therefore no regression is possible from this phase. The guarantees listed in phase Step 9 (organization isolation, NULL-org fail-closed via `unit-scope.service.ts:120-122`, FIELD_SUPERVISOR single-unit, SUPERVISOR org scope, system-admin global carve-out, schedule mutation authorization) are intact by construction and will be re-verified in 5C.23 after implementation.

---

## 15. Migration Status

**MIGRATION REQUIRED — NOT CREATED.**

- Required objects: enum `PersonnelAvailabilityType`; table `personnel_date_availability` + indexes + FKs (§4.4). Proposed as schema + DDL in §4.3/§4.4.
- **No migration file was written to disk.** `prisma migrate` (create-only) is deferred until explicit approval.
- Unavoidable because the availability entity does not exist in the data model and Prisma cannot add a table without a migration; deviating from the versioned `prisma/migrations/` discipline is unacceptable.

---

## 16. Known Environment Failures

Unchanged from prior phases: `device-off` tests (`device-off.spec.ts`) require PostgreSQL at `localhost:5432` and fail in this environment with `Can't reach database server at localhost:5432`. They are **not** altered and not claimed fixed. Database-backed run was not performed this phase (read-only).

---

## 17. Deferred Items (5C.23+)

This phase ends blocked; the implementation work is staged for a future, explicitly-approved phase:

1. Approve migration → create `prisma/migrations/*_personnel_date_availability` (create-only) → `prisma generate`.
2. Register model in `tenant.middleware.ts` `TENANT_MODELS`.
3. `PersonnelEligibilityService.isPersonnelAvailableForDate` (org fail-closed, reuses unit-scope RBAC).
4. Generator integration (§8 steps 1–3) + collision validation + DDD `LEAVE_CONFLICT` wiring.
5. The 15 tests in §12 plus scope/auth regressions (5C.17/18/20).
6. **Still explicitly OUT of scope (unchanged):** F-01 legacy generator replacement, F-13 minimum coverage, F-14 explainability, F-02 real generate dialog, F-05 BullMQ implementation, F-08/F-18/F-20 benchmark/concurrency overhaul, genetic algorithm, new optimizer, frontend solver, frontend redesign, and the orphan frontend leave-management screen.

---

## 18. Final Verdict

**`BLOCKED — MIGRATION REQUIRED`**

- **F-12 status:** Identified root cause precisely (§2); a viable minimal design produced (§4); implementation **not started** because the design gate and phase rules mandate a stop-and-report prior to creating the migration.
- **Files changed:** only this report (`docs/phase-5/phase-5c22-implementation-report.md`).
- **Migrations:** none created — exact required migration is proposed in §4.4 and awaits explicit approval.
- **Tests:** none added/modified; 15 required cases specified for 5C.23 (§12).
- **Builds:** not run (no code changed); baseline from 5C.20 remains.
- **Regressions:** none run (no code changed); guarantees unaffected by construction.
- **Known env failure:** device-off DB-only tests, unchanged (§16).
- **Deferred 5C.23 items:** §17.

Waits for review and explicit approval of the migration design before any implementation begins.

STOP.