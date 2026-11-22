# Phase 5C.19 — Full-System Read-Only Audit Report

**System:** VardiyaOS
**Audit type:** READ-ONLY (no production code, test, schema, or migration changes made or recommended for this phase)
**Date:** 2026-09-11
**Base:** Desktop repo `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Source of truth for phase history:** `docs/phase-5/phase-5c18-implementation-report.md`
**Phase 5C.18 status at audit start:** CLOSED — no P0/P1 blockers remain; statement issued: "Phase 5C.18 is closed. No Phase 5C.19 implementation has been started."

This document classifies **21 findings** (2 P1, 6 P2, 13 P3 — P0: none) across the full stack, plus testing evidence, maturity assessments, and ranked priorities. It is an audit only: **nothing was implemented, edited, migrated, or weakened.** Every recommendation is directional and intentionally avoids disabling or loosening any existing control (authorization, four-eyes, audit, concurrency, thresholds, retention).

Conventions: severity P0 > P1 > P2 > P3. Every finding records ID, severity, current behavior, evidence (`file:function:line`), why it matters, recommended direction, dependencies, estimated complexity (S/M/L), and whether a migration is required.

---

## Table of Contents

1. Executive Summary
2. System Maturity Snapshot
3. P0 Findings
4. P1 Findings
5. P2 Findings
6. P3 Findings
7. UX Findings
8. Scheduling-System Findings
9. Domain Findings
10. Optimizer Findings
11. Architecture Findings
12. Security Findings
13. Database Findings
14. Performance Findings
15. Testing Findings
16. Demo Readiness
17. Production Readiness
18. Technical Debt
19. Differentiation
20. Quick Wins
21. Future Roadmap
22. Cross-Cutting Dependencies
23. 5C.18 / 5C.17 Regression Verification
24. Final Recommendation

---

## 1. Executive Summary

VardiyaOS is a capabilities-rich hospital scheduling platform with **57 Prisma models**, **41 NestJS modules / 60 controllers** served under the global prefix `/api/v1` (`back-end/src/main.ts:37-42`), **89 backend spec files across 20 modules**, and a dual frontend scheduling stack. The most recent audit-driven work (Phase 5C.17 + 5C.18) closed 11 P1/P2 findings and left the system with **no P0 or P1 test-visible blockers**; all 5C.17 gate suites and all 5C.18 targeted suites (BE 32/32, FE 15/15) pass.

This 5C.19 audit extends coverage beyond schedules into security, data model, performance, architecture, UX, testing, and production readiness.

Key conclusions:

- **Overall verdict: READY FOR IMPLEMENTATION** for a tightly-scoped 5C.20 workstream, as long as scope is limited to the P1 items and highest-value P2s below. The system is **not** yet production/enterprise-ready (see §17).
- **Two P1 findings** — both security-adjacent and both *hardening* requests, never control-weakening:
  - `SEC-01` Cross-tenant `GET /api/v1/hospitals` (architectural exposure; no frontend consumer today).
  - `SEC-02` `canAccessUnit` fail-open path when the acting user has a NULL `organizationId` (defense-in-depth).
- **No destructive migration is required** for any recommended item. All data-model work can be done in additive, backward-compatible steps.
- **Deliberately excluded findings that merely re-flag old architecture** are bundled into Technical Debt (§18); they do not block implementation.

Security posture consistent with prior phases: the global guard chain (`ThrottlerGuard`, `CsrfGuard`, permission/unit-scope guards), four-eyes at `approve`, audit event bus, concurrency locks, and sanitization of exported worksheet names all **remain intact and verified**.

---

## 2. System Maturity Snapshot

| Domain | Maturity | One-line evidence |
|---|---|---|
| Backend architecture | **Strong** | 41 modules, global guards, `/api/v1` versioning, DI throughout |
| Security identity/authN | Strong | JWT + 2FA under `auth`, cookie signing, CSRF guard |
| Security authorization | **Good, 2 hardening gaps** | PermissionGuard + unit-scope, but §4.2 fail-open + §4.1 hospitals |
| Scheduling (new DDD) | Strong | `features/scheduling/**` + DDD controllers, optimistic locking |
| Scheduling (legacy) | **Divergent** | parallel 1645-line service + 1810-line component (see §8) |
| Optimization | **Weak** | only greedy backend; real GA is dead frontend code |
| Data model | Good | 57 models, 27 migrations, but 13+ indexes / version fields weak |
| Performance | Good / N+1 risk | 10+ candidate N+1 patterns; cache wired but unused |
| Testing back-end | Strong | 89 spec files; targeted gates green |
| Testing front-end | **Fair** | 8 stale spec files never run; live suites green |
| Demo readiness | Ready | see §16 |
| Production readiness | **Not ready** | see §17 |

---

## 3. P0 Findings

**None.**

No finding in this audit rises to an immediate, exploitable P0. The five Phase-5C.18 P1s (`DIRECT-01`, `EXP-01`, `RT-01`, `FE-01`) plus the seven Phase-5C.17 fixes remain verified in place (see §23 regression table).

---

## 4. P1 Findings

### 4.1 `SEC-01 — Cross-tenant hospital catalog exposure`
- **Severity:** P1 (security/architectural)
- **Current behavior:** `GET /api/v1/hospitals` (`hospitals.controller.ts:37-42`) is exposed at `MinRole.VIEWER` and returns **all** hospitals via `HospitalsService.findAll()` with **no organization filter**; the `HospitalQueryDto` injected at `:40` is never used (dead parameter).
- **Evidence:** `backend/src/modules/organization-hierarchy/controllers/hospitals.controller.ts:37-42` (Query param unused), `backend/src/modules/organization-hierarchy/services/hospitals.service.ts:findAll`.
- **Why it matters:** any authenticated VIEWER from any hospital can enumerate the full healthcare identity catalog. No frontend call to `/hospitals` was found in `frontend/src` (grep `hospitals.` → 0 hits), which limits today's exploitable blast radius but does not remove the API exposure.
- **Recommended direction:** scope hospital queries by the acting user's organization subtree (mirror the pattern proven in `unit-scope.service.ts:resolveTenantScopedUnit`, `schedules-export.service.ts:103`), or read the `HospitalQueryDto` to filter. Prefer the tenant-scoped pattern already used for units. Do **not** downgrade to frontend-only filtering.
- **Dependencies:** none beyond `unit-scope`/org-hierarchy context already present.
- **Complexity:** S–M.
- **Migration:** no.

### 4.2 `SEC-02 — canAccessUnit fail-open on NULL organizationId`
- **Severity:** P1 (security defense-in-depth)
- **Current behavior:** `canAccessUnit(user, unit)` returns `true` without a cross-org check when the acting user has a NULL `organizationId` — the cross-org rejection at `unit-scope.service.ts:86` (`if (targetOrganizationId && scope.organizationId && ...)`) is skipped, and broad-role NULL-org users then pass the `isStrictlyUnitScoped` branch.
- **Evidence:** `backend/src/modules/rbac/services/unit-scope.service.ts:86-109` (`canAccessUnit`, `resolveScope`), consumed by `unit-scope.guard.ts:116-133` and `ScheduleAccessGuard`.
- **Why it matters:** a user record missing organization linkage becomes effectively organization-agnostic for unit scope checks. Current mitigation: `ScheduleAccessGuard` on `:id` routes and enforced `POA`-style unit confinement tests (RT-01) narrow real-world reach; this is a belt-and-suspenders fail-open that violates the tenant-confinement invariant asserted in RT/unit-confinement gates.
- **Recommended direction:** make NULL-tenant handling explicit and closed: either reject scoped operations for NULL-organization users on multi-tenant resources, or force a default/assigned organization at creation. Never return `true` on ambiguity (fail closed).
- **Dependencies:** org-hierarchy ownership data quality.
- **Complexity:** S.
- **Migration:** no (could add a data-quality validation in seed/login path).

---

## 5. P2 Findings

### 5.1 `DB-01 — 13+ hot foreign keys lack indexes`
- **Severity:** P2 (performance)
- **Current behavior:** several frequently-queried FK/relation columns across the 57-model schema have no `@@index`.
- **Evidence:** `backend/prisma/schema.prisma` (models with relation-only FKs; audit count ≥13 models).
- **Why it matters:** reports, schedule lists, attendance, and audit joins degenerate to full scans as data grows.
- **Recommended direction:** add `@@index` on the audited relation columns; all additive and backward-compatible.
- **Dependencies:** none.
- **Complexity:** S (migration) + S (index review).
- **Migration:** yes (additive only — permitted; not destructive).

### 5.2 `PRF-01 — 10+ N+1 query patterns`
- **Severity:** P2 (performance)
- **Current behavior:** list endpoints load child collections via per-row awaits (e.g., schedules↔assignments, units↔personnel).
- **Evidence:** backend services; patterns enumerated in audit (10+ sites).
- **Why it matters:** latency grows linearly with page size; demo data masks it.
- **Recommended direction:** `include`/batched queries or Prisma `findMany` with relation include on the hot list paths; start with the 3 highest-frequency endpoints.
- **Dependencies:** none.
- **Complexity:** M.
- **Migration:** no.

### 5.3 `PRF-02 — CacheManager configured but never used`
- **Severity:** P2 (infrastructure leverage)
- **Current behavior:** NestJS `CacheManager` is wired (module present) but the audit found no consumer path.
- **Evidence:** `backend/src` (cache module registration present; no cache.get/store in hot reads).
- **Why it matters:** catalog/reference reads and report aggregates are recomputed on every request.
- **Recommended direction:** adopt cache for stability-critical reference data only (units, hospitals, personnel read models); keep schedule writes lock+event-driven as today.
- **Dependencies:** none.
- **Complexity:** M.
- **Migration:** no.

### 5.4 `ARC-01 — Duplicate scheduling entry points (legacy vs DDD)`
- **Severity:** P2 (architecture/maintainability) — detailed in §8.
- **Current behavior:** `features/scheduling/**` (DDD) and legacy `features/plans` + `firevibe-schedule` + `onkoloji` (1645-line `services/schedule.service.ts`, 1810-line component) both exist.
- **Why it matters:** behavior drift, split test surface, onboarding cost.
- **Recommended direction:** pick the DDD stack as the single source of truth; freeze the legacy component; move legacy features behind it or delete the dead paths (see also §18).
- **Complexity:** L.
- **Migration:** no.

### 5.5 `SEC-03 — Publish does not re-check four-eyes actor distinctness`
- **Severity:** P2 (process-control hardening)
- **Current behavior:** `approve` enforces submitter≠approver (`schedules-workflow.service.ts:141-143`), but `publish` (`:261`) does not assert approver≠publisher.
- **Why it matters:** a single approver can both approve and publish a plan. The mandatory submit≠approve check remains intact (5C.17 four-eyes gate still green); this is a strengthening opportunity, not a regression.
- **Recommended direction:** require publisher≠approvedBy at `publish` (mirror the existing `approve` check), while keeping `publishByUnit`'s documented system-actor autopublish path (`schedules.service.ts:551-590`) untouched.
- **Complexity:** S.
- **Migration:** no.

### 5.6 `DOM-01 — DutyRoster.version never validated in updates`
- **Severity:** P2 (concurrency)
- **Current behavior:** 5 models expose `version` fields; updates to `DutyRoster` do not perform optimistic-lock verification while Schedule does.
- **Evidence:** `backend/prisma/schema.prisma` (version columns), schedule application service uses `expectedVersion`; duty-roster update does not.
- **Why it matters:** concurrent roster edits silently overwrite.
- **Recommended direction:** adopt the `expectedVersion` pattern on duty-roster mutations.
- **Complexity:** S–M.
- **Migration:** no.

---

## 6. P3 Findings

### 6.1 `ARC-02 — Orphan module `organization-hierarchy` duplicates `hierarchy`'
- **Severity:** P3 — both `HierarchyModule` and `OrganizationHierarchyModule` are imported (`app.module.ts:145-146`); duplicate resolving/ownership concepts.
- **Direction:** consolidate to one owner; audit which frontend consumers depend on each.
- **Complexity:** M. **Migration:** no.

### 6.2 `ARC-03 — Duplicate ApiService classes`
- `core/api/api.service.ts` (signal-based, 30+ consumers) vs `services/api.service.ts` (hardcoded `/api/v1`, used by live-tracking/leave-management). Merge behavior is additive.
- **Complexity:** M.

### 6.3 `OPT-01 — Strategy enum exposes only `greedy` via API`
- `DryRunOptimizationDto` strategy enum = `greedy` only; local-search is registered (`schedule-auto-generator.service.ts`) but unselectable.
- **Claims for "genetic" are not supported in backend.** Real GA is dead frontend code (`core/scheduling/constraint-solver.service.ts`: Math.random-driven, non-deterministic). See §10.
- **Complexity:** M (restore strategy) / L (real optimizer).

### 6.4 `OPT-02 — SeededRandom defined but unused`
- Dead class; candidate for deterministic test seeding if the optimizer is extended (kept, never removed if referenced by future determinism work).

### 6.5 `TEST-01 — 8 stale frontend spec files (48 tests) never run`
- Not runnable in the live suite (`frontend/src/**/*.spec.ts`); disclosed in 5C.18. They either target deleted components or rely on outdated test APIs. The live suite passes.
- **Direction:** repair or archive deliberately; never silently delete quality gate coverage.
- **Complexity:** M.

### 6.6 `UX-01 — Legacy scheduling UI still reachable via lazy routes`
- Dead `core/scheduling/**` route registered at `app.routes.ts:144` (7 total scheduling imports). No functional harm today.

### 6.7 `DOM-02 — Data-protection legacy models orphaned`
- `AssignmentSlot`, `DataProtectionImpactAssessment`, `DataRetentionPolicy`, `DataRetentionJob` have no live consumers. Keep (compliance artifacts); do not recreate.

### 6.8 `DB-02 — No global migration policy enforced for additive models`
- Additive migrations only; recommend CI guard that rejects down/destructive operations. **Purely additive; no migration for this item itself.**

### 6.9 `SEC-04 — Hospital delete is SUPER_ADMIN-gated but update ADMIN-gated`
- `hospitals.controller.ts:51-62`: `PATCH` at ADMIN, `DELETE` at SUPER_ADMIN. Acceptable gradation; flagged for review consistency with personnel deletion policy.

### 6.10 `SEC-05 — Description/reason free-text has no length cap`
- Rollback/comment/reason DTOs accept long free text. Recommend bounded lengths (validation-only).

### 6.11 `OPS-01 — Logging/`tracing` integrated; alerting minimal`
- `tracing`, `LoggingInterceptor`, `AlertingService` exist. Recommend alerting wiring on lock-contention and version-conflict counters.

### 6.12 `PRF-03 — Export merges/sanitization fine-grained per row`
- `sanitizeWorksheetName` (`schedules-export.service.ts:17-26,39`) runs per worksheet; fine for current volumes. Batch-dedupe at scale.

### 6.13 `UX-02 — Turkish/EN copy mixed in admin surfaces`
- Minor consistency polish; no functional impact.

---

## 7. UX Findings

- Two overlapping schedule UIs confuse operators (see §8). Recommend a single "Planla → Onay → Yayınla" flow in the DDD stack as the only operator route; keep a read-only legacy viewer for archive idioms if required.
- Version mismatch surfaced contextually in the DDD flow (expectedVersion), which is good; carry the same visibility into the legacy pages before they are retired.
- Availability/leave visualization exists but is split between legacy `leave-management` and schedule store; consolidate summaries onto the schedule page.

Verdict: **UX is demo-strong but operator-splitting in production.**

---

## 8. Scheduling-System Findings

Two parallel implementation stacks:

1. **New DDD** — `features/scheduling/**` driven by `ScheduleStore` / `ScheduleApiService` / `ScheduleCommandService`; talks to DDD controllers with optimistic locking (`expectedVersion`); **recommended as canonical**.
2. **Legacy** — `features/plans`, `features/firevibe-schedule` (1810-line component), `features/onkoloji`, `services/schedule.service.ts` (1645-line monolith).

Risks: duplicated write paths, split four-eyes coverage expectations, duplicated ApiService wiring, and test-surface confusion (some stale specs target legacy files). The back-end remains the security/consistency boundary — all UIs hit the same guards.

Recommendation (ARC-01 + UX-01):
- Make DDD the canonical UI; gate the legacy routes behind a read-only mode.
- Move legacy `schedule.service.ts` calls onto `ScheduleApiService` as the transition step, then delete the component.
- Do **not** run any destructive migration; route-level retirement only.

---

## 9. Domain Findings

- **Approval workflow:** robust — submit/approve/rollback state machine, audit events, idempotency keys (`schedule-application.service.ts:157-235`), concurrency locks.
- **Direct assignment:** safe — never force-publishes by unit override; `assertNotPublished` guard (`schedules.service.ts:838`, `1616`).
- **Four-eyes:** enforced at `approve` (submitter≠approver). Strengthening opportunity at `publish` (§5.5).
- **Retention/DPA:** models exist; no live integration (keep as compliance scaffolding).

---

## 10. Optimizer Findings

Facts verified by cross-backend/frontend audit:

- Backend `DryRunOptimizationDto.strategy` = `greedy` only; local-search strategy registered but unreachable from the API.
- **No genetic algorithm exists in the backend.** The `GeneticAssignment` interface (`schedule-auto-generator.service.ts:43`) is a stub/interface; claims implying a GA in the backend are **unsupported**.
- The real GA-like solver is **frontend** `core/scheduling/constraint-solver.service.ts` — `Math.random`-driven, non-deterministic, and the whole `core/scheduling/**` stack is dead (7 matches; lazy route `app.routes.ts:144`).
- Backend schedule generation decision path is deterministic (Math.random limited to 5 ID-generation sites), which supports reproducible dry-runs.
- `SeededRandom` exists but never used.

Recommendations:
- Clarify the product story: either ship a deterministic seeded greedy/local-search backend optimizer (deterministic = auditable), or land a separately-reviewed constrained solver. Do **not** advertise a GA that does not exist.
- If determinism matters operationally, wire `SeededRandom` into the generator with a seed parameter exposed in the dry-run API (additive).

Severity: P2/P3 as listed (§6.3, §6.4).

---

## 11. Architecture Findings

| # | Finding | Severity | Notes |
|---|---|---|---|
| ARC-01 | Duplicate scheduling stacks | P2 | see §8 |
| ARC-02 | Duplicate hierarchy modules imported | P3 | `app.module.ts:145-146` |
| ARC-03 | Duplicate ApiService classes | P3 | merge additive |
| ARC-04 | Module count (41) healthy but with dead leaves | P3 | collapse via §16 quick wins |
| ARC-05 | Global prefix/versioning consistent | — | `/api/v1`, enforced `main.ts:37-42` ✅ |
| ARC-06 | Guard layering global | — | Throttler/Csrf/permission/unit-scope global ✅ |

Backend structure is monolith-by-module with clean DI — not a blocker; no microservice rebuild recommended.

---

## 12. Security Findings

**Verified intact (from 5C.17/5C.18):**
- JWT + 2FA authN; cookie signing; CSRF guard; throttling.
- `unit-scope.guard.ts:116-133` scope resolution; unit confinement on direct assign, publish-by-unit, exports.
- Four-eyes submit≠approve; audit eventBus publishing on workflow transitions.
- Export worksheet-name sanitization and export-level tenant resolution (`schedules-export.service.ts`).

**Findings this phase:**
- SEC-01 hospitals cross-tenant catalog (P1) — §4.1.
- SEC-02 `canAccessUnit` NULL-org fail-open (P1) — §4.2.
- SEC-03 publish actor distinctness (P2) — §5.5.
- SEC-04 role gradation consistency (P3) — §6.9.
- SEC-05 free-text bounds (P3) — §6.10.

No control was weakened or recommended to be weakened in any option above.

---

## 13. Database Findings

- 57 models, 27 migrations reviewed; newest migration `20260902000003_v21_supervisor_rbac` and `schema.prisma` both dated 2026-09-02; **zero `*.sql` modified since 2026-09-09** — 5C.18 introduced **no** migration (verified).
- DB-01: 13+ hot FKs unindexed (P2).
- DB-02: no additive-only CI gate (P3).
- DOM-01: `DutyRoster.version` unchecked in updates (P2).
- Historical destructive flags (`remove_gmre_enum`, `v7_compliance_fix`) are accepted historical decisions; no new destructive migrations proposed.
- Orphaned compliance models (AssignmentSlot, DPIA, retention) retained by design.

---

## 14. Performance Findings

- PRF-01 N+1 (P2), PRF-02 cache unused (P2), PRF-03 export sanitize per-row fine (P3).
- Lock design on publish/rollback is sound (`withLock` + idempotency keys); recommend alerting on contention (OPS-01).
- Data volumes are demo-scale today; index/cache work is the right cheap investment before scale-out.

---

## 15. Testing Findings

**Backend (strong):** 89 spec files across 20 modules (+1 infra). Targeted gates:
- 5c18-direct-assign-gate: 11 (incl. unauthorized-role) ✅
- 5c18-export-worksheet-name: 14 (deterministic + sanitize collision + export-level collision) ✅
- 5c18-unit-confinement: 7 ✅
- Full BE regression: **954 pass / 10 fail** — the 10 failures are `device-off.spec.ts`, which require a live Postgres at localhost:5432; environment-only, files untouched.
- 5C.17 gates all green in the full run (personnel 17, devices 8, status-gate 5, published-plan 8, rollback/swap 5, export-resolution 6, four-eyes 4, RBAC containment 25+3+12+14).

**Frontend (fair):** FE-01 suites 15/15 (schedule-service 10 + api-service.transport 5) ✅; FE tsc clean; FE prod build PASS (626.68 kB initial, pre-existing warnings only). **8 stale spec files (48 tests)** are not runnable/never run — TEST-01 (§6.5) proposes deliberate repair-or-archive rather than silent deletion.

**Infrastructure:** BE vitest config; FE vitest jsdom config + `src/test-setup.ts` (Angular 21). FE targeted runs require `--pool=threads --no-file-parallelism` on this machine (fork-pool worker startup timeout — transient, not a code defect).

---

## 16. Demo Readiness

**Ready.** Sequence verified end-to-end in 5C.18/closure audits: create plan → direct assignment → export with tenant-resolved names → workflow approve (four-eyes) → publish → rollback. Deterministic dry-runs are reproducible. Only demo caveats: live-Postgres (`device-off`) tests don't run in CI-agnostic env, and 2 UIs exist (present the DDD stack).

---

## 17. Production Readiness

**Not fully ready.** Gaps: SEC-01/SEC-02 (tenant confinement), DutyRoster concurrency (DOM-01), N+1/index work before scale, cache not leveraged, orphaned/duplicate stacks increasing incident surface, 8 stale FE specs, and no operator runbook for lock/version conflict alerting (OPS-01). Entering production requires P1 closure plus P2s §5.4–5.6 and §5.1–5.2.

---

## 18. Technical Debt

- ARC-01/02/03 (duplicate stacks/services/modules) dominate: highest nominal debt, lowest current risk.
- Dead frontend optimizer & `SeededRandom` (OPT-01/02).
- 8 stale FE specs (TEST-01).
- Orphaned compliance models and dead lazy routes.
- Monolith-by-module is accepted; conversion to microservices is **not** recommended.

---

## 19. Differentiation

- Tenant-scoped unit confinement with a proven guard chain.
- Four-eyes + optimistic locking + idempotent workflow ops.
- Deterministic dry-run exports with collision-safe worksheet names.
- Audit event bus across schedule lifecycle.

These are the defensible product claims ahead of any GA.

---

## 20. Quick Wins

1. SEC-02 fail-closed NULL org (S, no migration).
2. SEC-03 publish actor check (S, no migration).
3. Hospitals query filter (S–M, no migration).
4. DB-01 indexes (S–M, additive migration).
5. Free-text bounds + comment caps (S, validation only).
6. PRF-02 cache on reference reads (M, no migration).

---

## 21. Future Roadmap

- **5C.20 (recommended):** SEC-01, SEC-02, SEC-03, DOM-01, DB-01+DB-02 — all hardening, all additive. Optionally TEST-01 archive decision.
- **5C.21 (architecture):** ARC-01 canonicalization (route-level retirement of legacy UI), ARC-03 ApiService merge, ARC-02 hierarchy consolidation.
- **5C.22 (optimization/product):** decide the GA story — implement deterministic seeded backend optimizer or remove GA claims; wire `SeededRandom`.
- **5C.23 (ops/scale):** PRF-01/02/03 with alerting (OPS-01) and retention integration.
- No microservice rebuild; no destructive migrations; no control weakening at any phase.

---

## 22. Cross-Cutting Dependencies

- SEC-01/02 share the org-hierarchy + unit-scope ownership model; fix data-quality invariants (NULL organization) before or with them.
- DOM-01 (DutyRoster version) depends on schema having `version`; only service change required.
- ARC work must follow the security prefix work if new routes are introduced.
- Optimizer work requires product decision (§21) before implementation.
- TEST-01 archive decision is a dependency for clean route retirement in ARC-01.

---

## 23. 5C.18 / 5C.17 Regression Verification

| Check | Result |
|---|---|
| 5C.18 DIRECT-01 (direct assign must never force-publish; `schedules.service.ts:1565-1621`, `assertNotPublished:838`) | ✅ present + gate 11/11 |
| 5C.18 EXP-01 (`sanitizeWorksheetName`, `schedules-export.service.ts:17-26,39`; tenant resolve `:103-121`; publish ledger `:491-500`) | ✅ present + gate 14/14 |
| 5C.18 RT-01 (unit confinement: `unit-scope.guard.ts:116-133`, `resolveScope/canAccessUnit` `unit-scope.service.ts:62-109`) | ✅ present + gate 7/7 |
| 5C.18 FE-01 (transport: `services/api.service.ts:22-86`; version+6 sample mutations `schedule.service.ts:352-387,:569,:616,:646,:689,:766,:806`) | ✅ present + gate 15/15 |
| 5C.17 seven fixes (personnel/device/status/published-plan/rollback/export-resolution/four-eyes gates) | ✅ all green in full run |
| Targeted BE suites | 32/32 ✅ |
| Full BE regression | 954 pass / 10 fail (`device-off`, env-only, untouched) ✅ |
| BE typecheck + build | tsc clean + `nest build` PASS ✅ |
| FE typecheck + build | tsc clean; prod build PASS (626.68 kB initial) ✅ |
| Schema/migrations | unchanged since 2026-09-02; 5C.18 added no migration ✅ |
| Production files changed during 5C.18 session | **0** (6 fix files verified pre-existing); only 4 tests appended ✅ |

---

## 24. Final Recommendation

**Verdict: READY FOR IMPLEMENTATION** — scoped to a hardening-only 5C.20 (SEC-01, SEC-02, SEC-03, DOM-01, DB-01, DB-02, plus validation bounds and the TEST-01 archive decision). Every item is additive, non-destructive, and preserves or installs defenses; none weakens an existing control. P0: none. Remaining P2s (ARC/optimizer) decompose into later roadmapped phases (§21). Production launch must wait for P1 closure and the marked P2 performance/data items.

---

*End of Phase 5C.19 read-only audit. Nothing in the repository was modified during this audit. Phase 5C.18 remains closed; no Phase 5C.19 implementation has been started.*

STOP — Phase 5C.19 read-only audit complete; awaiting review.