# Phase 5C.18 — Conditional Implementation Report (Remaining P1)

**Project:** VARDİYAOS (Enterprise Shift Scheduling)
**Phase:** 5C.18 — Remaining P1 Implementation (DIRECT-01, EXP-01, RT-01; FE-01 already closed)
**Date:** 2026-09-10
**Author:** Implementation Agent (opencode)
**Status:** See Final Verdict (Section 17).

---

## 1. Executive Summary

Phase 5C.18 originally produced four confirmed P1 findings. FE-01 was closed
first and separately validated (`ApiService` transport fix, 15/15 FE tests).
This session re-audited and validated the three remaining P1 findings in the
authoritative Desktop repository:

| ID | Defect | Outcome |
|----|--------|---------|
| DIRECT-01 | `directAssign` could force-publish schedules (bypass submit → approve → publish) | FIXED (pre-existing fix confirmed; mandated unauthorized-role test added) |
| EXP-01 | Excel worksheet name `${unitName} ${month}/${year}` contains `/` → export 500 | FIXED (deterministic sanitizer confirmed; mandated deterministic/collision tests added) |
| RT-01 | Unit-by-type lookups could cross organization boundaries / NULL-org fail-open | FIXED (org-scoped resolution + fail-closed semantics confirmed at service AND guard layer) |
| FE-01 | `expectedVersion` not transported by `ApiService` | CLOSED — see Section 3 (unchanged, not reimplemented) |

The read-only re-audit (Section 4–6) proved all three remaining findings were
already fixed in the working tree by the prior implementation step and attached
tests. No production change was required or made in this session. To satisfy the
mandatory minimum test matrices exactly, four additive, backward-compatible
tests were appended (no production code, no weakening):

- DIRECT-01: unauthorized-role (Forbidden) gate test.
- EXP-01: deterministic-output test; sanitization/truncation collision test; export-level collision-safety test.

Targeted 5C.18 suites: **32/32 PASS** (DIRECT-01 11, EXP-01 14, RT-01 7).
Backend regression: **954 PASS / 10 FAIL** (all 10 = live-Postgres `device-off`, environmental, untouched).
Frontend: FE-01 **15/15**, tsc clean, production build PASS.

VERDICT: **PASS WITH WARNINGS** (see Section 17). Warnings are strictly
documented non-blocking environment/pre-existing disclosures.

---

## 2. Initial 5C.18 P1 Findings (as audited)

1. **DIRECT-01 — Workflow integrity.** `directAssign` loaded a reusable schedule
   without checking lifecycle state; draft/under_review/rejected schedules could
   be silently re-published, bypassing the submit → approve → publish workflow,
   and a missing schedule could be created as `published`.
2. **FE-01 — Optimistic-concurrency transport.** `ApiService` wrappers
   (`get/post/put/delete`) accepted no options and dropped caller params, so
   `expectedVersion` prepared in `ScheduleService` never reached Angular
   `HttpClient` — the server-side concurrency guard was never exercised.
3. **EXP-01 — Excel export 500.** Worksheet name `${unitName} ${month}/${year}`
   contains `/` (Excel forbids `\ / ? * [ ] :`, control chars, leading/trailing
   apostrophe, >31 chars). `workbook.addWorksheet(...)` throws → export 500.
4. **RT-01 — Organization-safe unit lookup.** `findByUnitType` used a global
   `unit.findFirst({ where: { type } })`; a cross-org unit could resolve and be
   read/mutated, and an unresolved/NULL organization context could fail open.

---

## 3. FE-01 Closure Reference

FE-01 is COMPLETE and VALIDATED; per instruction it was NOT reimplemented or
modified in this session. Re-verified on this run: **15/15 PASS**.

- Root cause: `src/app/services/api.service.ts` `get/post/put/delete` accepted no
  options and silently dropped params; only `download()` forwarded them.
- Fix: the four wrappers accept OPTIONAL `HttpRequestOptions`
  (`NonNullable<Parameters<HttpClient['get']>[1]>`) and forward them, preserving
  default headers via a private `withDefaults` helper. Fully backward compatible.
- `ScheduleService` sends `expectedVersion` on all 6 legacy assignment mutations
  (server-known version only, never client-manufactured); 409 →
  `ConflictDetails`; local state never overwritten by a failed mutation.
- Verified at the OUTGOING HTTP level (`HttpTestingController` `urlWithParams`
  + query parsing): `{ params: { expectedVersion } }` now reaches
  `HttpClient`; no-options legacy callers unchanged.
- FE gates re-run this session: `npx tsc --noEmit` PASS; production build PASS;
  FE-01 vitest 15/15 (10 `schedule-service.version` + 5 `api-service.transport`).

---

## 4. DIRECT-01 — Root Cause, Current Behavior, Fix

### Re-audit (read-only, source-level)
Inspected `schedules.service.ts` `directAssign` (all call paths: the endpoint
`directAssign` route is the only caller) and the shared status gate.

### Root cause
`directAssign` mutated a loaded schedule without lifecycle inspection, and
created missing schedules as `published` — manufacturing an approval/publish
transition outside the four-eyes workflow.

### Current behavior (verified in source + 11 tests)
- Role gate first: `canDirectAssign(role)` (level ≥ 300 or system/hospital
  admin) → `ForbiddenException` before ANY unit/schedule access.
- Unit resolved via `resolveTenantScopedUnit` (RT-01): org-scoped, strict-unit
  exact, NULL-org fail-closed → `NotFoundException` if unresolved.
- Missing schedule → created `status:'draft'`, `createdById`, NO `publishedAt`,
  CREATE audit `autoCreated:true`. No PUBLISH audit is ever emitted.
- Existing schedule → `assertNotPublished(schedule)` (shared gate: only
  `published`/`archived` throw `ConflictException`); draft / under_review /
  rejected keep their status and the assignment proceeds without a transition.
- Optimistic-concurrency `bumpScheduleVersion(tx, id, expectedVersion)` retained
  (stale → structured 409 `SCHEDULE_VERSION_CONFLICT`, whole tx rolls back).
- Four-eyes intact: no path in `directAssign` can reach an approval or publish
  transition; those remain exclusively in `SchedulesWorkflowService`.

### Intended minimal fix (already present; confirmed, not duplicated)
Reuse the existing domain gate (`assertNotPublished`) and create new schedules
as `draft`. No second workflow implementation was introduced.

### Test strategy: `__tests__/5c18-direct-assign-gate.spec.ts`
11 tests: missing→draft(+no publishedAt, no PUBLISH audit), DRAFT / UNDER_REVIEW /
REJECTED not force-published (`update.data.status`/`publishedAt` undefined,
audit has no PUBLISH), PUBLISHED / ARCHIVED denied (ConflictException, nothing
mutated), stale `expectedVersion` → 409, cross-org → NotFound, strict
field_supervisor sibling → NotFound, NULL-org fail-closed → NotFound, plus the
NEW unauthorized-role test (technician → Forbidden, before any lookup/mutation,
no audit).

---

## 5. EXP-01 — Root Cause, Current Behavior, Fix

### Re-audit (read-only, source-level)
Inspected `schedules-export.service.ts` (sanitizer, `exportExcel`, `resolveUnit`,
`getExportData`) and `schedules.controller.ts` `enforceUnitReadScope`.

### Root cause
`exportExcel` built `${data.unitName} ${month}/${year}` and passed it raw to
`workbook.addWorksheet(...)`. `/` is Excel-forbidden → `InvalidWorksheetName`
throw → 500. Turkish names (e.g. `MR/BT`, `Röntgen`, `PET/CT`) or long names
guaranteed recurrence; arbitrary `unit` strings also reached the Prisma `type`
enum unvalidated (Prisma validation 500).

### Current behavior (verified in source + 14 tests)
- Canonical pure helper `sanitizeWorksheetName` (deterministic):
  `[\\/?*[\]:]` → `-`; control chars → space; whitespace collapsed; trim;
  leading/trailing `'` stripped; empty → `'Vardiya Plani'`; sliced to ≤ 31.
- Applied at the export/service boundary: `addWorksheet(sanitizeWorksheetName(\`${data.unitName} ${month}/${year}\`))`.
- `resolveUnit`: uuid / code / valid-enum-type only; invalid enum string returns
  null → 404 (never a Prisma 500). API response contracts unchanged (binary buffer).
- Controller `enforceUnitReadScope` does the read-scope check BEFORE export and
  never runs a raw global `where.type` query with an unvalidated value.
- Data is never altered — only the worksheet label is sanitized.
- Uniqueness: `exportExcel` writes exactly ONE worksheet per workbook, so
  sanitization collisions cannot break a live export; each colliding name is a
  stable, deterministic, valid sheet name.

### Intended minimal fix (already present; confirmed, not duplicated)
Small deterministic sanitization helper at the writer boundary; no data/API change.

### Test strategy: `__tests__/5c18-export-worksheet-name.spec.ts` (NEW tests appended)
Existing (11): month/year `/` format, Turkish characters, all forbidden chars,
>31 truncation, apostrophes, empty fallback, all 14 supported Turkish units,
successful export path, invalid-unit 404 (Excel + PDF), controller guard.
NEW: deterministic-output (25 repeat calls stable); sanitization/truncation
collision (two distinct inputs → identical 31-char stable head); export-level
collision-safety (two colliding names both export, fresh single-sheet workbook).

---

## 6. RT-01 — Root Cause, Current Behavior, Fix

### Re-audit (read-only, source-level)
Re-audited ALL unit lookups reachable from `publishByUnit` and `directAssign`:
`resolveTenantScopedUnit` (service), `findByUnitType(..., user?)` tail lookup,
guard `UnitScopeGuard.toUnitId` type branch, `UnitScopeService.resolveScope` /
`canAccessUnit`, and export `enforceUnitReadScope`.

### Root cause
`findByUnitType` (and the guard type branch) could resolve a unit globally by
`type` with no `organizationId` predicate; `resolveScope` returned the user's
(potentially NULL) org without fail-closed handling; a NULL/unresolved org could
fail open.

### Current behavior (verified in source + 7 tests)
- Service-side org containment: `resolveTenantScopedUnit(unitType, user)` returns
  null when org is unresolved (NULL-org → FAIL CLOSED), queries `unit` with
  `where: { type, organizationId: scope.organizationId }` — a unit belonging to
  another organization can never resolve; strict-unit roles (FIELD_SUPERVISOR)
  must match the exactly assigned unit (sibling unit → null → NotFound).
- Used by `findByUnitType` (when user supplied), `publishByUnit`, and
  `directAssign` (including its trailing re-fetch, which now passes the user).
- Guard `toUnitId` type branch: org-scoped + NULL-org fail-closed; id/code
  branches stay exact but cross-tenant reach is still rejected by
  `canAccessUnit` (different known orgs → false → 403).
- `canAccessUnit`: cross-org deny when both orgs known and differ; strict-unit
  must equal `strictUnitId`. RBAC roles (RBAC FIELD_SUPERVISOR without legacy
  `role`) still resolve via `pickUnitFromRbacRoles`.
- SUPERVISOR remains organization-scoped; FIELD_SUPERVISOR remains strictly
  single-unit; the roles are never merged.
- Server-side enforcement only; no reliance on frontend filtering.

### Intended minimal fix (already present; confirmed, not duplicated)
Explicit organization-scoped query predicates at the service/domain boundary plus
fail-closed semantics for unresolved org — reusing the existing RBAC/UnitScope
architecture, not a parallel system.

### Test strategy: `__tests__/5c18-unit-confinement.spec.ts`
7 tests: same-org supervisor success (every `where.type` lookup asserted org-filtered),
different-org supervisor failure (NotFound, schedule never touched),
FIELD_SUPERVISOR same-unit success, FIELD_SUPERVISOR sibling-unit failure (both
must also apply to directAssign — dedicated test), unresolved/NULL org fail-closed
for both operations, publishByUnit + directAssign coverage, and
"the org filter is present on EVERY type lookup (no global resolution path)".
Invalid/nonexistent units resolve through the identical null→404 path exercised
by the cross-org and NULL-org tests.

---

## 7. Files Changed

**Production code changed in this session: none.** (Re-audit proved all three
remaining fixes were already present; per the mandatory workflow a duplicated
fix would have been a regression and was not applied.)

**Tests added in this session (no production impact):**
- `backend/src/modules/schedules/__tests__/5c18-direct-assign-gate.spec.ts`
  — +1 test (unauthorized-role Forbidden gate) → 11 tests.
- `backend/src/modules/schedules/__tests__/5c18-export-worksheet-name.spec.ts`
  — +3 tests (deterministic; sanitize/truncation collision; export-level
  collision safety) → 14 tests.

**Files carrying the pre-existing 5C.18 fixes (verified intact):**
- `backend/src/modules/schedules/schedules.service.ts` — DIRECT-01 + RT-01
  (`directAssign` draft/no-republish gate, `findByUnitType(..., user?)`,
  `resolveTenantScopedUnit`).
- `backend/src/modules/schedules/schedules.controller.ts` — `enforceUnitReadScope`.
- `backend/src/modules/schedules/schedules-export.service.ts` — EXP-01
  (`sanitizeWorksheetName`, safe `resolveUnit`).
- `backend/src/modules/rbac/guards/unit-scope.guard.ts` — RT-01 guard type-branch
  org scoping + `resolveTargetUnit(request, user, opts)`.

**Report:** `docs/phase-5/phase-5c18-implementation-report.md` (this document).

---

## 8. Database / Migration Impact

**NONE.** No schema change, no migration, no destructive database operation was
created or performed. All three fixes and both FE-01 closures are workflow/query/
formatting-level. Not even a convenience migration was needed.

---

## 9. Security Impact

- DIRECT-01 removes a privilege-elevation/audit-bypass surface: a scheduled plan
  can no longer reach `published` outside the four-eyes workflow. Audit records
  stay accurate (no fabricated PUBLISH; CREATE audits carry `autoCreated`).
- RT-01 closes the cross-tenant resolution path at the service boundary and the
  guard layer; NULL/unresolved org contexts fail closed (NotFound/403, never a
  global fallback). No RBAC role was weakened; SUPERVISOR (org-scoped) and
  FIELD_SUPERVISOR (single-unit) remain distinct.
- EXP-01 converts an application-triggerable 500 into a deterministic safe label
  and prevents an arbitrary `unit` string from reaching the Prisma enum (500 → 404).
- No security test threshold was modified; no test was skipped, disabled,
  deleted, or weakened; no guard was weakened; no parallel authorization or
  workflow system was created.

---

## 10. Workflow / Four-eyes Impact

- NONE of the three fixes alter the submit → approve → publish state machine in
  `SchedulesWorkflowService`. `directAssign` can never manufacture an approval or
  publish transition; four-eyes approval remains intact (`5c17-approve-four-eyes`
  still passes 4/4).
- `directAssign` remains a legitimate direct-mutation convenience for
  draft-family plans while respecting the existing `assertNotPublished` gate —
  the same domain rule every other assignment mutation uses.

---

## 11. Test Matrix

### 11.1 DIRECT-01 (`5c18-direct-assign-gate.spec.ts`, 11 tests)
| Required case | Covered |
|---|---|
| directAssign on DRAFT | ✔ status untouched, no force-publish |
| directAssign on UNDER_REVIEW | ✔ status untouched |
| directAssign on REJECTED | ✔ status untouched |
| valid state (missing schedule → draft) | ✔ created `status:'draft'`, no publishedAt |
| unauthorized role | ✔ NEW — technician → Forbidden before any access |
| cross-org/unit attempt | ✔ NotFound (fail closed) + strict-unit sibling NotFound |
| audit behavior | ✔ no PUBLISH audit; CREATE audit = draft/autoCreated |
| expectedVersion/concurrency | ✔ stale → structured 409, tx rollback, no partial write |

### 11.2 EXP-01 (`5c18-export-worksheet-name.spec.ts`, 14 tests)
| Required case | Covered |
|---|---|
| current failing month/year format | ✔ (`${unit} 12/2026`, `/` neutralized) |
| Turkish characters | ✔ Röntgen, Çok Uzun …, 14 supported units |
| all Excel-invalid worksheet characters | ✔ `\ / ? * [ ] :` + control chars |
| >31 character name | ✔ `length ≤ 31` |
| collision after sanitization/truncation | ✔ NEW — two colliding inputs; stable valid 31-char head |
| deterministic output | ✔ NEW — repeated identical output |
| successful export path | ✔ Buffer returned, no `addWorksheet` throw (incl. colliding names) |

### 11.3 RT-01 (`5c18-unit-confinement.spec.ts`, 7 tests)
| Required case | Covered |
|---|---|
| same-org supervisor success | ✔ org-filtered query asserted |
| different-org supervisor failure | ✔ NotFound, schedule never touched |
| FIELD_SUPERVISOR same-unit success | ✔ |
| FIELD_SUPERVISOR different-unit failure | ✔ (publish + directAssign) |
| unresolved/null org fail-closed | ✔ (publish + directAssign), no global lookup |
| invalid/nonexistent unit | ✔ via null-resolution 404 path (cross-org/NULL-org tests) |
| publishByUnit | ✔ |
| directAssign | ✔ |
| no cross-tenant data leakage | ✔ org filter asserted on EVERY type lookup |

### 11.4 FE-01 (unchanged, re-verified) — `schedule-service.version.spec.ts` (10)
+ `api-service.transport.spec.ts` (5) — **15/15**.

---

## 12. Backend Validation

| Gate | Result |
|------|--------|
| Targeted 5C.18 suites (`5c18-direct-assign-gate`, `5c18-export-worksheet-name`, `5c18-unit-confinement`) | 3 files / **32 tests PASS** |
| `npx tsc --noEmit` | PASS (clean) |
| `npm run build` (nest build) | PASS |
| `npx vitest run` (full) | 88 files — 87 pass / 1 fail |
|                                   | **954 PASS / 10 FAIL** — all 10 in `device-off.spec.ts` (live Postgres at localhost:5432, environmental, PRE-EXISTING, untouched) |

---

## 13. Frontend Validation

| Gate | Result |
|------|--------|
| FE-01 vitest (`schedule-service.version` + `api-service.transport`) | 2 files / **15 tests PASS** |
| `npm run typecheck` (`npx tsc --noEmit`) | PASS (clean) |
| `npm run build` (ng build, production) | PASS — bundle complete; pre-existing budget/NG8107 warnings only (initial total 626.68 kB, unchanged from FE-01 validation baseline) |
| `npx vitest run` (full FE) | 12 files — 4 pass / 8 fail |

---

## 14. Known Environment / Pre-existing Test Disclosures

### 14.1 Backend (environmental, NOT modified)
- `device-off.spec.ts` (10 tests): requires a live PostgreSQL at localhost:5432.
  Unreachable here → `PrismaClientInitializationError`. Pre-existing, untouched,
  disclosed as environment, NOT a new regression.

### 14.2 Frontend (pre-existing, NOT modified)
The FE vitest infrastructure was repaired in the FE-01 step (jsdom +
`src/test-setup.ts` via `@angular/platform-browser/testing`, the Angular 21
replacement for the removed `@angular/platform-browser-dynamic`). This made
previously non-runnable Angular specs execute for the first time. The 8 failing
files (48 tests) are all pre-existing, verified unrelated to any 5C.18 finding:
| Spec file | Failure class |
|---|---|
| `components/reports/__tests__/reports.component.spec.ts` | Broken import `../../../../core/state` |
| `services/__tests__/schedule-api.integration.spec.ts` | Stale `/api` URLs (app is `/api/v1`), missing `resetTestingModule`, envelope fixtures |
| `services/__tests__/device-api.integration.spec.ts` | Stale `/api/devices` matchers |
| `services/__tests__/device-incidents.service.spec.ts` | Wrong injected service instance |
| `services/__tests__/pwa.service.spec.ts` | NG0201 missing `SwPush` provider |
| `services/__tests__/authorization.service.spec.ts` | Missing `resetTestingModule`, stale assertions |
| `components/device-incidents/.../device-incident-report.component.spec.ts` | Stale component API (signals) |
| `components/pwa-install-prompt/.../pwa-install-prompt.component.spec.ts` | NG0201 missing `SwPush` provider |

These are documented for review; fixing them is explicitly OUT of scope
(no test deletion, no `.skip`, no threshold lowering).

---

## 15. Phase 5C.17 Regression Validation

Explicitly re-checked (full-run evidence this session; all PASS):
| 5C.17 fix | Guard spec | Tests | Result |
|---|---|---|---|
| Personnel organization isolation | `5c17-personnel-scope.spec.ts` | 17 | PASS |
| Device organization isolation | `5c17-devices-scope.spec.ts` | 8 | PASS |
| Status mutation protection | `dto/5c17-update-status-gate.spec.ts` | 5 | PASS |
| Published-plan mutation protection | `5c17-published-mutation-gate.spec.ts` | 8 | PASS |
| Rollback / swap-request behavior | `5c17-rollback-swap-preservation.spec.ts` | 5 | PASS |
| Export behavior (incl. scope) | `5c17-export-unit-resolution.spec.ts`, `5c9-export-scope.spec.ts` | 6+6 | PASS |
| Four-eyes workflow | `5c17-approve-four-eyes.spec.ts` | 4 | PASS |
| FE expectedVersion transport | `schedule-service.version` + `api-service.transport` (FE) | 15 | PASS |
| RBAC role dominance / org containment | `5c11-authz-consistency.spec.ts`, `unit-scope-guard-failclosed.spec.ts`, `5c10-device-off-swap-scope.spec.ts`, `5c12-ownership-hardening.spec.ts` | 25+3+12+14 | PASS |

Supporting invariants also green: `5c6-hardening` (7), `5c15-sec-b-expected-version`
(3), `security-invariants` (12), `5c15-sec-f-cross-endpoint` (30).
→ **All seven Phase 5C.17 fixes remain intact.**

---

## 16. Remaining P2/P3 Backlog — DOCUMENT ONLY, DO NOT IMPLEMENT

| ID | Item |
|----|------|
| WF-01 | Workflow-event dispatch on directAssign expectations (deferred) |
| OFF-01 | Device-off vs schedule wiring |
| SWAP-01 | Assignment swap UX |
| DUAL-01 | Dual API client consolidation |
| RBAC-01 | RBAC role→permission matrix review |
| EXP-02 | Export metadata/ROWs extension |
| RACE-01 | Race-window test on `bumpScheduleVersion` under high concurrency |
| OFF-02 | Device-off validations in assign paths |
| WMISC-03 | Miscellaneous worksheet polish |
| C-01 | Conflict-dialog close/reload flow UX |
| DUAL-02 | `{success,data}` envelope contract alignment (NOT refactored; test fixtures aligned to the direct contract) |

---

## 17. Final Verdict

**PASS WITH WARNINGS.**

- DIRECT-01: FIXED and validated (11 tests incl. mandated unauthorized-role gate).
- EXP-01: FIXED and validated (14 tests incl. mandated deterministic + collision cases).
- RT-01: FIXED and validated (7 tests; org containment + NULL-org fail-closed at
  service and guard layers).
- FE-01: CLOSED (15/15, unchanged).
- No schema/migration impact. No test skipped/weakened/deleted. No guard weakened.
- Warnings (non-blocking, disclosed above): backend `device-off` 10 failures are
  environment-only (live Postgres); 8 pre-existing frontend spec files (48 tests)
  were never runnable before the FE-01 infra repair and remain disclosed out-of-scope.

The underlying security/workflow requirements are satisfied by the code
(gate + org-scoped queries) — the verdict is not merely a test-pass.

---

STOP — Phase 5C.18 remaining P1 implementation complete; awaiting review.