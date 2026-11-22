# Phase 5C.18 — Release Candidate / System Integrity Audit Report

**Audit type:** Read-only release-candidate + system-integrity audit
**Status:** COMPLETE
**Verdict (implementation gate):** **READY WITH CONDITIONS**
**Date:** 2026-09-09
**Repository audited:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (authoritative copy)

> Applies to VardiyaOS. This audit is READ-ONLY: no code, test, schema, or migration was
> modified; no database write was executed; no git mutation was performed; no server was
> restarted. Only inspection and execution of pre-existing test/build suites occurred.

---

## 1. Executive Summary & Verdict

Phase 5C.18 audited the full production surface of VardiyaOS after Phase 5C.17 closed all
seven security/workflow findings. The audit re-ran the complete test/build evidence,
deep-verified the system-actor four-eyes fix, traced the entire schedule workflow
end-to-end, inventoried every schedule mutation endpoint with an authorization matrix,
walked five hospital user journeys, and audit-searched device-off, swap, export, performance,
frontend state, production configuration, and the security regression matrix.

**Result: No confirmed P0 finding.** Findings below include four P1s, eight P2s, and three
P3s. The P1 set contains one production-blocker for a shipped feature (Excel export always
fails on the worksheet-name `/`), one workflow-integrity gap (quick-assign auto-publish
bypasses the approval model on non-published schedules), one optimistic-concurrency gap in
the legacy UI (silent lost updates), and one defense-in-depth tenant-boundary gap inside
service-layer unit resolution.

Several sub-agent P0/P1 claims were **rejected after principal verification** because they
were based on stale duplicate code (e.g. a claimed `status` field in
`update-schedule.dto.ts`, claimed four-eyes violation in `publishByUnit`, claimed
direct-status writes in `update()`). Those are false against the authoritative tree; the
report documents the verified reality instead.

```
IMPLEMENTATION GATE = READY WITH CONDITIONS
```

Conditions (each mapped to an explicit remediation step + required test in Section 18):
1. EXP-01 (Excel export) must be fixed or the export endpoint must return a controlled 501
   until fixed — the Excel export is currently guaranteed to throw.
2. DIRECT-01 (quick-assign auto-publish) must be re-scoped or gated by an explicit
   four-eyes-compatible consent path.
3. FE-01 (legacy UI missing `expectedVersion`) must be closed before concurrent multi-user
   editing is allowed in production without supervision.
4. Total 922 unit tests pass (excluding the DB-backed `device-off.spec.ts`, which requires a
   live Postgres); BE tsc, `nest build`, FE tsc, and `ng build --configuration production`
   all pass.

If the steering group cannot accept conditions 1–4, the gate becomes BLOCKED at GO-LIVE,
not at this audit: the system is auditable and deployable for production *after* the
condition set is executed.

---

## 2. Scope, Method, and Constraints

- **Mode:** read-only. Constraints honored: no implementation, no test creation/modification/
  deletion/skip, no assertion loosening, no migration, no schema change, no DB write, no
  git reset/restore/clean/checkout/force-push/commit, no server restart.
- **Allowed:** file inspection, running the pre-existing test suite and existing builds.
- **Method:** parallel sub-agent deep-dives across 14 audit parts, followed by principal
  re-verification of every P0/P1 claim against the authoritative source tree (line-level
  reads of guards, DTOs, services, controllers, schema, and frontend service).
- **Evidence base:**
  - Backend vitest (excl. `device-off.spec.ts`): **84 files / 922 tests PASS**.
  - Schedules folder alone: **36 files / 421 tests PASS**.
  - All seven 5C.17 specs: **53 tests PASS**; `schedules.service.spec.ts` publishByUnit
    four-eyes describe: **2 tests PASS**; combined approve-four-eyes + publishByUnit: **29 PASS**.
  - BE `tsc`, `nest build` CLEAN. FE `tsc`, `ng build --configuration production` CLEAN
    (pre-existing bundle-size warnings only).
  - `device-off.spec.ts` is a Phase 5C.2 real-Prisma integration test needing Postgres at
    `localhost:5432` (`PrismaClientInitializationError: Can't reach database server`).
    Environmental, not a regression.
  - `schema.prisma` unchanged by 5C.17/5C.18.

---

## 3. Repository Identity & Verification

- Authoritative tree: `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (reparse point;
  `schedules.service.ts` = 84,975 bytes; contains all 5C.17 specs and reports).
- Stale duplicate: `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
  (`schedules.service.ts` = 75,247 bytes; missing 5C.17 specs). Both are git repos at the
  single initial commit `eb7a6db`. **All audit evidence in this report is from the Desktop
  authoritative tree.** IDE working directory defaulting to `Belgeler` was overridden for
  every tool call.
- Duplicate-tree risk inside the authoritative tree was inspected: only one
  `schedules.service.ts` exists under `backend/`. There is no `src/src` or
  `schedules/schedules/` duplicate under `backend/src/modules/schedules`.

---

## 4. Part 1 — 5C.17 Regression Re-verification Matrix

Principal re-verification of all seven Phase 5C.17 fixes (state: PASS throughout).

| ID | 5C.17 Fix | Status | Evidence |
|----|-----------|--------|----------|
| AU-01 | Personnel routes org-scoped (all 6) | PASS | `personnel.controller.ts` `@UseGuards(JwtAuthGuard, RolesGuard, UnitScopeGuard)`; `findAll`/`findByUnitCode` scope via unit/org; 5c17 personnel spec 17 tests pass; 5c14/5c15/C.9 scope specs pass |
| AU-02 | Device routes org-scoped (findAll/findByUnitCode) | PASS | devices controller guard set + scoped queries; 5c17 devices spec 8 tests pass |
| UA4-1 | Unknown-device idempotent 422 | PASS | assignment validation unknown-device guard; related specs green |
| UA8-1 | Assignment `expectedVersion` + published-edit gate | PASS | `assertNotPublished` + `bumpScheduleVersion(tx,id,expectedVersion)` in add/override/update/remove; `5c17-published-mutation-gate` 8 tests, `5c15-sec-b` green |
| UA5-1 | Rollback preserves SwapRequest via cancel-first | PASS | `schedules-workflow.service.ts:409-432` cancel before delete; `5c17-rollback-swap-preservation` 5 tests green (see SWAP-01 residual) |
| UA6-1 | Export unit resolution + tests | PASS | `resolveUnit`/`getExportData`; `5c17-export-unit-resolution` 6 tests green (see EXP-01 residual) |
| UA3-1 | Publish four-eyes via distinct system actor | PASS | `publishByUnit` submit as real user, approve/publish as `system-schedule-autopublish`; `5c17-approve-four-eyes` 4 tests + publishByUnit 2 tests green |

Regression sweep: all schedules-only specs that touch the seven areas executed and passed
as part of the 922-test run. No regression observed against the 5C.16 baseline.

---

## 5. Part 2 — System Actor / Four-Eyes Deep Analysis (10 Questions)

System actor (verified, `schedules.service.ts:511-523`):
`{ id: 'system-schedule-autopublish', email: 'system@vardiyasystem.local', name: 'Sistem
(Otomatik Yayın)', role: user.role, organizationId: user.organizationId, unitId: user.unitId }`.

1. **Can the submitter approve their own submission?** No. `approve()` throws
   `ForbiddenException` when `approval.submittedBy === user.id`
   (`schedules-workflow.service.ts:141-143`). The system actor has a distinct id, so the
   submitter can never pass as approver.
2. **Can the system actor be spoofed at the boundary?** No — it exists only as an internal
   `UserContext` object; the JWT strategy cannot mint it (no such user row, not signable).
3. **Does the system actor bypass role gates?** It copies `user.role`, so `canApprove`
   (IMAGING_DIRECTOR, SUPERVISOR, system_admin, hospital_admin) and `canPublish`
   (IMAGING_DIRECTOR, system_admin, hospital_admin) are evaluated against the **acting
   user's** role; no role is invented. Verified `schedule-status.ts` sets unchanged.
4. **Auditability:** `submittedBy` = acting user, `approvedBy` = system actor id; both are
   persisted in `WorkflowApproval` and audited. Reviewer can distinguish human vs auto.
5. **Does publishByUnit shortcut four-eyes?** Architecturally yes (this is the accepted
   convenience, user-approved in 5C.17), but invariants are preserved: distinct actor,
   submission recorded, publish only under `canPublish` role.
6. **Cross-tenant reach of the unit lookup:** `unit.findFirst({ where: { type } })`
   (`schedules.service.ts:455-457`) has **no org filter**; tenant isolation relies on
   `UnitScopeGuard` at the controller (RBAC fail-closed for strictly-scoped actors,
   org-check for all roles when both orgs are known). Service methods are therefore
   guard-dependent. Residual risks are captured as RT-01.
7. **rejected/archived → draft reset in publishByUnit** (`schedules.service.ts:537-548`)
   writes status directly (bypasses workflow transition helpers) then immediately
   re-submits. Acceptable within its convenience flow; version/approval trail intact.
8. **Error path:** catch block re-writes old status outside the success transaction
   (`554-557`). Fire-and-forget; noted as WMISC-03/P3.
9. **Can a lower-privilege user reach publishByUnit?** Route is
   `@Roles(MinRole.HEAD_TECHNICIAN)` (controller 228-230); service additionally enforces
   `canPublish(user.role)` (451) → effective publisher set = imaging_director /
   system_admin / hospital_admin. No bypass.
10. **Test coverage of the dichotomy:** approve-four-eyes + publishByUnit specs execute both
    the actor-distinctness and the role-gate paths; 29 tests green.

---

## 6. Part 3 — Workflow Integrity Trace (DRAFT → SUBMIT → APPROVE → PUBLISH → OPERATE → ROLLBACK → ARCHIVE)

Chain (active production paths underlined):

- **create / update (assignments only):** `schedules.controller.ts` + `schedules.service.ts`
  `create()`/`update()`; `update` handles assignments only (`update-schedule.dto.ts` has no
  status field — verified). DDD twin uses `schedule-application.service` + aggregate.
- **submitForReview / approve / reject / publish / archive / rollback:** shared
  `schedules-workflow.service.ts` wired from BOTH the legacy controller
  (`schedules.controller.ts:508-569`) and exposed with `@Permissions` from the DDD
  controller via `schedule-application.service.ts`.
- **Invariants verified:**
  - `isEditable` gate protects update/updateAssignment/addAssignment/removeAssignment/
    overrideAssignment (published/archived → 403/409).
  - `approve` enforces four-eyes (distinct actor) and `canApprove`.
  - `publish` enforces `canPublish` + snapshot before publish
    (`schedules-workflow.service.ts:281`).
  - `rollback` (workflow) requires editable status, cancels affected swaps, re-applies
    snapshot, single version increment, audit with `cancelledSwapIds`.
  - `archive` requires no published-schedule mutation afterwards.
  - **Divergence found:** DDD application rollback requires **published** status
    (`schedule-application.service.ts:223`), while workflow rollback requires
    **non-published** (`schedules-workflow.service.ts:393-397`). Two active paths with
    opposite semantics — see DUAL-01.
- **Versioning:** single bump per mutation through `bumpScheduleVersion` in the service
  paths; aggregate path uses `repo.save(schedule, expectedVersion)`. Orphan legacy
  `schedules.service.rollback` (double bump) is not route-wired — see RACE-01.

Trace verdict: the primary DRAFT→…→ARCHIVE chain is intact and four-eyes-compatible in both
active controller trees, with the exceptions documented as findings.

---

## 7. Part 4 — Mutation Endpoint Inventory & Authorization Matrix

All route-level controls verified by direct annotation read.

| Endpoint (legacy controller) | Role (MinRole) | UnitScope | Service gate | Version | Audit |
|---|---|---|---|---|---|
| POST /schedules/:id/assignments | HEAD_TECHNICIAN | entity (id) | assertNotPublished + bump(bump w/ expectedVersion) | opt-in | yes |
| POST /schedules/:id/assignments/override | HEAD_TECHNICIAN | entity (id) | assertNotPublished + bump | opt-in | yes |
| PUT /schedules/:id/assignments/:assignmentId | HEAD_TECHNICIAN | entity (id) | assertNotPublished + bump | opt-in | yes |
| DELETE /schedules/:id/assignments/:assignmentId | HEAD_TECHNICIAN | entity (id) | assertNotPublished + bump | opt-in | yes |
| POST /schedules/direct-assign | SENIOR_TECHNICIAN | unitType | canDirectAssign; **auto-publishes** | opt-in | yes (CREATE/PUBLISH log) |
| POST /schedules/unit/:unit/publish | HEAD_TECHNICIAN | unitParam | canPublish (+system actor) | n/a | yes (submit/approve/publish) |
| POST /schedules/:id/submit /approve /reject /publish /archive /rollback /revision | SUPERVISOR→IMAGING_DIRECTOR per op | entity (id) | workflow gates incl. four-eyes | workflow version | yes |
| DELETE /schedules/:id | HEAD_TECHNICIAN | entity (id) | status gate | opt-in | yes |
| POST /device-off (DDD/swap module) | FIELD_SUPERVISOR | entity | device–unit bond check | none | partial |

| Endpoint (DDD controller) | Role | Permissions | Version | Workflow |
|---|---|---|---|---|
| POST /schedules | SUPERVISOR | schedule.create | expectedVersion | — |
| POST/PUT/DELETE assignment ops | SUPERVISOR | schedule.update/override | expectedVersion | aggregate gate |
| submit/approve/reject/publish/archive/revertToDraft/rollback | SUPERVISOR→IMAGING_DIRECTOR/HOSPITAL_ADMIN | schedule.* | expectedVersion | aggregate (rollback: published-only) |

**RBAC gap:** legacy controller has **zero** `@Permissions` decorators (all 31 routes use
`@Roles` only) while DDD uses `@Permissions` on every route; the global `PermissionGuard`
passes silently when no decorator is present. `RolesGuard` still enforces MinRole on legacy
routes, so this is policy-consistency/audit asymmetry, not an active bypass — RBAC-01.

---

## 8. Part 5 — Hospital User Journeys (Flows A–E)

Walked against controller+service wire-up (outputs are the code paths + defect references).

- **Flow A — Supervisor edits draft then submits (201):** assign → submit → approve → publish.
  Verified gates: assignment validation (A1/A2 personnel present), override capability only
  for OVERRIDE_ROLES, `isEditable`, four-eyes, snapshot-before-publish. **PASS.** Concurrency
  caveat: FE omits `expectedVersion` → FE-01.
- **Flow B — 401/403 session expiry mid-edit:** JWT + RolesGuard + ScheduleAccessGuard +
  UnitScopeGuard chain rejects; schedule version unchanged (no partial DB write for failed
  guard). 401 handled by FE `ApiError`/auth interceptor. **PASS;**
  ScheduleAccessGuard fail-open when no id — WF-01 (P2).
- **Flow C — Network failure after submit:** workflow ops are transactional; a lost response
  does not double-apply (idempotency present in DDD application service via
  `checkIdempotency`); legacy workflow retries would re-evaluate from snapshot — safe but
  could double-version on blind retry (client-driven). **PASS w/ note** → C-01 (P3).
- **Flow D — Duplicate assignment / double-click:** server-side validation prevents
  double-booking; version bump is atomic; without `expectedVersion` (FE-01) the last-write
  wins silently instead of 409. **PARTIAL — driven by FE-01.**
- **Flow E — Editing a published schedule:** direct assignment mutation blocked by
  `assertNotPublished` (409/403); controlled path = createRevision → edit → submit →
  approve → publish. Covered by `5c17-published-mutation-gate`. **PASS.** Exceptional path:
  `toggleDeviceOff` may still mutate `DeviceOffDate` on published schedules — OFF-01 (P2).

---

## 9. Part 6 — Device-Off Audit

- `toggleDeviceOff` (`schedules.service.ts:2367-2446`) validates device belongs to schedule,
  date format, date-in-month, and rejects if active assignments exist. Direct writes to
  `DeviceOffDate` are reflected by generator/assignment validation.
- **Gaps:** no `assertNotPublished`/published-state gate (OFF-01, P2 — operations data can
  be changed on a published schedule without an edit window); no `expectedVersion` /
  optimistic locking (OFF-02, P3); scope relies on `UnitScopeGuard` route setup (guarded in
  device module per 5c10 spec — PASS).
- Code cross-check: mobile/PA does not silently consume off-dates outside the intended
  bounds; no cross-tenant device path found.

---

## 10. Part 7 — Swap Lifecycle Audit

- Swap create/approve/reject in `swap-requests.controller.ts` protected by
  `RolesGuard + UnitScopeGuard` (5c10 security spec green).
- **Rollback integration (active path):** `schedules-workflow.service.ts:409-432` cancels
  affected swaps (by from/to assignment) inside the rollback transaction, then re-applies
  the snapshot; audit includes `cancelledSwapIds`.
- **Residual:** `SwapRequest.fromAssignment` is `onDelete: Cascade`
  (`schema.prisma:1024`). Because rollback **deletes** the referenced assignments after the
  status update, the cascade still deletes the (now-CANCELLED) swap rows — the swap history
  rows do not survive; only `cancelledSwapIds` in the ROLLBACK audit entry persist
  (SWAP-01, P2). The `toAssignment` side is `SetNull`, unaffected.

---

## 11. Part 8 — Export Audit

- Excel: `exportExcel` builds worksheet name `\`${data.unitName} ${month}/${year}\``
  (`schedules-export.service.ts:18`). `/` is illegal in ExcelJS worksheet names → every
  Excel export throws and returns 500. **EXP-01 (P1)** — production blocker for the feature.
- PDF: `PDFKit` default (Helvetica) does not render Turkish characters correctly → garbled
  output for names/days (EXP-02, P2).
- Unit resolution for export uses `resolveUnit`/`getExportData` (UA6-1) and is org-scoped via
  controller guards; 5c17 export scope spec + 5c9 export scope spec green.

---

## 12. Part 9 — Performance & Concurrency

- **Measured:** 922 tests pass; `5b3-quality-gates`, `5b3-scoring-quality`,
  `5b3-performance-failure` (solver failure paths) green — optimizer failure modes are
  handled without dangling partial schedules.
- **Solver scale:** target scale (50+ devices, 100+ personnel, thousands of assignments)
  exercised by 5B optimizer safety tests; no autobahn blocking signatures in the solver
  (dropouts, retries bounded by job status service).
- **Concurrency:** optimistic locking present in DDD path and optional in legacy path;
  `lockService.withLock` guards DDD rollback; single `$transaction` scope for snapshot
  re-apply + version bump. Residual = FE-01 (no client-side version on legacy UI),
  RACE-01 (orphan double-bump method), and device-off without conflict detection.
- **DB health:** `device-off.spec.ts` needs live Postgres to run (environmental). Connection
  pool/caching hardened in Phase 4 (docs/phase-4/performance-connection-pool-cache.md).

---

## 13. Part 10 — Frontend State Integrity

- DDD/Signal-driven scheduling UI (`schedule-api.service.ts`) sends `expectedVersion` via
  `buildVersionParams` on assignment + workflow ops → conflict-safe UI (409 surfaced).
- **Legacy services (used by `firevibe-schedule`, plan-page, person-assignment):**
  `assignPersonnel`, `assignOverride`, `assignPersonShift`, `directAssign`,
  `updateAssignment`, `deleteAssignment` all call the API **without** `expectedVersion`
  (`frontend/src/app/services/schedule.service.ts:525,562,594,632,706,743`). Server-side
  enforcement is opt-in (absent = bump-without-precondition). Consequence: concurrent editors
  silently overwrite; no 409. **FE-01 (P1).**
- State stores are Signal/BehaviorSubject based; mutation handlers update caches
  optimistically; with FE-01 the server response R is authoritative but stale writes persist.
- WebSocket-driven refresh (`personnel:update`, schedule updates) mitigates visibility, not
  write conflicts.

---

## 14. Part 11 — Production Configuration

Verified production hardening (Phase 4 + 5A+) — all PASS:

- Global `/api` prefix + URI versioning; compression enabled.
- Helmet + HSTS + CSP headers configured.
- `ValidationPipe` hardened: `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`.
- CORS pinned to a single configured origin.
- RBAC: global `PermissionGuard` + `RolesGuard` with `@Permissions` on DDD routes;
  `UnitScopeGuard` (unit resolution + org isolation) fail-closed for strictly scoped roles.
- Secrets via env; no secrets committed (Phase 4 secret scan clean).
- Audit log service on mutations; outbox/event pattern documented in Phase 4.

---

## 15. Part 12 — Frontend Architecture (Production-Relevant Orphans)

- Two parallel API access layers exist (legacy `services/schedule.service.ts` vs DDD
  `schedule-api.service.ts`). Both are wired; legacy remains the primary for
  firevibe/plan/person-assignment flows. Double-maintenance risk (DUAL-02, P3) but no
  dead-orchestrator file that bypasses guards.
- Orphan legacy `SchedulesService.rollback` (`schedules.service.ts:1969`) is **not**
  reachable from any route (controllers call workflow/app-service rollback). It double-bumps
  version and does not cancel swaps → regression trap if revived (RACE-01).
- No evidence of route-dead orphan components that could mislead production behavior;
  per `frontend-architecture.md` the legacy tree is slated for migration-off, which raises
  FE-01 migration urgency.

---

## 16. Part 13 — Security Regression Matrix (7 fixes vs red-team attempts)

| Attack | 5C.17 fix | Result |
|---|---|---|
| orgA → orgB personnel list | AU-01 | BLOCKED |
| orgA → orgB device list | AU-02 | BLOCKED |
| assign unknown device | UA4-1 | 422 idempotent |
| edit published schedule assignments | UA8-1 | BLOCKED (assertNotPublished) |
| rollback that silently drops swap evidence | UA5-1 | cancel-first (residual SWAP-01) |
| export across units | UA6-1 | org-scoped |
| submitter approves own submission | UA3-1 | BLOCKED (four-eyes) — absent only in accepted system-actor convenience flow |
| orgA → orgB unit by type (publishByUnit/directAssign) | n/a | Blocked at guard when both orgs known; NULL-org soft spot → RT-01 (P2) |
| quick-assign publish bypass on draft/rejected | n/a | OPEN → DIRECT-01 (P1) |
| legacy UI stale overwrite | n/a | OPEN → FE-01 (P1) |

---

## 17. Part 14 — Findings Ledger (sorted by severity)

### P1

#### EXP-01 — Excel export always fails (production blocker)
- **Component:** `SchedulesExportService.exportExcel`
- **Endpoint:** `GET /schedules/export/unit/:unit?month=&year=` (Excel)
- **Root Cause:** worksheet name is `\`${data.unitName} ${month}/${year}\`` — `/` is illegal
  in ExcelJS worksheet names.
- **Impact:** every Excel export throws → 500. Feature unusable in production.
- **Exploitability:** deterministic; reproducible on any valid export request.
- **Evidence:** `schedules-export.service.ts:18`. ExcelJS rejects `/`,`\`,`*`,`?`,`:`,`[`,`]`.
  The 5C.17 export tests intentionally bypass this by calling private `getExportData`.
- **Recommended Fix:** sanitize worksheet name (e.g. `YYYY-MM` or replace `/` with `-`).
- **Test Requirement:** integration test calling `exportExcel` end-to-end asserting a
  workbook is produced; plus unit assertions on the sanitized name.
- **Regression Risk:** low (name derivation only).

#### DIRECT-01 — Quick-assign auto-publish bypasses approval workflow
- **Component:** `SchedulesService.directAssign` + legacy route
- **Endpoint:** `POST /schedules/direct-assign`
- **Root Cause:** when a schedule exists in draft/under_review/rejected/approved, directAssign
  force-updates `status → published` + `publishedAt` directly
  (`schedules.service.ts:1572-1589`); new schedules are created already published.
- **Impact:** any SENIOR_TECHNICIAN+ can flip a draft/rejected schedule to published without
  submit→approve→publish, defeating the four-eyes/approval model for that schedule and leaving
  an under_review schedule publicly operative. Version bump occurs but no approval record.
- **Exploitability:** authenticated staff ≥ senior_technician within unit scope; deliberate
  feature but permission/model mismatch.
- **Evidence:** controller documents intent ("auto-creates/publishes if needed",
  `schedules.controller.ts:243-244`); `schedules.service.ts:1552-1589`; conflict with
  `canPublish`-only model (schedule-status.ts).
- **Recommended Fix:** route quick-assign through the normal workflow when schedule status is
  non-draft (reject with a hint to use the planner), or require an explicit PUBLISH consent
  parameter and write a workflow approval record for the auto-publish.
- **Test Requirement:** spec asserting draft/under_review/rejected schedules are NOT published
  by quick-assign unless consent given; consent path records approval.
- **Regression Risk:** medium (affects the fast-assign UX).

#### FE-01 — Legacy UI omits `expectedVersion` on all assignment mutations
- **Component:** `frontend/src/app/services/schedule.service.ts` (legacy layer used by
  firevibe-schedule, plan-page, person-assignment)
- **Endpoint:** POST/PUT/DELETE `/schedules/:id/assignments*`, POST `/direct-assign`,
  POST `/assignments/override`
- **Root Cause:** the six mutation calls send no `expectedVersion`; backend serves the legacy
  endpoints with opt-in version precondition.
- **Impact:** concurrent editors silently overwrite each other; no 409 conflict UX; the
  5C.15 hardening is bypassed by the primary UI.
- **Exploitability:** any two concurrent authorized editors.
- **Evidence:** `schedule.service.ts:525,562,594,632,706,743` (no version param);
  backend optional `expectedVersion` (`schedules.controller.ts:441-483`).
- **Recommended Fix:** thread the schedule `version` (from the loaded schedule/aggregate)
  into all six calls; surface 409 to the user.
- **Test Requirement:** FE unit asserting a version query param on each mutation; BE e2e
  proving stale version → 409 when provided.
- **Regression Risk:** medium (requires FE/BE coordination) — do before multi-user go-live.

#### RT-01 — Service-layer unit resolution lacks org filter (guard-dependent isolation)
- **Component:** `SchedulesService.publishByUnit`, `SchedulesService.directAssign`,
  `UnitScopeGuard.toUnitId`
- **Endpoint:** POST `/schedules/unit/:unit/publish`, POST `/schedules/direct-assign`
- **Root Cause:** unit resolved by `type` via `findFirst` with no org predicate
  (`schedules.service.ts:455-457, 1541-1543`; guard `toUnitId` same pattern). Isolation is
  delegated to `UnitScopeGuard.canAccessUnit`, which enforces org only when **both** orgs are
  known; when target org is NULL (legacy/unmigrated units) the org check is skipped for
  non-strictly-scoped roles.
- **Impact:** in org-populated tenants the HTTP path is blocked (guard). Residual risk: unit
  ambiguity (first match of a type across orgs), NULL-org units cross-mutable, and any
  non-HTTP caller of the services bypasses the boundary entirely.
- **Exploitability:** low in fully-migrated tenants; medium in mixed/NULL-org deployments;
  guard-layer dependence is fragile.
- **Evidence:** unit-scope.guard.ts:110 (`findFirst by type`), unit-scope.service.ts:93-98
  (org check requires both non-null).
- **Recommended Fix:** add org filter (`organizationId: user.organizationId`) to service-level
  unit lookups using `UnitScopeService.resolveReadScope`/explicit org predicate; treat
  NULL-org units as no-access for org-scoped actors.
- **Test Requirement:** unit + e2e: orgA vs orgB same-unit-type cannot resolve each other's
  unit even with NULL-target-org.
- **Regression Risk:** low–medium (legacy NULL-org deployments must be migrated first).

### P2

- **WF-01 — ScheduleAccessGuard fails open on missing id:** `if (!scheduleId) return true`
  (`schedule-access.guard.ts:36-38`) contradicts its documented fail-closed model. Current
  routes compensate with service-level org scoping + UnitScopeGuard, so exposure is
  defense-in-depth, not active. Fix: fail closed for listed routes; keep exception list
  explicit. Test: guard spec for id-less routes.
- **OFF-01 — toggleDeviceOff has no published-state/version gate:** `DeviceOffDate` can be
  changed on published schedules with no version bump and no conflict detection
  (`schedules.service.ts:2367-2446`). Acceptable for OPERATE convenience if intended;
  otherwise add `isEditable`-style gate + version. Test: published-schedule device-off spec.
- **SWAP-01 — Rollback swap-history rows are still cascade-deleted:** cancel-first is applied
  but `fromAssignment onDelete: Cascade` (schema.prisma:1024) deletes the canceled rows when
  assignments are re-applied; only `cancelledSwapIds` survive in the audit entry
  (`schedules-workflow.service.ts:411-478`). Fix: `onDelete: SetNull` on fromAssignment (schema
  + migration) or snapshot swap rows. Test: DB-level integration verifying swap rows persist
  after rollback.
- **DUAL-01 — Rollback semantics diverge between active paths:** workflow rollback requires
  non-published (`schedules-workflow.service.ts:393-397`); DDD application rollback requires
  published (`schedule-application.service.ts:223`). Both are live. Standardize the invariant
  and add a cross-path e2e.
- **RBAC-01 — Legacy controller lacks `@Permissions`:** 31 legacy routes use `@Roles` only;
  0 route has `@Permissions`, while DDD 100%. PermissionGuard silent-passes when absent. Fix:
  align legacy routes with permission decorators and a policy matrix test.
- **EXP-02 — PDFKit default font garbles Turkish:** PDF export unusable for Turkish names/days.
  Fix: register a Turkish-capable TTF font. Test: PDF text extraction or SVG snapshot.
- **RACE-01 — Orphan legacy rollback double-bumps version and drops swap-cancel:** the method
  exists and is unreachable, but if revived it increments twice
  (`bumpScheduleVersion` 2008 + `increment:1` 2013) and never cancels swaps. Fix: delete it
  or route it through the workflow. Test: port assertions from workflow rollback.
- **OFF-02 — No optimistic locking on DeviceOffDate toggle:** separate from OFF-01; add
  conflict detection.

### P3

- **WMISC-03 — publishByUnit error path re-writes status outside transaction**
  (fire-and-forget catch, `schedules.service.ts:553-558`).
- **C-01 — Blind client retry of submit/publish could double-version on legacy workflow**
  (DDD path has idempotency; legacy relies on server-side status re-checks).
- **DUAL-02 — Two active frontend API layers** (legacy + DDD) with differing versioning
  behavior; migration-off of legacy layer is the durable fix for FE-01/DUAL-01/DUAL-02.

---

## 18. Remediation Sequence + Required Tests

Ordered for production readiness (each gated by its test):

1. **EXP-01** (Excel worksheet name) — trivial, ship first. Test: end-to-end workbook output.
2. **FE-01** (legacy UI `expectedVersion`) — highest user-visible data-integrity risk. FE unit
   param assertions + BE 409 e2e when stale.
3. **DIRECT-01** (quick-assign publish consent) — product decision + workflow record.
4. **RT-01** (org-filtered unit lookup + NULL-org migration).
5. **SWAP-01** (SetNull) — needs schema migration (breaks 5C.17 "no migration" rule, i.e. it
   is the ONLY schema-touching remediation; plan a controlled migration in a separate change).
6. **WF-01, OFF-01/02, DUAL-01, RBAC-01, EXP-02, RACE-01** — hardening batch; all have
   defined tests above. None block go-live if documented and monitored.

Invariants to preserve through remediation: four-eyes publish (UA3-1), published-schedule
edit gate (UA8-1), rollback swap evidence (UA5-1), org-scoped personnel/devices
(AU-01/AU-02), export unit scope (UA6-1). No schema change is permitted inside 5C.18.

---

## 19. Final Verdict

- **Confirmed P0:** none.
- **P1:** 4 — EXP-01, DIRECT-01, FE-01, RT-01.
- **P2:** 8 — WF-01, OFF-01, SWAP-01, DUAL-01, RBAC-01, EXP-02, RACE-01, OFF-02.
- **P3:** 3 — WMISC-03, C-01, DUAL-02.
- **Invariants preserved:** all seven 5C.17 fixes remain effective; 922 unit tests pass
  (excluding the DB-backed Postgres-requiring `device-off.spec.ts`); BE tsc, `nest build`,
  FE tsc, and production `ng build` are clean; `schema.prisma` unchanged.

The write-side approval model, tenant guards, aggregate domain core, optimistic-locking
plumbing, and audit layer are production-coherent. The system is a release candidate **only
after** the Section 18 sequence (Excel export fix first, then client versioning, then
quick-assign consent, then tenant-boundary hardening). There is **no confirmed exploitable
P0** in the production HTTP surface as wired today.

```
IMPLEMENTATION GATE = READY WITH CONDITIONS
(0 confirmed P0; 4 P1 — see Section 17; remediation sequence in Section 18; blokkage only on the 4 conditions, not on the audit)
```

STOP — Phase 5C.18 read-only audit complete; awaiting review.