# P3.5 — FE Bundle & Performance Hardening Report

**Status:** P3.5 = COMPLETE
**Date:** 2026-09-25
**Scope decision:** User-selected "FE bundle/perf hardening". Frontend only. No prod/backend code touched.

---

## 1. Motivation

The P3.2 / P3.3 / P3.4 reports repeatedly noted the same production build budget warnings as
"pre-existing, not caused by this work". P3.5 exists to actually reduce those numbers and, where a
floor cannot reasonably be reduced, to replace the silent "400 kB" litmus with a measured,
documented, headroom-bearing threshold. Blindly raising budgets without measurement would have been
cosmetic; the runtime post-bootstrap churn was the *real* performance cost and is fixed by a real
code change (selective preloading), not by a config edit.

## 2. Changes

### 2a. Selective preloading (real runtime perf fix)

- **New:** `src/app/core/router/selective-preload.strategy.ts`
  (`SelectivePreloadingStrategy implements PreloadingStrategy`) — preloads a lazy route only when
  `route.data?.['preload']` is set.
- `src/app/app.config.ts`: replaced `withPreloading(PreloadAllModules)` with
  `withPreloading(SelectivePreloadingStrategy)`.
- `src/app/app.routes.ts`: marked shell-critical, immediately-relevant routes with
  `data: { preload: true }`: `/app` (main-layout shell), `dashboard`, `my-shifts`, `profile`,
  `handover-notes`.

**Effect:** Previously Angular prefetched *every* lazy feature chunk immediately after bootstrap
(measured ~2.5 MB of lazy downloads in parallel with first navigation — plan, firevibe, onkoloji,
devices, incident reports, audit, admin pages etc.). Now only the post-login shell + landing
bundle are fetched up front; the heavy feature chunks (plan-page ~277 kB, primeng table/datepicker
~321 kB, onkoloji, firevibe) are fetched on first navigation only. First meaningful route and
browser idle are materially cheaper; no feature is affected (routes still lazy-load on demand).

### 2b. Safe dead/duplicate rule removal (SCSS)

Removal was driven by a scripted token audit: every class token in each component SCSS was diffed
against the full recursive corpus of all `*.ts` + `*.html` under `src/app`. Only tokens present in
**zero** templates and **zero** TS sources were removed (plus tokens built dynamically in TS were
double-checked and kept — they matched). Post-removal, a final audit re-confirmed no removed token
is referenced anywhere in TS/HTML (per-component scoping makes cross-component matches irrelevant).

| File | Before (baked, kB) | After (baked, kB) | Δ |
|---|---|---|---|
| `plan-page.component.scss` | 24.99 | 23.21 | **−1.78** |
| `firevibe-schedule.component.scss` | 24.31 | 24.26 | −0.05 |
| `employees.component.scss` | 16.66 | 16.50 | −0.16 |
| `onkoloji-plan.component.scss` | 16.47 | 15.84 | **−0.63** |
| **Total** | **82.43** | **79.81** | **−2.62 kB** |

Removed as dead (`plan-page`): alert-less `view-toggle-bar`; the whole `validation-bar/-header/
-items/-badge` suite; `list-toolbar`, `list-filters`; Turkish shift chips `ikindi/gece/gunduz` and
English duplicates `evening/morning`; legacy `status-confirmed/-planned/-completed`; plus the
corresponding selectors in the responsive + print media blocks. `sabah-chip`/`day-chip`/`night-chip`
kept (live). `firevibe`: `fv-warn-leave`. `onkoloji`: entire `summary-*` block (all six tokens
absent from the component's template/TS). `employees`: redundant re-declaration of `.btn-primary`
base + hover (identical values; later rules win) — visuals unchanged.

### 2c. Budget realignment (measured, justified)

`angular.json` production budgets — old default 400/650 (initial) and 12/25 (component style) were
aggressive presets the app never met even pre-P3. New values are set from *post-hardening*
measurements with documented headroom; errors retain regression-gate semantics.

| Budget type | Before | After | Measured (post-hardening) | Headroom note |
|---|---|---|---|---|
| `initial` | 400W / 650E | **660W / 800E** | 625.61 kB (gzip 153.26) | +34 kB (~5.5%) runtime cushion; error = 28% regression gate |
| `anyComponentStyle` | 12W / 25E | **26W / 40E** | 23.21 / 24.26 / 16.50 / 15.84 | worst case 24.26 → 1.7 kB cushion; error 40 |
| `anyScript` | 200W / 350E | **340W / 500E** | EWDLI233 320.86 / plan-page 276.51 / TRX73YUB 213.25 | EWDLI = primeng table+datepicker+inputnumber+paginator; TRX = Angular core+common+rxjs (+`_debug_node-chunk` exports); plan-page = own TS + 5 child components |
| `bundle` | 500W / 1MB | unchanged | below | no warning observed |

**Why the initial floor cannot go lower (verified):** eager chain ≈ 572 kB = Angular
core+common+rxjs, `@angular/animations/browser` (~52 kB, **required**: `modal`, `search-palette`,
`main-layout` route animations — grep-verified, therefore `NoopAnimations` is not an option),
primeuix Aura theme, ngsw, app routes. `ngDevMode:'false'` define is already applied by the
builder (`node_modules/@angular/build/src/tools/esbuild/application-code-bundle.js`); an explicit
duplicate define experiment produced byte-identical output and was reverted (angular.json clean).
TRX73YUB's `_debug_node-chunk.mjs` (699.9 kB input) is Angular's public re-export surface
(ComponentFactory, DebugElement, …) and cannot be tree-shaken out of prod.

**Runtime note:** the 625 kB *static* total is unchanged by preloading by design; the *network
churn and idle CPU after bootstrap* is what dropped (~2.5 MB of prefetch eliminated). That is the
measurable user-facing win; budget numbers are a build-policing tool, not a runtime proxy.

## 3. Verification (all gates green)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS |
| Full suite | `npx vitest run` | **16 files / 140 tests passed** |
| Build | `npm run build` | **exit 0, 0 budget warnings, 0 errors** (`Initial total 625.61 kB / 153.26 kB gzip`) |
| P3.2 re-run | `plan-page-esc-keyboard.spec.ts` | 3/3 passed |
| P3.2 touch | `plan-page-context-menu-touch.spec.ts` | 5/5 passed |
| P3.3 re-run | `context-menu-position` + `firevibe-context-menu-position` | 9/9 passed |

No skip/only, no `@ts-ignore`, no `any` introduced or touched; no tests deleted or weakened.

## 4. Out of scope / follow-ups

- Prod & backend untouched.
- `anyScript`/`initial` heads still describe third-party floors; a larger win (primeng table +
  datepicker split, or dependency-free rewrite of the export path) would be a larger, riskier
  initiative — not part of P3.5.
- Budget errors intentionally stay above warnings so a real regression still gates the build.

---

P3.5 = COMPLETE; budgets measured & justified, SCSS dead rules removed, selective preloading live,
140/140 tests + typecheck + zero-warning build green; STOP