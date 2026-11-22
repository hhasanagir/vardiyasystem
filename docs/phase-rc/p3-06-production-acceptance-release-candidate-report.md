# P3.6 — Production Acceptance (Release Candidate) Report

**Status:** P3.6 = COMPLETE
**Date:** 2026-09-27
**Scope decision:** User-selected "production kabul". End-to-end browser acceptance against the real
Angular client and the real NestJS API, plus the full backend and frontend regression gates.

---

## 1. Motivation

P3.1–P3.5 hardened specific areas one at a time, each with its own report. None of them answered the
only question a release decision actually turns on: *does the assembled product work, in a real
browser, for the real roles, against the real database?* Every earlier phase left that open. P3.6
existed to close it, and its rules were deliberately unforgiving:

- the browser suite drives the real UI and the real API — no mocks, no fixtures injected into
  component state, no assertions on values the test itself wrote;
- no `.skip` / `.only` / `xit` / `@ts-ignore`, no swallowed errors, no `waitForTimeout` sleeps, no
  thresholds lowered to make a run pass, and no test deleted to make a suite green;
- a test that needs a precondition must create that precondition through the product's own
  behaviour, and must clean up after itself.

The suite was expected to find real defects. It did: three of them are product bugs that no
backend or unit gate had detected, and they are documented in §4.

## 2. What was built

### 2a. Browser acceptance harness

| File | Purpose |
| --- | --- |
| `e2e/playwright.config.ts` | Real web servers (`node dist/src/main.js`, `ng serve --proxy-config`), one worker, trace + screenshot + list reporter, global setup/teardown. |
| `e2e/fixtures/browser-fixtures.ts` | Creates the accounts and data the suite needs through Prisma, and removes them again. |
| `e2e/fixtures/global-setup.ts` | Logs every account in through the real API (CSRF handshake included) and writes a Playwright storage state per role. |
| `e2e/fixtures/global-teardown.ts` | Deletes the accounts, their sessions/attempts/audit rows, the plan schedule and the audit fixture record; drops the generated tokens. |
| `e2e/fixtures/auth.ts` | Storage-state paths and `signedInContext()`. |
| `e2e/tsconfig.json` | Browser TypeScript project, resolving Prisma/bcrypt from the backend's own `node_modules`. |

Accounts: `e2e.supervisor@e2e.local` (supervisor), `e2e.technician@e2e.local` (technician),
`e2e.engineer@e2e.local` (medical_engineer), plus the seeded `admin@hospital.com` for cross-tenant
system flows. Each account is attached to a real unit, so it carries a tenant and is subject to the
same `TenantContextInterceptor` filtering as production — a tenant-less account would be refused and
would prove nothing. Each also gets a `user_role_assignments` row, because the client resolves route
permissions from `/rbac/me/permissions` (which reads the RBAC table, not the legacy `user.role`
column); without an assignment every `rbacGuard` route would refuse the account and the specs would
be testing a stripped-down user.

Data fixtures: a draft MR schedule for October 2026 (the grid renders nothing without one, and it
carries the 29 October national holiday), and a dedicated personnel row for the audit spec to edit.

State-changing API calls made by the suite use the real `csrf-token` cookie plus a matching
`x-csrf-token` header. No token is written to a log, a report or a committed file.

### 2b. Specs (44 tests, all against the real product)

| Spec | Covers |
| --- | --- |
| `auth.browser.spec.ts` | Login screen, wrong password, valid login, reload, unauthenticated deep link, logout. |
| `auth.spec.ts` | The session storage contract itself: token pair, JWT shape, tenant claims, logout clearing, rejected login storing nothing, guest guard. |
| `rbac.browser.spec.ts` | Technician refused from supervisor and live-tracking routes; supervisor reaches approval; engineer reaches live tracking. |
| `personnel-e2e.spec.ts` | Seeded roster renders, search narrows it, no-match empty state, department filter, technician refused. |
| `audit.spec.ts` | Aggregate statistics, rapid-change detection, technician refused. |
| `livesync.spec.ts` | Live board renders, clock matches wall-clock time, supervisor and engineer allowed, technician refused. |
| `schedule.spec.ts` | Each unit plan page, month navigation, month picker, national holiday marking, reload. |
| `production-verification.spec.ts` | Session survives in another tab, reports page and tabs, export dialog cancel, CSV download, unknown route with and without a session, every unit plan route. |
| `vardiyasystem.spec.ts` | Dashboard figures for a supervisor, refresh control, plan page reached from the dashboard. |

## 3. Defects found and fixed

### 3a. `RbacService.ensureLoaded()` raced the route guard (product bug, high impact)

`ensureLoaded()` began with `if (this.loaded() || this.loading) return;`. The service starts a load in
its constructor, so a guard arriving while that request was still in flight received a resolved
promise while `permissions()` was still empty — and denied a route the account was entitled to. A
fresh deep link to `/app/employees` or `/app/reports` bounced the user to the dashboard even though
`/rbac/me/permissions` returned `personnel.read` and `analytics.read`.

Fixed by sharing the in-flight promise between concurrent callers instead of returning early, in
`frontend/src/app/services/rbac.service.ts`. The same early-return shape existed in the private unit
loader (`if (this.unitsLoading) return []`), which handed an empty unit list to anyone who arrived
mid-request; it now shares its request as well. Fail-closed behaviour is unchanged: a failed load
grants nothing and is not retried within the session.

### 3b. The personnel roster was filtered to the supervisor's own department (product bug)

`EmployeeService.getAll()` always sent `unitId` = the caller's own unit. A supervisor owns a
department unit of its own (`supervizor`, in this database empty), so "Personel Yönetimi" rendered
zero of the 172 seeded employees. The server contract is the opposite and is pinned by
`5c17-personnel-scope.spec.ts`: a `SUPERVISOR` is organization-scoped, and only a `FIELD_SUPERVISOR`
is pinned to a single unit.

Fixed in `frontend/src/app/services/employee.service.ts`: the unit filter is sent only when the
caller is unit-scoped. Creating and updating personnel still default to the caller's unit.

### 3c. "İndir" on the reports page downloaded nothing (product bug)

`ReportsComponent.exportToExcel()` only pushed the toast "Dışa aktarma hazırlanıyor…" — no file was
produced, while the dialog and the button both promise a CSV. Implemented for real in
`reports.component.ts`, using the daily rows already on screen plus a totals row, UTF-8 BOM, and the
same Blob/anchor download the existing working-hours export uses. The CSV text itself lives in the
new dependency-free `reports-csv.ts` so it can be asserted directly.

### 3d. Two test-quality defects that would have hidden regressions

- The audit spec asserted `.suspicious-list` was visible "either populated or empty" — but the panel
  is only rendered when a heuristic fires, so the assertion was really "some other test left activity
  in the database". It now drives the real `PUT /personnel/:id` endpoint as the supervisor until the
  rapid-change threshold (10 updates/hour) is genuinely met, and then asserts the panel names that
  account. The target row is a fixture and is deleted in teardown.
- The personnel search spec derived its search term from `.card-header`, which holds the avatar
  initials ("AO") — not a field the search matches, so the filtered list was legitimately empty and
  the test failed for the right reason. It now takes the term from `.person-name` and additionally
  asserts the list strictly shrinks and every survivor matches.

### 3e. One UI defect found by the suite

The plan page's month label (`.current-month`, `min-width: 140px`) overflowed its container and
intercepted clicks on the 34px previous-month button, so month navigation was unusable by mouse.
Fixed with a dedicated `.month-btn` width in `plan-page.component.scss`.

## 4. Regression gates (all green, all re-run after the fixes)

| Gate | Command | Result |
| --- | --- | --- |
| Backend build | `npm run build` (backend) | PASS |
| Backend unit | `npm run test` (backend) | 104 files, 1172/1172 PASS |
| Backend E2E | `npm run test:e2e` (backend) | 10 files, 85/85 PASS |
| Frontend types | `npx tsc --noEmit` (frontend) | PASS |
| Frontend unit | `npx vitest run` (frontend) | 18 files, 153/153 PASS (140 before this phase, +13 new) |
| Frontend build | `npx ng build` (frontend) | PASS, 625.68 kB initial / 153.31 kB transfer, no warnings |
| Browser types | `npx tsc --noEmit` (e2e) | PASS |
| Browser acceptance | `npx playwright test` (e2e) | **44/44 PASS** |

## 5. Database hygiene

The suite is required to leave the database as it found it. Verified after the sign-off run:

- fixture accounts: 0
- `user_role_assignments` with `assignedBy = 'browser-e2e'`: 0
- audit fixture personnel row: 0
- October 2026 schedules: 0
- seeded personnel: 172 (unchanged)

Generated storage states, the HTML report and the trace/screenshot output are removed at the end of
each run; no token survives.

## 6. Decision

**P3.6 = COMPLETE.**

The three product defects found by this phase (RBAC load race, supervisor roster scoping, dead
export button) were all reachable in a real browser by an ordinary user and all pre-date this phase;
none was caught by the unit or backend E2E gates, which is precisely the gap this phase existed to
close. With them fixed, the full browser acceptance suite passes against the real stack, and the
backend and frontend regression gates are green.

Scope limits, stated plainly rather than as caveats: the suite runs Chromium only, in a single
worker, on Windows; the seeded database carries no schedules outside the fixture month, so
schedule-dependent reporting is exercised through the fixture month; and the five unit plan pages
are covered as a route-sweep rather than with per-unit business assertions.

## 7. Artefacts

- `e2e/playwright.config.ts`, `e2e/fixtures/*`, `e2e/*.spec.ts`
- `frontend/src/app/services/rbac.service.ts` (3a)
- `frontend/src/app/services/employee.service.ts` (3b)
- `frontend/src/app/components/reports/reports.component.ts`, `reports-csv.ts` (3c)
- `frontend/src/app/features/plans/plan-page.component.{html,scss}` (3e)
- `frontend/src/app/services/__tests__/rbac.service.spec.ts`,
  `frontend/src/app/services/__tests__/employee.service.spec.ts`,
  `frontend/src/app/components/reports/__tests__/reports-csv.spec.ts`
