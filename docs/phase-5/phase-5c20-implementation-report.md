# Phase 5C.20 — P1 Security Hardening Implementation Report (SEC-01 + SEC-02)

**System:** VardiyaOS
**Phase:** 5C.20
**Scope (strict):** SEC-01 (`/hospitals` cross-tenant exposure) + SEC-02 (`canAccessUnit` NULL-org fail-open)
**Date:** 2026-09-11
**Base:** Desktop repo `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Prior phase status:** Phase 5C.18 CLOSED · Phase 5C.19 read-only audit COMPLETE (0 P0 / 2 P1 / 6 P2 / 13 P3 — READY FOR IMPLEMENTATION)

Out of scope and NOT touched: all P2/P3 findings, the optimizer/genetic-algorithm work, unrelated refactoring, schema/migration changes, and any Phase 5C.21 work.

---

## 1. Executive Summary

Both P1 findings were re-audited, root-caused, and closed with a **minimum-diff, backend-authoritative, fail-closed** implementation that preserves every existing control (four-eyes, audit/concurrency, RBAC, unit-scope architecture, role separation between SUPERVISOR and FIELD_SUPERVISOR).

- **SEC-01 closed:** `GET /api/v1/hospitals` and `GET /api/v1/hospitals/:id` are now tenant-scoped server-side. A normal VIEWER/SUPERVISOR can only ever reach hospitals inside their own tenant (derived from their organizations + explicit RBAC hospital/group scope). Unresolvable tenant → 403. The endpoint is **not** deleted (it remains the org-hierarchy catalog), and platform `system_admin` accounts (the RBAC model's `globalSystemAdmin`, null-org) keep full enumeration explicitly by role, not by accident.
- **SEC-02 closed:** `canAccessUnit` now fails **closed** when the acting user's organization is NULL/undefined. The previous mat evolution — where a NULL-org SUPERVISOR, or a NULL-org FIELD_SUPERVISOR holding a matching unit, fell through the same-org check by omission and were granted access — is eliminated. The single explicit exception is the platform-scoped SYSTEM_ADMIN (legacy `system_admin`/`super_admin`, or a null-org `SYSTEM_ADMIN` RBAC assignment). SUPERVISOR stays organization-scoped; FIELD_SUPERVISOR stays strictly single-unit scoped; the two roles are not merged.
- **Zero schema/migration changes** (verified: `schema.prisma` and the newest migration are untouched, dated 2026-09-02). No control was weakened; no threshold changed; no test skipped.

**Validation summary**
- Targeted 5C.20 P1 suite: **27/27 pass** (SEC-01 14, SEC-02 13).
- Existing scope/auth suites rerun: 162/162 pass (5C.7/5C.8/5C.9/5C.10/5C.11 + org-hierarchy + units/personnel/device-status/supervisor scope).
- 5C.18 gates rerun intact: DIRECT-01 11, EXP-01 14, RT-01 7, FE-01 15.
- Backend TypeScript: clean. Nest production build: pass.
- Backend full regression: **981 pass / 10 fail** — the 10 are the pre-existing, environment-only `device-off.spec.ts` (needs live Postgres at `localhost:5432`); not related to this implementation.
- Frontend: FE tsc clean; production build pass (pre-existing budget warnings only); FE-01 15/15.

**Verdict: PASS WITH WARNINGS** (warnings are the documented environment-only disclosures below; both P1s demonstrably closed).

---

## 2. 5C.19 findings addressed

| ID | Severity | Title | Status |
|---|---|---|---|
| SEC-01 | P1 | `/hospitals` cross-tenant exposure | **CLOSED** (this phase) |
| SEC-02 | P1 | `canAccessUnit` NULL-org fail-open | **CLOSED** (this phase) |
| SEC-03 … adopted items | P2 | publish actor distinctness, DutyRoster version, indexes, etc. | NOT IN SCOPE — 5C.20 is P1-only |

All 6 P2 / 13 P3 findings remain documented in the 5C.19 audit report and are deliberately untouched.

---

## 3. SEC-01 root cause

- **Endpoint:** `GET /api/v1/hospitals` was only `MinRole.VIEWER`-gated and called `HospitalsService.findAll()` with **no organization filter** — `hospitals.controller.ts:37-42`. `GET /:id` was likewise unscoped. `HospitalQueryDto` injected at `:40` was unused.
- **Data model reason:** `Hospital` (`schema.prisma:412-433`) has no `organizationId` column; the tenant link lives on `Organization.hospitalId` (`schema.prisma:382-384`). The service had no tenant context, so a VIEWER effectively saw the whole catalog.
- **Product check:** a full `frontend/src` grep for hospital endpoint consumers returned **zero callers**; the endpoint is part of the org-hierarchy admin surface but currently uncalled by the UI. Per the phase constraints, the endpoint was therefore **restricted, not deleted**: scoped server-side so it cannot leak across tenants, while preserving the admin/management role of the module and keeping compatibility (path, DTOs, response shape unchanged).
- **No frontend-only protection** was introduced — enforcement is entirely in NestJS services/controllers.

---

## 4. SEC-01 implementation

- **`backend/src/modules/organization-hierarchy/services/hospitals.service.ts`**
  - Added `findAllScoped(user)` and `findOneScoped(id, user)` — tenant-scoped read methods (kept the pre-existing `findAll`/`findOne` for the platform-admin path and service-test compatibility; create/update/remove untouched and still ADMIN/SUPER_ADMIN role-gated).
  - `isGlobalSystemAdmin(user)`: the ONLY unresolved-org allow — mirrors the RBAC service's `globalSystemAdmin` (`rbac.service.ts:68`): legacy `system_admin`/`super_admin`, or an RBAC `SYSTEM_ADMIN` assignment with `organizationId == null`.
  - `resolveHospitalScope(user)`: builds the tenant search space from (a) organizations assigned to the user (legacy `organizationId` + every non-null RBAC assignment `organizationId`) → their `hospitalId`, (b) `hospitalId` values in RBAC assignments, (c) `hospitalGroupId` values in RBAC assignments.
  - Fail-closed rule: if the scope set is empty **and** the user is not a platform admin → `ForbiddenException` (403). `findOneScoped` returns `null` for out-of-tenant or nonexistent ids so the endpoint cannot be used to probe for existence elsewhere.
- **`backend/src/modules/organization-hierarchy/controllers/hospitals.controller.ts`**
  - `GET /` → `findAllScoped(req.user)`; `GET /:id` → `findOneScoped(id, req.user)` and `NotFoundException` when `null` (opaque for missing vs cross-tenant, fail closed). Added `@Request()`; `@Roles(MinRole.VIEWER)` unchanged.
- **Compatibility impact (documented):** URL, DTOs, auth level, and response shape are unchanged. Behavior change: a tenant-unresolved non-admin account (e.g., a legacy user with NULL org and no RBAC scope) that previously saw the full catalog now receives 403.
- **Tests:** `backend/src/modules/organization-hierarchy/__tests__/5c20-sec01-hospitals-scope.spec.ts` (14 tests) — see §11.

---

## 5. SEC-02 root cause

In `canAccessUnit` (`unit-scope.service.ts:86-109` pre-change):

```
if (targetOrganizationId && scope.organizationId && targetOrganizationId !== scope.organizationId) return false;
if (!this.isStrictlyUnitScoped(user)) return true;
```

When `scope.organizationId` was `null`/`undefined` (legacy NULL-org account), the same-org comparison was **skipped**, and a non-strict role (SUPERVISOR and above) fell through to `return true`. A NULL-org FIELD_SUPERVISOR whose `strictUnitId` matched the target also succeeded. So an unresolved tenant — which is exactly the case that cannot be positively authorized — resulted in an **allow**.

Re-audit of every caller (`UnitScopeGuard.handler → resolveTargetUnit → canAccessUnit`; `units`, `devices`, `device-status`, `device-lifecycle`, `handover-notes`, `swap-requests`; plus `resolveReadScope` consumers) confirmed the change surface: only `canAccessUnit` needed to flip; list reads via `resolveReadScope` were already fail-closed for unresolved units and are intentionally untouched.

Legitimate-platform concern: seeds create `system_admin` users with **NULL organizationId** (`prisma/seed.ts:19-40`). The RBAC model already encodes exactly this account as `globalSystemAdmin` (`rbac.service.ts:68`: `actor.level >= SYSTEM_ADMIN_LEVEL && actor.orgIds.has(null)`). The legacy column role `system_admin` maps to `SYSTEM_ADMIN` (`rbac.service.ts:222-224`). So the fail-closed rule must preserve only that explicit platform role — not all NULL-org accounts.

---

## 6. SEC-02 implementation

- **`backend/src/modules/rbac/services/unit-scope.service.ts`**
  - `canAccessUnit` starts with the fail-closed guard:
    ```
    if (scope.organizationId == null) return this.isExplicitGlobalSystemAdmin(user);
    ```
    NULL/undefined org → deny unless platform admin. The rest of the original logic (cross-org rejection, strict-unit matching) is unchanged, so same-org SUPERVISOR allowed, cross-org denied, FIELD_SUPERVISOR single-unit confined, unknown units denied.
  - New private `isExplicitGlobalSystemAdmin(user)`: mirror of the RBAC `globalSystemAdmin` representation — legacy `system_admin`/`super_admin`, or an RBAC `SYSTEM_ADMIN` assignment with `organizationId == null`. This is the **only** unresolved-org success path.
- **Effect on the required matrix:** SUPERVISOR same-org → true; SUPERVISOR different-org → false; SUPERVISOR null org → false; FIELD_SUPERVISOR same unit → true; FIELD_SUPERVISOR sibling → false; FIELD_SUPERVISOR different org → false; FIELD_SUPERVISOR null org → false; unknown unit → false (strict role); unresolved user org → false; no cross-tenant access path → false. All asserted in §11.
- **Caller impact checked explicitly:** the guard's "cannot resolve target unit" branch is unchanged (`unit-scope.guard.ts:48-61`); only resolvable-target flows consult `canAccessUnit`, so the tighter rule applies exactly where an authorization decision is being made. `resolveReadScope` untouched (no list-read behavior change).
- **Tests:** `backend/src/modules/rbac/__tests__/5c20-sec02-unitscope-failclosed.spec.ts` (13 tests) — see §11.

---

## 7. Authorization model impact

| Aspect | Before 5C.20 | After 5C.20 |
|---|---|---|
| NULL-org non-admin on any unit target | ALLOW (fail-open by omission) | **DENY (fail closed)** |
| NULL-org SUPERVISOR | ALLOW across orgs | **DENY** |
| NULL-org FIELD_SUPERVISOR (any unit) | ALLOW if unit matched | **DENY** |
| Platform SYSTEM_ADMIN (null-org, explicit) | ALLOW (fail-open) | **ALLOW (explicit, unchanged)** |
| SUPERVISOR same-org | ALLOW | ALLOW (unchanged) |
| SUPERVISOR cross-org | DENY | DENY (unchanged) |
| FIELD_SUPERVISOR own unit only | ALLOW/confined | ALLOW/confined (unchanged) |
| `/hospitals` VIEWER any tenant | ALL (catalog) | **tenant-scoped only** |
| `/hospitals` foreign-tenant or unknown id | readable | **403 / 404 (fail closed, opaque)** |
| `/hospitals` platform admin | ALL (full catalog) | ALL (explicit, unchanged) |

- No role was merged; SUPERVISOR vs FIELD_SUPERVISOR separation is preserved and reinforced.
- No authorization path was changed from deny to allow (only the platform-admin path remains allowed, and it was already allowed).
- No frontend-only authorization was introduced; enforcement is entirely backend.
- No audit, concurrency-lock, throttling, CSRF, or four-eyes logic was touched.

---

## 8. Files changed

| File | Change |
|---|---|
| `backend/src/modules/rbac/services/unit-scope.service.ts` | SEC-02 fail-closed guard + `isExplicitGlobalSystemAdmin` helper (prod) |
| `backend/src/modules/organization-hierarchy/services/hospitals.service.ts` | SEC-01 scoped reads + tenant-scope resolver + `isGlobalSystemAdmin` (prod) |
| `backend/src/modules/organization-hierarchy/controllers/hospitals.controller.ts` | Wire GET list/detail to scoped service methods, 403/404 fail closed (prod) |
| `backend/src/modules/organization-hierarchy/__tests__/5c20-sec01-hospitals-scope.spec.ts` | NEW — SEC-01 mandatory matrix (14 tests) |
| `backend/src/modules/rbac/__tests__/5c20-sec02-unitscope-failclosed.spec.ts` | NEW — SEC-02 mandatory matrix (13 tests) |

No frontend files changed (security is backend-authoritative). No other production file changed.

---

## 9. Database / migration impact

- **No migration, no schema change.** Verified by timestamps: `prisma/schema.prisma` and the newest migration `20260902000003_v21_supervisor_rbac/migration.sql` are unchanged (both 2026-09-02); `migration_lock.toml` 2026-08-12.
- The fix requires only existing columns: `Organization.hospitalId`, `User.organizationId`, `UserRoleAssignment.{organizationId,hospitalId,hospitalGroupId}`, `Hospital.{id,groupId}`.
- No data backfill required; no rollback implications (revert = restore the 3 service/controller files).

---

## 10. Security regression analysis

Verified **unchanged and intact** while implementing:

- Backend guard chain: global prefix `/api/v1`, `main.ts:37-42` versioning; ThrottlerGuard + CsrfGuard global; `PermissionGuard`/RBAC global.
- `UnitScopeGuard` flow and its fail-closed unresolved-target branch for field supervisors (`unit-scope.guard.ts:48-61`).
- `resolveReadScope` list-read semantics (includes `denyAll` for unassigned field supervisors) — untouched.
- Four-eyes submit≠approve, idempotency keys, per-schedule locks, audit event publishing — untouched.
- DIRECT-01 (no force-publish on direct assign), EXP-01 (worksheet-name sanitization + export tenant resolution), RT-01 (unit/service confinement) — gates rerun green.
- No endpoint raised from deny→allow; the only allow retained is the explicitly-modeled platform admin.

New guarantees: **enumerating `/hospitals` cannot cross tenants**, and **unit access can never succeed on an unresolved organization**.

---

## 11. Targeted test matrix

### SEC-01 — `5c20-sec01-hospitals-scope.spec.ts` (14 tests, all pass)
| # | Scenario | Result |
|---|---|---|
| 1 | VIEWER same organization → only own hospital | ✅ |
| 2 | VIEWER different organization → foreign hospital absent | ✅ |
| 3 | SUPERVISOR same organization → organization scope preserved | ✅ |
| 4 | SUPERVISOR different organization → foreign detail denied (null) | ✅ |
| 5 | unresolved/null organization (no org, no RBAC) → 403 | ✅ |
| 6 | nonexistent hospital → null (no leak) | ✅ |
| 7 | cross-tenant enumeration attempt → other org records excluded | ✅ |
| 8 | response does not leak another org's records (RBAC hospital-scope path) | ✅ |
| 9 | platform SYSTEM_ADMIN (null-org RBAC) keeps full catalog (explicit) | ✅ |
| 10 | legacy system_admin with null org keeps full catalog (explicit) | ✅ |
| 11 | controller `findAll` delegates with `req.user` (server-side scoping) | ✅ |
| 12 | controller `findOne` null → 404 (fail closed) | ✅ |
| 13 | controller propagates tenant 403 from service | ✅ |
| 14 | controller `findAll` propagates tenant 403 (null-org non-admin) | ✅ |

### SEC-02 — `5c20-sec02-unitscope-failclosed.spec.ts` (13 tests, all pass)
| # | Scenario | Result |
|---|---|---|
| 1 | SUPERVISOR same-org unit → allowed | ✅ |
| 2 | SUPERVISOR different-org unit → denied | ✅ |
| 3 | SUPERVISOR null org → denied (both with/without target org) | ✅ |
| 4 | FIELD_SUPERVISOR same unit → allowed | ✅ |
| 5 | FIELD_SUPERVISOR sibling unit → denied | ✅ |
| 6 | FIELD_SUPERVISOR different org → denied | ✅ |
| 7 | FIELD_SUPERVISOR null org → denied even for assigned unit | ✅ |
| 8 | unknown/nonexistent unit → denied (strict role) | ✅ |
| 9 | unresolved user organization → denied (any role) | ✅ |
| 10 | no cross-tenant access path (supervisor + field supervisor) | ✅ |
| 11 | explicit platform SYSTEM_ADMIN (null-org RBAC) → preserved | ✅ |
| 12 | legacy system_admin with null org → preserved | ✅ |
| 13 | unit-only FIELD_SUPERVISOR RBAC does not rescue unresolved-org user | ✅ |

---

## 12. Backend validation

| Check | Result |
|---|---|
| Targeted 5C.20 P1 suite | **27/27 pass** (2 files) |
| Existing scope/auth suites rerun (5C.7/8/9/10/11, units, personnel, devices, device-status, org-hierarchy, supervisor, supervisor-center, handover-notes 5c14) | **162/162 pass** |
| 5C.18 gate suites (direct 11, export 14, confinement 7) + security-invariants 12 + device-status 6 | **58/58 pass** |
| TypeScript `tsc --noEmit` | **CLEAN** |
| `nest build` (production) | **PASS** (dist cleared to avoid stale-lock EBUSY) |
| Full backend regression `vitest run` | **981 pass / 10 fail** (90 files; 89 files pass) |
| Failing file | `device-off.spec.ts` — see §14 (environment-only, pre-existing) |

---

## 13. Frontend validation

| Check | Result |
|---|---|
| FE-01 regression (`schedule-service.version` 10 + `api-service.transport` 5) | **15/15 pass** |
| TypeScript `tsc -p tsconfig.app.json --noEmit` | **CLEAN** |
| Production build (`--configuration=production`) | **PASS** (pre-existing budget warnings only: onkoloji/plans/firevibe SCSS + 4 JS chunk budgets; identical to baseline) |

No frontend files were modified in 5C.20.

---

## 14. Known environment/pre-existing disclosures

- **Backend `device-off.spec.ts` (10 tests):** requires a live PostgreSQL at `localhost:5432`; unavailable in this environment → `PrismaClientInitializationError`. Pre-existing, environment-only, files untouched, out of scope. These are the ONLY failing tests (accounted for: baseline 954 pass, now 981 pass, both with exactly these 10 environmental failures).
- **Frontend legacy/stale non-runnable spec files (48 tests / 8 files):** documented in the 5C.19 audit; out of scope and not run; 5C.20 does not change them.
- Frontend targeted vitest requires `--pool=threads --no-file-parallelism` on this machine (fork-pool worker startup timeout) — transient tooling configuration, not a code defect.
- `nest build` needed a `dist` clear once (EBUSY on an old artifact from a concurrent/first build) — no code impact.

None of these represent a security or functional regression introduced by 5C.20.

---

## 15. 5C.17 regression

All Phase 5C.17 fixes confirmed intact in the full regression run:

| 5C.17 gate | Suite | Result |
|---|---|---|
| Personnel organization isolation | `5c17-personnel-scope` (17) | ✅ |
| Device organization isolation | `5c17-devices-scope` (8) | ✅ |
| Status mutation protection | `5c17-update-status-gate` (5) | ✅ |
| Published-plan mutation protection | `5c17-published-mutation-gate` (8) | ✅ |
| Rollback/swap preservation | `5c17-rollback-swap-preservation` (5) | ✅ |
| Export protection | `5c17-export-unit-resolution` (6) | ✅ |
| Four-eyes (submit≠approve) | `5c17-approve-four-eyes` (4) | ✅ |
| RBAC role dominance/org containment | `5c11-authz-consistency` (25), `5c12-ownership-hardening` (14), `rbac-enterprise` (11), `unit-scope-authz` (28) | ✅ |

---

## 16. 5C.18 regression

| 5C.18 fix | Gate | Result |
|---|---|---|
| DIRECT-01 (no force-publish on direct assign) | `5c18-direct-assign-gate` (11, incl. unauthorized-role) | ✅ |
| EXP-01 (sanitize + collision + export-level resolution) | `5c18-export-worksheet-name` (14) | ✅ |
| RT-01 (unit/service confinement) | `5c18-unit-confinement` (7) | ✅ |
| FE-01 (versioned transport + ApiService) | FE `schedule-service.version` (10) + `api-service.transport` (5) = 15 | ✅ |

---

## 17. Remaining P2/P3 findings — DOCUMENT ONLY

No P2/P3 implementation was performed. Standing findings from the 5C.19 audit (unchanged) include:
- P2: `PRF-01` N+1 patterns · `PRF-02` cache unused · `ARC-01` dual scheduling stacks · `SEC-03` publish actor distinctness (strengthening) · `DOM-01` DutyRoster version unchecked · `DB-01` 13+ hot FKs unindexed.
- P3: `ARC-02/03` duplicate modules/services · `OPT-01/02` strategy enum / dead `SeededRandom` · `TEST-01` 8 stale FE specs · `UX-01/02` legacy routes & copy · `DB-02` additive-only CI gate · `SEC-04/05` role gradation & free-text bounds · `OPS-01` alerting · `PRF-03` export batching.

These remain roadmap items (5C.21+ per the 5C.19 report) and are intentionally absent from this phase.

---

## 18. Final verdict

**Verdict: PASS WITH WARNINGS**

- **SEC-01 — CLOSED (demonstrated, not just test-green):** authorization is re-verified at the actual server path — the controller delegates to tenant-scoped service methods that filter on `Organization.hospitalId`/RBAC hospital/group scope, throw 403 before any query when the tenant is unresolved, and return opaque 404 for out-of-tenant/unknown ids. The cross-tenant boundary is enforced in code, not by a passing mock.
- **SEC-02 — CLOSED (demonstrated, not just test-green):** `canAccessUnit` is the single decision point consulted by every resolvable-target unit-scope flow (`UnitScopeGuard`, `units`, `devices`, `device-status`, `device-lifecycle`, `handover-notes`); the fail-closed guard (`scope.organizationId == null → deny`) sits at the top of that decision function, and the only surviving unresolved-org allow is the explicitly-modeled platform SYSTEM_ADMIN.
- **Warnings are exclusively the documented environment/pre-existing disclosures** of §14 (backend live-Postgres `device-off`; stale FE specs); they are not related to this implementation and do not affect either P1.

**Constraint compliance:** no P2/P3 implemented, no optimizer/GA work, no unrelated refactoring, no schema/migration, no security weakening, no threshold changes, no skipped tests, no destructive git operations, no Phase 5C.21 started.

*Files: 3 production files + 2 new test files. Backend 981 pass / 10 env-only fail. FE 15/15, tsc clean, prod build pass.*

---

STOP — Phase 5C.20 P1 security hardening complete; awaiting review.