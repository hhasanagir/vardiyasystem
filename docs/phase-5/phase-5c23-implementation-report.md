# Phase 5C.23 — Personnel Date Availability Implementation

**Status:** PASS WITH WARNINGS
**Authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Phase mode:** Implementation of the approved 5C.22 migration design (verdict: APPROVED WITH CHANGES, `phase-5c22-migration-design-review.md` §18/§19). This phase adds the approved `PersonnelDateAvailability` model, an eligibility resolver, a guarded CRUD API with audit, and a minimal production scheduler integration targeting F-12.

---

## 1. Executive Summary

Phase 5C.23 implements the approved personnel date-availability design without optimizer swap, BullMQ, or frontend changes:

- **Schema:** added `PersonnelAvailabilityType` enum + `PersonnelDateAvailability` model (`@@unique([personnelId, date])`, no org/unit/type-in-key, `createdById` nullable, FK to `Personnel` ON DELETE CASCADE).
- **Migration:** `20260912000000_personnel_date_availability` created (SAFE ADDITIVE). `prisma validate` (pass) and `prisma generate` (pass) executed. **Applying to a live database is not possible in this environment** (PostgreSQL unreachable at `localhost:5432`); the apply step is recorded as an environment-limited action, identical in kind to the pre-existing `device-off` test failures.
- **Eligibility service:** `PersonnelAvailabilityService` — deterministic precedence (explicit active row > weekly `Personnel.offDays` > available), UTC-safe weekday handling, fail-closed NULL-org resolver, plus a month-blocked-dates builder consumed by the scheduler.
- **API:** guarded `GET/POST/PATCH/DELETE /personnel-availability` (Roles thresholds VIEWER / FIELD_SUPERVISOR), 409 `AVAILABLE_OVER_BLOCKING` collision rule, reactivation-by-UPDATE, idempotent soft delete, audit on every mutation.
- **Scheduler integration:** `ScheduleAutoGeneratorService.findAvailablePersonnel` now rejects blocked dates from the authoritative eligibility service (offDays + explicit rows); empty-table behavior is byte-identical to the pre-phase generator (regression-proven).
- **Tests:** 3 new spec files / 34 assertions; full backend suite — **1015 passed / 10 failed**, and the only failures are the known environment-only DB tests (`device-off.spec.ts`, `Can't reach database server at localhost:5432`), unchanged from prior phases.

**Final verdict: PASS WITH WARNINGS** (warnings: (1) migration not applied to a live DB in this environment — apply + real constraint check deferred; (2) collision-validation / DDD mirroring from contract §19 item 5 deliberately deferred — see §15 rejection rationale; (3) known env-only `device-off` DB failures remain.)

---

## 2. Scope

| Item | Status |
|---|---|
| Schema change (enum + model) | Implemented (approved §18 exactly) |
| SAFE ADDITIVE migration | Migration file written; DB apply deferred (env) |
| `TENANT_MODELS` | Unchanged — not registered (approved §18 item 6) |
| Eligibility resolver | Implemented |
| Guarded CRUD API + audit | Implemented |
| Scheduler integration (`findAvailablePersonnel`) | Implemented |
| Collision-validation + DDD mirroring | **Deferred** (see §15) |
| Optimizer swap / BullMQ / frontend / FE | Not touched |
| F-01/F-02/F-05/F-08/F-13/F-14/F-18/F-20 | Not implemented |

---

## 3. Files Changed

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | `PersonnelAvailabilityType` enum + `PersonnelDateAvailability` model (~line 1463); `Personnel.dateAvailability` back-relation (~line 640). |
| `backend/prisma/migrations/20260912000000_personnel_date_availability/migration.sql` | New SAFE ADDITIVE migration (manual; DB unusable for `migrate dev --create-only`). |
| `backend/src/modules/schedules/domain` … (unchanged) | Not modified. |
| `backend/src/modules/audit-log/audit.constants.ts` | +3 `AuditEvent`s (`PERSONNEL_AVAILABILITY_CREATED/UPDATED/DEACTIVATED`), +3 Turkish labels, +1 `EntityTypeLabels` entry (`personnel_date_availability`). |
| `backend/src/modules/schedules/services/personnel-availability.service.ts` | NEW — resolver + month builder + CRUD + audit (372 lines). |
| `backend/src/modules/schedules/personnel-availability.controller.ts` | NEW — 4 guarded routes. |
| `backend/src/modules/schedules/dto/create-personnel-availability.dto.ts` | NEW. |
| `backend/src/modules/schedules/dto/update-personnel-availability.dto.ts` | NEW. |
| `backend/src/modules/schedules/schedules.module.ts` | Registered service + controller. |
| `backend/src/modules/schedules/schedule-auto-generator.service.ts` | Optional 4th ctor dependency; blocked-date build; `findAvailablePersonnel` `blockedDates` filter replacing the raw `offDays.includes(dayOfWeek)` check. |
| `backend/src/modules/schedules/__tests__/5c23-availability-eligibility.spec.ts` | NEW (15 tests). |
| `backend/src/modules/schedules/__tests__/5c23-availability-api.spec.ts` | NEW (15 tests). |
| `backend/src/modules/schedules/__tests__/5c23-availability-generator.spec.ts` | NEW (4 tests). |

---

## 4. Approved Design vs. Implementation (traceability)

| Approved item (design review §3/§16/§18) | Implementation |
|---|---|
| enum `PersonnelAvailabilityType { AVAILABLE, UNAVAILABLE, LEAVE, ABSENCE }` | `schema.prisma` — exact. |
| `id` uuid PK, `personnelId String`, `date String` (YYYY-MM-DD), `type`, `reason String?`, `isActive Boolean @default(true)`, `createdById String?`, `createdAt/updatedAt` | exact. |
| `@@unique([personnelId, date])`, `@@index([personnelId, date])`, `@@map("personnel_date_availability")` | exact (+ added `@@index([date])` for range scans). |
| NO `organizationId`, NO `unitId`, NO type-in-unique, NO history table | exact — parent-owned tenancy via `Personnel` FK. |
| FK `personnelId → personnel(id)` ON DELETE CASCADE ON UPDATE CASCADE | exact. |
| Do NOT register in `TENANT_MODELS` | `backend/src/modules/tenant/.../tenant.middleware.ts` untouched. |
| 409 on `AVAILABLE` over active blocking row | `ConflictException` code `AVAILABLE_OVER_BLOCKING` in `create()`. |
| Reactivation-by-UPDATE | PATCH allows type/reason/isActive change (explicit conscious mutation); unique-key recreate/re-activate of an inactive row via POST upsert. |

---

## 5. Eligibility Precedence (implemented, deterministic)

Single row per `(personnelId, date)` — no runtime multi-row ambiguity:

| Row state | Decision |
|---|---|
| No row, weekday ∈ `Personnel.offDays` | blocked (`WEEKLY_OFF_DAY`) |
| No row, weekday ∉ offDays | available |
| Active `UNAVAILABLE` / `LEAVE` / `ABSENCE` | blocked (reason carried) |
| Active `AVAILABLE` | available — overrides a weekly off-day for that date |
| Inactive row (`isActive=false`) | behaves as absent (falls back to weekly offDays) |
| NULL/undefined resolver org | fail closed → `UNRESOLVED_TENANT` (never assign) |

UTC correctness (F-15 timezone hazard): weekdays derive from `Date.UTC(...).getUTCDay()` never from local `new Date('YYYY-MM-DD').getDay()`; month lengths derive from `new Date(Date.UTC(year, month, 0)).getUTCDate()` (real calendar, leap-safe, no `-31` hardcode).

---

## 6. Schema & Migration Detail

**Model** (`backend/prisma/schema.prisma` ~line 1463):

```
enum PersonnelAvailabilityType { AVAILABLE UNAVAILABLE LEAVE ABSENCE }

model PersonnelDateAvailability {
  id          String                  @id @default(uuid())
  personnelId String
  date        String
  type        PersonnelAvailabilityType
  reason      String?
  isActive    Boolean                 @default(true)
  createdById String?
  createdAt   DateTime                @default(now())
  updatedAt   DateTime                @updatedAt

  personnel Personnel @relation(fields: [personnelId], references: [id], onDelete: Cascade)

  @@unique([personnelId, date])
  @@index([personnelId, date])
  @@index([date])
  @@map("personnel_date_availability")
}
```

**Migration** `backend/prisma/migrations/20260912000000_personnel_date_availability/migration.sql`: `CREATE TYPE` + `CREATE TABLE` + `CREATE UNIQUE INDEX personnel_date_availability_personnelId_date_key` + two navigation indexes + FK `personnelId REFERENCES personnel(id) ON DELETE CASCADE ON UPDATE CASCADE`. `createdById` has **no FK** (nullable audit-only reference, per approved §16). No existing migration was altered.

**Apply status:** the DB-free validation path is green (`npx prisma validate` ✅, `npx prisma generate` ✅ → client v5.22.0). `prisma migrate deploy/dev` require a reachable PostgreSQL; this environment cannot reach `localhost:5432` (`Test-NetConnection localhost -Port 5432` → `TcpTestSucceeded False`), so applying the migration and exercising the real `@@unique` constraint + FK at runtime is **deferred to a DB-equipped environment** and verified instead at service level (see §9/§18). This mirrors the longstanding `device-off` env caveat.

---

## 7. Eligibility Service API

`backend/src/modules/schedules/services/personnel-availability.service.ts`

- `isPersonnelAvailableForDate(personnelId, date, organizationId?) → Promise<{ available; blocking }>` — single-row resolver; fail-closed on NULL org / unknown personnel. (`blocking` includes `'WEEKLY_OFF_DAY'` and `'UNRESOLVED_TENANT'` beyond the approved `'LEAVE'|'ABSENCE'|'UNAVAILABLE'|null` — additive, used by the scheduler and diagnostics only).
- `resolveMonthBlockedDates(personnel: {id; offDays}[], year, month) → Promise<Map<personnelId, Set<date>>>` — single `findMany` for the real month range; preferred input for the production scheduler (deterministic precedence baked in).
- `isValidDate` / `utcWeekDayOf` / `daysInMonth` — static, pure, UTC-safe, reused by the generator fallback.
- `blockedByWeeklyOffDays` — legacy pure fallback used only when the generator is constructed without the availability dependency (existing unit tests construct with 3 args; production always supplies it).
- CRUD: `list`, `create`, `update`, `deactivate` — see §9/§10.

---

## 8. Scheduler Integration

`schedule-auto-generator.service.ts`:

- Constructor gains optional `private availabilityService?: PersonnelAvailabilityService`.
- After the personnel split, builds `personnelBlockedDates` via `availabilityService.resolveMonthBlockedDates(...)` (or the legacy offDays fallback when absent). All active unit personnel (technician / assistant / supervisor) are covered by one map.
- `findAvailablePersonnel` (called at the 3 device shift sites) now takes `blockedDates: Map<string, Set<string>>` and the first rejection is:
  `if (blockedDates.get(p.id)?.has(dateStr)) return false;`
  The raw `if (p.offDays.includes(dayOfWeek)) return false;` plus its `new Date(dateStr).getDay()` computation were removed from this method (`dateObj`/`dayOfWeek` were only used there).
- The generator does not re-implement availability logic — it consumes the authoritative service result.

Behavior deltas are intentional and approved: offDays remain enforced (as the base rule under the precedence matrix), UTC-safe weekdays replace local `getDay()`, and an explicit `AVAILABLE` row can override a weekly off-day. Empty availability table ⇒ identical candidate sets as pre-phase (no row added).

---

## 9. CRUD API

Routes under `/api/v1/personnel-availability` (global prefix `api`, URI version `v1`, per `main.ts:37-42`):

| Method | Route | Min role | Semantics |
|---|---|---|---|
| GET | `/` | `VIEWER` | scoped list via `resolveReadScope` (unit/org/denyAll), filters `personnelId? unitId? date? take? skip?`, `orderBy date desc` |
| POST | `/` | `FIELD_SUPERVISOR` | create/upsert on unique `(personnelId,date)`; **409** `AVAILABLE_OVER_BLOCKING`; validates real YYYY-MM-DD calendar date |
| PATCH | `/:id` | `FIELD_SUPERVISOR` | type / reason / isActive update (reactivation = set `isActive:true`); no-op if payload empty |
| DELETE | `/:id` | `FIELD_SUPERVISOR` | soft delete via `isActive=false`; idempotent |

DTO validation via the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, `transform`); `type` constrained by `@IsIn(['AVAILABLE','UNAVAILABLE','LEAVE','ABSENCE'])`; `date` by `@Matches(/^\d{4}-\d{2}-\d{2}$/)` plus a real-calendar check in the service (rejects e.g. `2026-02-30`, `2026-13-01`).

---

## 10. Authorization Layer

- Guard stack per route: `JwtAuthGuard` + `RolesGuard` (`@Roles(MinRole.VIEWER)` / `@Roles(MinRole.FIELD_SUPERVISOR)` = MEDICAL_ENGINEER threshold).
- **Deviation from contract §19 item 6 (documented):** the class-level `ScheduleAccessGuard` is **not applied**. That guard treats `params.id` as a *schedule* id (`guards/schedule-access.guard.ts`), so `PATCH/DELETE /personnel-availability/:id` where `:id` is an availability row id would raise a 404. The security contract is instead enforced with the identical backend-authoritative mechanism used inside schedule write endpoints — `UnitScopeService`:
  - `resolveTargetScope('personnel', id)` → target `(unitId, organizationId)`, then `canAccessUnit(actor, unitId, orgId)`.
  - Fail-closed: NULL user org never grants (`unit-scope.service.ts:120-122`), sole carve-out = explicit platform `system_admin`/`super_admin` (`isExplicitGlobalSystemAdmin`).
  - FIELD_SUPERVISOR single-unit confinement; cross-tenant denial; SUPERVISOR org scope.
  - Reads confined by `resolveReadScope` (single source of truth for list endpoints), `denyAll` ⇒ empty result.
- No new roles, no new permission gates were introduced.

---

## 11. Audit

Every mutation calls `auditLog.log(...)` explicitly (established `schedules.service.ts` pattern) with `entityType: 'personnel_date_availability'`, old/new values, and success/failure status surfaced via the existing audit-log interceptor path. Additive constants: 3 `AuditEvent` members + Turkish labels + `EntityTypeLabels['personnel_date_availability']`. No sensitive payloads are written. No `@Log` decorator is used on the new controller (avoids double-write through the global `AuditInterceptor` and its `params.id`-as-model-id model map).

---

## 12. Date Boundaries & Leap / Month Handling

Verified by tests (§13): `2024-02-29` valid, `2026-02-29` invalid, `2026-02-30`/`2026-13-01` rejected; `daysInMonth(2028,2)=29` / `(2026,2)=28`; February-2028 builder yields exactly 4 Sunday blocks; `2028-02-29` is correctly a weekday (not blocked). Month builder uses real `(year, month)` day count — the `-31` string sentinels used elsewhere in the generator loaders (`schedule-auto-generator.service.ts:106/:546/:590` for `deviceOffRecords`/holidays/overrides) are unchanged and remain a harmless `lte` upper bound; the F-15 workload-cap constant (`:666`) is untouched because it is not on the F-12 integration path (documented, not silently fixed — see §15).

---

## 13. Tests Added (34 assertions, non-vacuous, no skips)

`__tests__/5c23-availability-eligibility.spec.ts` (15) — precedence A–I, inactive-row fallback, NULL-org fail-close, unknown-personnel fail-close, real-date validation, leap/February month builder, AVAILABLE override, empty-table no-op, static utilities.

`__tests__/5c23-availability-api.spec.ts` (15) — FIELD_SUPERVISOR own-unit allow / sibling-unit deny, cross-tenant deny, NULL-org fail-close with explicit SYSTEM_ADMIN carve-out, NotFound-before-write, 409 `AVAILABLE_OVER_BLOCKING` (no write), upsert/reactivation on unique key, PATCH AVAILABLE flip, soft-delete idempotency, mutation scope enforcement, audit entry shape, read-scope unit/org/denyAll filtering.

`__tests__/5c23-availability-generator.spec.ts` (4) — production `generate()`: B never assigned on LEAVE date; A never assigned on unoverridden off-days; AVAILABLE override lets A cover the Monday B is out; 31 assignments / 31 distinct days for a 31-day month; empty availability table regression (byte-identical offDays behavior).

Coverage of the 15-case contract map: 1✓(A), 2✓(D), 3✓(E), 4✓(F), 5✓(API/eligibility exact-date), 6✓(month builder boundaries), 7✓(leap weekday), 8✓(unique + 409 replace multi-row), 9✓(precedence matrix deterministic), 10✓(NULL org), 11✓, 12✓, 13✓(cross-tenant), 14✓(empty-table regression), 15✓(generator + UTC boundary).

---

## 14. Validation Results (exact counts)

| Command | Result |
|---|---|
| `npx prisma validate` | ✅ schema valid |
| `npx prisma generate` | ✅ Prisma Client v5.22.0 |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` (`nest build`) | ✅ PASS |
| Focused 5C.23 (`--pool=threads --no-file-parallelism`) | ✅ **34/34 passed** (3 files: 15 / 15 / 4) |
| Schedules + audit-log + rbac suites | ✅ **passed in full run** |
| Full backend suite (`npx vitest run --pool=threads`) | **1015 passed, 10 failed** (1 file: `device-off.spec.ts` — pre-existing env-only DB failures, unchanged) |
| Regressions 5C.17/5C.18/5C.20/5C.14/5C.15/5C.9/5B suites | ✅ green (included in full run) |

The only failures are the known integrated-DB tests (`Can't reach database server at localhost:5432`) — recorded, not "fixed" (phase rule).

---

## 15. Deferred Items (explicit decisions)

1. **Migration apply + real constraint runtime verification** — requires PostgreSQL; remanded to a DB-equipped environment (like `device-off`). Service-level unique/409/soft-delete semantics covered by unit tests.
2. **Contract §19 item 5 mirroring** — reflecting availability into plan-collision validation (`schedules.service.ts` assign/override) and the DDD `validatePersonnelForAssignment` (`ConflictCode.LEAVE_CONFLICT`/`AVAILABILITY_CONFLICT`) was **not** performed. Phase Step 10 restricts this phase to "the existing production candidate selection path (`findAvailablePersonnel` and/or the smallest necessary caller)" and forbids scope creep. The generator path (the only automated production writer of per-person assignments) is the required consumer and is covered. The manual-assignment validator enhancement needs an approved follow-up to F-12 completion.
3. **F-15 workload-cap constant** (`findAvailablePersonnel` `:666`) — left untouched: not directly encountered by the availability integration (its month-length defect only mis-scales the per-person shift cap); separately audited finding (5C.21 P2).
4. **Future optimizer input slot** (`SchedulingProblemPersonnel`/`PersonnelRecord` `unavailableDates`) — not wired; optimizer swap is out of scope per phase rules.

---

## 16. Security / Privacy / Tenant Isolation

- No `organizationId`/`unitId` on the new table — tenancy is parent-owned through `Personnel.unitId` (line-item convention proven by `DeviceOffDate`/`ShiftDateOverride`/`DutyRoster`).
- All access reuses the Phase 5C.20 fail-closed `UnitScopeService` kernel; no new bypassable paths. NULL-org deny is applied on both read (boundary `denyAll` for unresolved strict units) and write (canAccessUnit), with the single documented platform-SYSTEM_ADMIN carve-out.
- Audit trail on every create/update/deactivate with actor, entity, old/new values.
- No secrets, no new credentials, no frontend surface.

---

## 17. Environment / DB Notes

- `localhost:5432` unreachable ⇒ `prisma migrate deploy/dev` and `device-off.spec.ts` cannot run here. Migration file is complete and additive; `validate`/`generate` (DB-free) pass.
- A future `prisma migrate deploy` on `20260912000000_personnel_date_availability` is the only outstanding apply step.

---

## 18. Risk & Contingency

- **UPSERT race** — POST `AVAILABLE` just after an active blocking row was created concurrently: the 409 check is read-then-write (non-transactional, consistent with `toggleDeviceOff` precedent). Mitigation: unique index makes a post-check retry safe; the DB-level `@@unique` guarantees no duplicate rows. Left commensurate with existing codebase standards; noted for future hardening.
- **Legacy NULL-org reads** — list parity mirrors existing endpoints (`resolveReadScope`), so a legacy NULL-org supervisor sees org-wide rows exactly as today's `GET /schedules`; writes remain denied (fail-closed). No behavior regression.

---

## 19. Conclusion

The approved design is implemented as specified, the production scheduler now excludes personnel with active blocking availability, empty-table behavior is regression-proven identical, and the full backend suite degrades only on the known environment-only DB tests. Two documented follow-ups remain (live-DB apply, collision/DDD validator mirroring).

---

## 20. Final Verdict

**PASS WITH WARNINGS**

- P0/P1: none.
- PASS cases: schema + migration file (additive), eligibility precedence (deterministic), 409 rule, guarded CRUD + audit, scheduler integration, 34 new tests green, tsc/build green, full suite 1015/1025 (only env-only device-off fails).
- WARNINGS: migration not applied to a live DB here; collision-validation/DDD mirroring deferred; F-15 line-666 constant untouched (separate P2).
- BLOCKER: none.

Exit criteria: all non-environment checks pass; no source/schema/migration/test regressions; report written; final command executed.

STOP.