# Phase 5C.30 — Final Hardening / Release-Candidate Report

| Field | Value |
|---|---|
| Status | RELEASE CANDIDATE |
| Date | 2026-06-17 (session) |
| Authoritative repo | `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` |
| Scope | Production hardening (5C.30). NO new feature / NO migration / NO RBAC rewrite |

---

## 1. Executive Summary

- **5C.11 RBAC 2-failures — FIXED.** Root cause: **test-fixture DI gap**, not a
  production defect. The `SchedulesWorkflowService` constructor's 7th dependency
  (`ScheduleCoverageService`) was missing a stub in the RBAC consistency spec's
  `pending-approvals` `beforeEach` provider list → module-level compile threw
  `Nest can't resolve dependencies … (…, SkillService, …, ?)`. Fix = add
  `{ provide: ScheduleCoverageService, useValue: {} }` to the spec's providers.
  **No production file changed.**
- The **org filter contract itself was already correct** in production
  (`where.organizationId` applied only when org provided; historical shape kept
  otherwise) — the two failing assertions were never reached because the DI
  resolution failed first.
- **5C.28 cold-JIT flake — GREEN in-suite** on the canonical full run (no
  threshold change, no skip).
- Final gates: backend `tsc` exit 0 · **full backend suite 97 files / 1066
  tests — 0 failed** · frontend `tsc` exit 0 · production build exit 0.

## 2. 5C.29 Baseline (recall)

- 5C.29 delivered published-schedule immutability + publish-modal verification.
- Full backend suite at 5C.29: 95 files passed / 2 failed; 1063 passed /
  3 failed (1066) — the 3 = 2× RBAC 5C.11 (pending-approvals org filter) +
  1× 5C.28 cold-JIT flake.

## 3. 5C.11 RBAC Failure Analysis

### 3.1 Observed failures (5C.29 full-run)

```
5c11-authz-consistency.spec.ts > pending-approvals org filter >
  getPendingApprovals() without org keeps the historical shape (no org clause)   FAIL
5c11-authz-consistency.spec.ts > pending-approvals org filter >
  getPendingApprovals(org) filters schedules by that organization                FAIL
```

### 3.2 The diagnostic error (decisive)

```
Nest can't resolve dependencies of the SchedulesWorkflowService
(PrismaService, AuditLogService, NotificationEventService, ScheduleGateway,
SkillService, PersonnelAvailabilityService, ?).
ScheduleCoverageService at index [6] is not available in RootTestModule context
```

### 3.3 Root cause

The `SchedulesWorkflowService` production constructor (7 deps) requires
`ScheduleCoverageService` (index [6]). The RBAC consistency spec's
`pending-approvals` `beforeEach` module **omitted that stub**, so the Nest
`TestingModule` failed to compile → both `it` blocks failed before any RBAC
assertion ran.

Verification sequence:
1. Production `getPendingApprovals(organizationId?)` (schedules-workflow
   service) — confirmed correct: `if (organizationId) where.organizationId = …`;
   no-org path keeps historical shape. **No production change needed.**
2. Spec imports — confirmed `ScheduleCoverageService` imported.
3. Provider list — confirmed **missing** `ScheduleCoverageService` stub.
4. Minimal fix applied to **spec providers only**.

### 3.4 Fix applied (test fixture)

File: `backend/src/modules/rbac/__tests__/5c11-authz-consistency.spec.ts`
`pending-approvals` beforeEach providers — added:

```ts
{ provide: ScheduleCoverageService, useValue: {} },
```

Scope: test fixture one-line addition. RBAC production code, tenant/unit
guards, RBAC controller, and coverage engine: **untouched**.

## 4. Verification — Final Gates (canonical, this session)

| Gate | Command | Result |
|---|---|---|
| Backend tsc | `npx tsc -p tsconfig.json --noEmit` | exit 0, clean |
| RBAC spec (isolated, canonical) | `vitest run 5c11-authz-consistency.spec.ts` | 25/25 passed |
| Coverage gate (isolated) | `vitest run 5c28-apply-coverage-gate.spec.ts` | 10/10 passed |
| Backend tsc | `tsc --noEmit` (authoritative) | exit 0 |
| RBAC 5c11 | `vitest run …/5c11-authz-consistency.spec.ts` | 25 passed (25) |
| 5c28 | `vitest run …/5c28-apply-coverage-gate.spec.ts` | 10 passed |
| **FULL backend suite** | `npx vitest run` | **97 files passed (97) · 1066 tests passed (1066) · exit 0** |
| Frontend tsc | `npx tsc … --noEmit` | exit 0 |
| Frontend prod build | `ng build --configuration production` | exit 0 |

## 5. Known Remaining Issues (post-gate)

| ID | Severity | Description | Disposition |
|----|----------|-------------|-------------|
| 5C.28 cold-JIT timing flake | P3 | Cold full-suite occasionally exceeds coverage-gate 100 ms JIT warmup; isolated re-runs 10/10 green | Documented — threshold untouched, no skip |
| Frontend chunk budget (213 kB > 200 kB advisory) | P3 | Pre-existing advisory warning; non-blocking | No change |

## 6. Release Decision (per 5C.30 §30 rules)

- P0 (release-blocking) failures: **0**
- P1 (must-fix): **0**
- Full suite: **0 failed**
- Production changes: **none** (single test-fixture DI addition only)

**Verdict: RELEASE CANDIDATE — P0 = 0, P1 = 0, release conditions met.**

## 7. Explicitly Out of Scope (not started)

- Genetic optimizer / BullMQ wiring to production: not connected.
- New feature development: none.
- RBAC/tenant redesign, migration, schema change, coverage-engine change,
  personnel-availability change: none.
- No migration was needed or created in 5C.30.

## 8. STOP

5C.30 complete. `STOP` honored — 5C.31 feature development was not started and
is not proposed automatically.
