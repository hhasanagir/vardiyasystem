# Phase 5C.14 — Security Hardening: Unit Scope, Route Shadowing, Audit Actor

**Date:** 06 Eylül 2026
**Scope:** Backend (NestJS), RBAC/authorization, audit integrity
**Canonical checkout:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`

---

## Overview

Phase 5C.14 hardens five authorization/audit paths in the scheduling API:

| ID | Finding | Fix |
|----|---------|-----|
| **C1** | Route shadowing: `notifications/stats|engagement` could be shadowed by `:id` | Handler wiring verified: `stats`→`getStats`, `engagement`→`getEngagement`, `:id`→`getById`; regression specs |
| **C3** | Quality record approve stored audit `actorId` not from request identity | `approveRecord(req.user.id, ...)`; `QUALITY_RECORD_APPROVED` audit integrity |
| **SEC-A** | Automatic schedule generation bypassed unit scope | `schedule-auto-generator.service` checks `canAccessUnit(...)` on target unit; `{ unitId, organizationId }` fetched via `findUnique` select |
| **SEC-B** | Handover notes had no unit-scope enforcement (create/read/unread/mark-read) | `UnitScopeService` injected; every data path scoped |
| **SEC-3** | DDD schedule-create route could create schedules in foreign units | `@UnitScope({ unitBodyField: 'unitId' })` on DDD controller + `UnitScopeGuard` |

---

## New / Updated Tests

| File | Tests | Status |
|------|-------|--------|
| `notifications/__tests__/5c14-route-order.spec.ts` (C1) | 3 | ✅ PASS |
| `audit-log/__tests__/5c14-route-order.spec.ts` (C1) | 3 | ✅ PASS |
| `skills/__tests__/5c14-route-order.spec.ts` (C1) | 3 | ✅ PASS |
| `schedules/__tests__/5c14-apply-scope.spec.ts` (SEC-A) | 7 | ✅ PASS |
| `handover-notes/__tests__/5c14-scope.spec.ts` (SEC-B) | 15 | ✅ PASS |
| `quality/__tests__/5c14-approve-actor.spec.ts` (C3) | 4 | ✅ PASS |
| `schedules/__tests__/5c14-ddd-create-scope.spec.ts` (SEC-3) | 9 | ✅ PASS |
| `schedules/__tests__/schedule-auto-generator.service.spec.ts` (updated) | 3 | ✅ PASS |

47 tests total (44 new + 3 updated).

### Test conventions
- Route-order specs assert Express metadata: `PATH` precedence of literal routes (`export/csv`, `export/report`, `expiring`, `matrix/all`) over `:id`-style params, `METHOD` = `RequestMethod.GET`, handler names.
- Scope specs instantiate services directly with mocked Prisma; fail-closed assertions (null/absent unit ⇒ denied) for field supervisors, org-level allow for supervisors.

---

## Validation Results

### Backend — full test suite
`npm test` (vitest run, 72 files):

```
Test Files  72 passed (72)
     Tests  810 passed (810)
```

- **810/810 pass, 0 failures.** The Phase 5B.3/5B.4 "8 pre-existing failures" in `schedules.service.spec.ts` are now green (resolved in intervening phases).
- `5b3-performance-failure.spec.ts` (12 tests) is timing-sensitive. One parallel-suite run reported `small (10 personnel)` at 124 ms vs `<100 ms`; isolated re-run passed, and the full-suite re-run passed. Classified as a **load-induced test flake**, unrelated to 5C.14 (no optimizer/fatigue engine code touched).

### Backend — build
`npm run build` (nest build): **clean, zero errors.**

### Frontend — typecheck + build
`npx tsc --noEmit`: **clean.**
`ng build`: **succeeds.** Warnings are pre-existing and unrelated to 5C.14:
- Budget excess (initial bundle 621 kB vs 400 kB; several SCSS/lazy chunks).
- 2× `NG8107` optional-chain diagnostics in `mobile-day-view.component.ts:14`.

---

## Data / Repo Integrity

### Protected files (SHA-256, Desktop)
| File | SHA-256 |
|------|---------|
| `backend/prisma/schema.prisma` | `9559126C8961EF13017FD63D44AD4ADEDCFBB8AD60A8E1DFA71EDB8366341E6E` |
| `.env.production.example` | `44BA992BB034B4424FFF03DEA6FC971180696AEE6ECC8415A89A7F7A380E0268` |
| `docker-compose.yml` | `DA06150C49CA17D1022613862078707FBB5D30E8C6B981C5CF244436FFF6FAE3` |
| `docker-compose.prod.yml` | `17B1F2F5AC90D109A8DB8006B0CE45A05D32CBAC0AB593408C1C318C0D7FA3D5` |
| `package-lock.json` | `D7E946FB447C0BCC7EE9EFE37F752A12E618AB62D336AA9C729A46C6D8572C4E` |
| `backend/package-lock.json` | `C532D5B7C333158F76C41F7350CB4F4564F7E0FE15C4AB7D7F5017A560D0C663` |

- All 28 `backend/prisma/migrations/**/migration.sql` files and `migration_lock.toml`: **byte-identical across checkouts** (see below). Hashes recorded in session for drift detection.

### Cross-checkout equivalence (independent clone of same commit `eb7a6db`)
Every protected file above — incl. all 28 migration SQL files and both lockfiles — is **byte-identical** between `Desktop\vardiyasystem` (canonical) and `Belgeler\GitHub\vardiyasystem` (stale sibling checkout).

**Single exception:** `backend/prisma/schema.prisma` differs (Desktop has ~40 extra lines: `field_supervisor`/`project_manager`/`chief_technician`/`hr` enum additions and org-scope models). This predates 5C.14 — the phase's edit set (verified this session) contains only:

| File | Desktop | Belgeler | Status |
|------|---------|----------|--------|
| `notifications/notifications.controller.ts` | `630974CB…` | `44460331…` | DIFF (phase edit) |
| `quality/quality.controller.ts` | `7B2F4B90…` | `AB6E4777…` | DIFF (phase edit) |
| `schedules/schedules.controller.ts` | `892AF896…` | `B4ABBC17…` | DIFF (phase edit) |
| `schedules/schedule-auto-generator.service.ts` | `20C022A7…` | `C1D1EE4A…` | DIFF (phase edit) |
| `schedules/schedules-ddd.controller.ts` | `5D5B09C9…` | `50C001A2…` | DIFF (phase edit) |
| `handover-notes/handover-notes.service.ts` | `BEF2A7D3…` | `BA0F9BAD…` | DIFF (phase edit) |
| `handover-notes/handover-notes.controller.ts` | `7381CA8D…` | `39427433…` | DIFF (phase edit) |

Plus the 7 new spec files and the auto-generator spec update (absent/stale in the sibling). The `schema.prisma` divergence is a pre-existing staged-but-uncommitted difference from earlier phases — flag for a future commit.

### Database artifacts
- Live schema is **PostgreSQL** (`backend/prisma/schema.prisma`, `env("DATABASE_URL")`). No migration or seed file was modified; no schema drift introduced.
- `backend/prisma/dev.db` is a **0-byte** leftover SQLite placeholder (`E3B0C442…`); `dump.rdb` (309 B) is a local Redis RDB; `query` (19 B) is a scratch file. All unchanged.

### Git state notes (pre-existing, not introduced here)
- HEAD `eb7a6db "Initial commit"` tracks almost nothing; working tree is largely untracked, with staged-but-uncommitted files (`A/AM`) and two `AD` (staged-then-deleted) migration entries from the original `git add` — present identically in both checkouts before this phase.

---

## Files Modified (Phase 5C.14)
1. `backend/src/modules/notifications/notifications.controller.ts` — handlers verified (C1).
2. `backend/src/modules/quality/quality.controller.ts` — approval actor from `req.user` (C3).
3. `backend/src/modules/schedules/schedules.controller.ts` — apply-route audit metadata (SEC-A).
4. `backend/src/modules/schedules/schedule-auto-generator.service.ts` — unit-scope enforcement (SEC-A).
5. `backend/src/modules/schedules/schedules-ddd.controller.ts` — `@UnitScope` on create (SEC-3).
6. `backend/src/modules/handover-notes/handover-notes.service.ts` + `handover-notes.controller.ts` — unit-scope enforcement (SEC-B).

## Files Created (Phase 5C.14)
1. `backend/src/modules/notifications/__tests__/5c14-route-order.spec.ts`
2. `backend/src/modules/audit-log/__tests__/5c14-route-order.spec.ts`
3. `backend/src/modules/skills/__tests__/5c14-route-order.spec.ts`
4. `backend/src/modules/schedules/__tests__/5c14-apply-scope.spec.ts`
5. `backend/src/modules/handover-notes/__tests__/5c14-scope.spec.ts`
6. `backend/src/modules/quality/__tests__/5c14-approve-actor.spec.ts`
7. `backend/src/modules/schedules/__tests__/5c14-ddd-create-scope.spec.ts`
8. `docs/phase-5/phase-5c14-security-hardening.md` (this report)

---

## Recommendations
- Commit the long-standing working-tree state (incl. `schema.prisma`) to clear the `AD`/untracked noise and create a real diff baseline.
- Run `5b3-performance-failure.spec.ts` in CI only in isolation, or raise the small-case threshold; it is load-sensitive.
- Address budget warnings (initial bundle 621 kB vs 400 kB) separately from security work.