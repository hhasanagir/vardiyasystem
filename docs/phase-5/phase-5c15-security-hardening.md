# Phase 5C.15 — Security Hardening: Full Scope (A–F), Expected-Version Optimism, Cross-Endpoint Consistency

**Date:** 07 Eylül 2026
**Scope:** Backend (NestJS), RBAC/authorization, seed guard, concurrency, cross-endpoint authz consistency
**Canonical checkout:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`

---

## Overview

Phase 5C.15 completes the remaining security-hardening work authorized for full scope (A, B, C, D, E, F). Every scoped data path in the audited modules is now enforced at the **service/data-access layer** (not only via guards), the production seed path cannot auto-create administrative users, legacy schedule mutations support optimistic-concurrency preconditions, and cross-endpoint authorization is verified for route+method+minimum-role consistency.

| ID | Finding | Fix |
|----|---------|-----|
| **SEC-A** | Production `onModuleInit` seed could create admin `user` rows in prod | `ensureUsers()` gated on `NODE_ENV === 'production'` → skipped; `seedPassword` undefined in prod; `ensurePersonnelGroups()` kept (no users) |
| **SEC-B** | Legacy schedule mutations applied blind updates with no version precondition | `bumpScheduleVersion(tx, id, expectedVersion?)` — provided expectedVersion ⇒ `updateMany({ where:{id, version} })`, `count===0` ⇒ 409 `SCHEDULE_VERSION_CONFLICT`; legacy (undefined) keeps original `update({ increment:1 })`. 6 methods extended (`addAssignment`, `overrideAssignment`, `directAssign`, `updateAssignment`, `removeAssignment`, `rollback`); controller wires `@Query('expectedVersion')` |
| **SEC-C/D** | Asset-management, quality, device-status, device-lifecycle, device-incidents lacked service-level org/unit scope | Org-scope cluster: `UnitScopeService`/scope params applied at service layer with fail-closed strict-unit rules; controllers derive scope from `req.user` (never client input) |
| **SEC-E** | Emergency-access endpoints were not org-isolated | `requestAccess`/`revokeAccess`/`getActiveGrants`/`getGrantHistory` filter by caller `organizationId` (via `user.organizationId`); cross-org target ⇒ 403; controller passes `req.user.organizationId` |
| **SEC-F** | Cross-endpoint authorization consistency untested | 30-test spec asserting route method+path metadata and minimum-role (method- or class-level `@Roles`) for all hardened mutation endpoints |

---

## New / Updated Tests

| File | Coverage | Tests | Status |
|------|----------|-------|--------|
| `__tests__/5c15-sec-a-seed-guard.spec.ts` | SEC-A | 4 | ✅ PASS |
| `schedules/__tests__/5c15-sec-b-expected-version.spec.ts` | SEC-B | 3 | ✅ PASS |
| `asset-management/__tests__/5c15-sec-c-asset-scope.spec.ts` | SEC-C | 8 | ✅ PASS |
| `quality/__tests__/5c15-sec-d-scope.spec.ts` | SEC-D (quality + lifecycle + incidents + status) | 16 | ✅ PASS |
| `emergency-access/__tests__/5c15-sec-e-emergency-access.spec.ts` | SEC-E | 6 | ✅ PASS |
| `rbac/__tests__/5c15-sec-f-cross-endpoint.spec.ts` | SEC-F | 30 | ✅ PASS |

**67 new tests total.** All pre-existing and prior-phase specs remain green (see Validation Results).

### Test conventions
- **SEC-A:** constructs the seed service with a mock Prisma whose `user` model is *absent*; asserts `ensureUsers` is never invoked and `ensurePersonnelGroups` still runs under production `NODE_ENV`; asserts dev `SEED_ADMIN_PASSWORD` is read only outside production.
- **SEC-B:** passes an `expectedVersion` and asserts the `updateMany` precondition path (conflict ⇒ 409); asserts legacy (undefined) path keeps the original `update({ version: { increment: 1 } })` shape so `5c6-hardening.spec.ts` semantics are preserved.
- **SEC-C/D/E:** instantiate services with mocked Prisma / real `UnitScopeService` and assert 403 fail-closed on cross-org, cross-unit, and null-scope; org containment filters asserted on `where` objects.
- **SEC-F:** reads Nest route metadata (`path`, `method`) and `@Roles(ROLES_KEY)` at method/class level for every hardened mutation endpoint; asserts route string + minimum role.

---

## Validation Results

### Backend — full test suite
`npx vitest run` (78 files):

```
Test Files  78 passed (78)
     Tests  877 passed (877)
```

- **877/877 pass, 0 failures.** Up from 810 (5C.14) — +67 new tests.
- `5b3-performance-failure.spec.ts` (12 tests) is timing-sensitive. In an earlier parallel full-suite run, `small (10 personnel)` reported 117 ms vs `<100 ms`; isolated re-run passed (12/12), and a subsequent full-suite run passed (877/877) with no failure. Classified as **load-induced flake**, unrelated to 5C.15 (no optimizer/fatigue engine touched).

### Backend — build
`npx tsc --noEmit -p tsconfig.json` (backend): **clean, zero errors.**

### Frontend — typecheck + build
`npx tsc --noEmit`: **clean.**
`ng build --configuration production`: **succeeds.** Warnings are pre-existing budget excess only (initial bundle, several SCSS/lazy chunks) — unrelated to 5C.15 (backend-only edits).

---

## Final Security Matrix (18 invariants)

| # | Invariant | Where | Verified |
|---|-----------|-------|----------|
| 1 | Production seed never invokes user creation | `seed.service.ts` `onModuleInit` / SEC-A | ✅ |
| 2 | `SEED_ADMIN_PASSWORD` is ignored in production | `seed.service.ts` | ✅ |
| 3 | `ensurePersonnelGroups` (non-user seed) remains required | `seed.service.ts` / SEC-A | ✅ |
| 4 | Legacy schedule mutations preserve pre-5C.15 behavior when `expectedVersion` absent | `bumpScheduleVersion` / `5c6-hardening.spec.ts` green | ✅ |
| 5 | Provided `expectedVersion` mismatch ⇒ 409 `SCHEDULE_VERSION_CONFLICT` | `bumpScheduleVersion` / SEC-B | ✅ |
| 6 | `expectedVersion` is derived from controller query param, balanced by strong identity (id + role) — never a client-authoritative scope | `schedules.controller.ts` / SEC-B, SEC-F | ✅ |
| 7 | Asset-management create forces caller org / rejects foreign org | SEC-C | ✅ |
| 8 | Asset-management read/mutation paths assert asset scope (org-or-unit) fail-closed | SEC-C | ✅ |
| 9 | Quality records scoped by unit containment (org via unit set / asset org) | SEC-D | ✅ |
| 10 | Quality approver resolved from request identity, arity preserved for `approveRecord(id, approvedById)` | `5c14-approve-actor.spec.ts` green | ✅ |
| 11 | Device-lifecycle events scoped via related asset org/unit | SEC-D | ✅ |
| 12 | Device-status read/update paths guarded by target-unit access (403/404) | `device-status.controller.ts` | ✅ |
| 13 | Device-incidents create respects `IncidentScope` (denyAll ⇒ 403; org mismatch ⇒ 403; unit mismatch ⇒ 403) | SEC-D | ✅ |
| 14 | Device-incidents list denies via impossive filter (`denyAll` ⇒ `unitId: __deny_all__`) | SEC-D | ✅ |
| 15 | Emergency-access grant/revoke/lists filtered by caller organization (cross-org target ⇒ 403) | SEC-E | ✅ |
| 16 | Controller scope derives from `req.user` (never client-supplied `organizationId`/`unitId`) | controllers (asset, quality, life-cycle, incidents, status, emergency) | ✅ |
| 17 | Every hardened mutation endpoint routed at expected method+path | SEC-F (30 route/role assertions) | ✅ |
| 18 | Every hardened mutation endpoint gated at expected minimum role (method- or class-level) | SEC-F | ✅ |

---

## Data / Repo Integrity

### Protected files (SHA-256, Desktop) — unchanged from 5C.14
| File | SHA-256 | Matches 5C.14 |
|------|---------|---------------|
| `backend/prisma/schema.prisma` | `9559126C8961EF13017FD63D44AD4ADEDCFBB8AD60A8E1DFA71EDB8366341E6E` | ✅ |
| `.env.production.example` | `44BA992BB034B4424FFF03DEA6FC971180696AEE6ECC8415A89A7F7A380E0268` | ✅ |
| `docker-compose.yml` | `DA06150C49CA17D1022613862078707FBB5D30E8C6B981C5CF244436FFF6FAE3` | ✅ |
| `docker-compose.prod.yml` | `17B1F2F5AC90D109A8DB8006B0CE45A05D32CBAC0AB593408C1C318C0D7FA3D5` | ✅ |
| `package-lock.json` | `D7E946FB447C0BCC7EE9EFE37F752A12E618AB62D336AA9C729A46C6D8572C4E` | ✅ |
| `backend/package-lock.json` | `C532D5B7C333158F76C41F7350CB4F4564F7E0FE15C4AB7D7F5017A560D0C663` | ✅ |

- All protected files byte-identical to their 5C.14 recorded hashes. No migration, schema, or seed artifact file was modified.

### Files modified (Phase 5C.15) — Desktop hashes
| File | SHA-256 |
|------|---------|
| `backend/src/seed.service.ts` | `E19A4D87021A3F33531C3B4C25BEEAAC33DE50F4E56CDB33CD36FEBBF409D3F1` |
| `backend/src/modules/schedules/schedules.service.ts` | `BB50F5CA849F87E7D165B003B3DC1992559060E596E107EC4617FF72FBAE8939` |
| `backend/src/modules/schedules/schedules.controller.ts` | `81EE48245D53D4FA2CEB037FE4486491CB13D211327E9AE308DAB85B879C95E8` |
| `backend/src/modules/schedules/schedule-auto-generator.service.ts` | `EEC73F760C9F08B650B9C2EF2CD17E342EC92C81BF00343138A2C80DC1C92D0E` |
| `backend/src/modules/emergency-access/emergency-access.service.ts` | `A5B71AEA12CFD87B2D324D9695D702AFCCE6056A91023923B05D72ECC98E97CE` |
| `backend/src/modules/emergency-access/emergency-access.controller.ts` | `AFBC1406E4A706C3E06DBCE576872DF25F81CA7701B9C5DF93A579A644BCD3D4` |
| `backend/src/modules/device-incidents/device-incidents.service.ts` | `EBBAA366A441748147F0AB7588266ABC13320A7B34ADC65C3567BD2B9D8A2A52` |
| `backend/src/modules/device-incidents/device-incidents.controller.ts` | `6D321ED03F35C2E41BB63FC407338CFF50BD23D21BD0B7F5B2F25119ED3318F8` |
| `backend/src/modules/device-status/device-status.service.ts` | `0EE22D67827BD5859156E5A7EAE1F71FE6E0F40CA829C2F82FA776FE5B1A90C3` |
| `backend/src/modules/device-status/device-status.controller.ts` | `C51B1D03B08A5C8C9C7DBB1006161748AB1DA8776EA8448DF8FBDC0FD31E6D94` |
| `backend/src/modules/quality/quality.service.ts` | `6D5A2C5F7BDF566D3F185CAE9DF24F4F7B91C68ED05D2605792C011FCC11E4A2` |
| `backend/src/modules/quality/quality.controller.ts` | `8C9F6AC3B73C7088D214689D2C1AA34A97CA7CCFA865D6E0AC81DFEB5DA316A1` |
| `backend/src/modules/device-lifecycle/device-lifecycle.service.ts` | `BB87CAA9170A01C05D8D4EDA0940EB1E3129B08EC7952002C5BED14F808B7A41` |
| `backend/src/modules/device-lifecycle/device-lifecycle.controller.ts` | `6C3A15D1B8031E9C5E4FB8754DACA5B23A80E892C39DFF368E81EC0AC8376B65` |
| `backend/src/modules/asset-management/asset-management.service.ts` | `2CC135539353CDEE7631E23946E4A3B26B4E10CA60C5BD0E0DCBDFD70A2C0CF8` |
| `backend/src/modules/asset-management/asset-management.controller.ts` | `835065FF1D0C1FAE180027DFA6CE6685F0F7CDAA6CEE487CC6372059BCA6DC31` |

Plus module wiring additions to `RbacModule` imports (`asset-management.module.ts`, `quality.module.ts`, `device-lifecycle.module.ts`, `device-incidents.module.ts`).

### Files created (Phase 5C.15)
1. `backend/src/__tests__/5c15-sec-a-seed-guard.spec.ts` (4)
2. `backend/src/modules/schedules/__tests__/5c15-sec-b-expected-version.spec.ts` (3)
3. `backend/src/modules/asset-management/__tests__/5c15-sec-c-asset-scope.spec.ts` (8)
4. `backend/src/modules/quality/__tests__/5c15-sec-d-scope.spec.ts` (16)
5. `backend/src/modules/emergency-access/__tests__/5c15-sec-e-emergency-access.spec.ts` (6)
6. `backend/src/modules/rbac/__tests__/5c15-sec-f-cross-endpoint.spec.ts` (30)
7. `docs/phase-5/phase-5c15-security-hardening.md` (this report)

### Database artifacts
- Live schema is **PostgreSQL** (`DATABASE_URL` from env). No migration or seed file was modified; no schema drift introduced. Read-only DB checks only.

### Git state notes (pre-existing, not introduced here)
- HEAD is still `eb7a6db "Initial commit"`; working tree is largely untracked (incl. `backend/src/**`), with staged-but-uncommitted files (`AM`/`AD`) — identical to the state recorded in the 5C.14 report. No new tracked-file pollution from this phase.

---

## Recommendations (non-blocking)
- Commit the long-standing working-tree state (incl. `schema.prisma`) to clear the `AD`/untracked noise and create a real diff baseline.
- Run `5b3-performance-failure.spec.ts` in CI only in isolation, or raise the small-case threshold; it is load-sensitive.
- Address budget warnings separately from security work.
- P2 (report-only, no runtime writer): export-handler scoping for `field_supervisor`; `field_supervisor` enum drift alignment.

---

## Verdict

**VARDİYAOS IS RELEASE-READY FROM THE AUDITED SECURITY/ARCHITECTURE PERSPECTIVE.**