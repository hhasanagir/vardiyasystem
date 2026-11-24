# P3.3 — Mobile & Touch Scheduling Hardening (Implementation Report)

- **Canonical repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Non-canonical (NOT used):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mod:** IMPLEMENTATION — FE only (context-menu positioning, FireVibe/plan-page/schedule-grid responsive & coarse-pointer CSS, responsive sticky context column, responsive dialogs); backend untouched
- **Date:** 2026-09-25

---

## 1. Executive Summary

P3.3 is **IMPLEMENTED** on the plan page, FireVibe schedule, and plan-page schedule grid.

- **Context menu positioning:** both context menus (plan-page and FireVibe grid) now clamp inside the viewport via a single shared, pure helper `clampContextMenuPosition` instead of raw `clientX/clientY`. On mobile long-press near the screen edge the menu can no longer render off-viewport.
- **FireVibe mobile:** the sticky left context column (previously a fixed `360px`) is now driven by a `--fv-left-w` CSS custom property that drops to `250px` under `768px` viewports; `scrollToDay` reads it (no more hardcoded `360`). Header rows, month nav, view controls, toolbar, unit chips, and status bar wrap on mobile; the summary KPI bar scrolls horizontally instead of clipping; empty cells become full-cell touch targets on coarse pointers.
- **Plan-page schedule grid (touch):** card edit/delete/copy actions were hover-only `16×16` buttons (invisible/unusable on touch). Under `@media (pointer: coarse)` they are now a visible full-width row below the person name with `30×30` buttons. The sticky shift-label column narrows on mobile for more scrollable day-columns area.
- **Plan-page navigation/dialogs:** header/month-nav/tabs wrap on mobile; all custom dialogs (month picker, monthly assign, conflicts) are capped with `min(width, calc(100vw - 32px))` so they cannot overflow a phone; the grid status bar wraps.

Gates: FE typecheck **PASS**, P3.3 focused tests **PASS (14/14)**, P3.2 ESC regression **PASS (3/3)**, FE production build **PASS (exit 0)**. Backend was **not touched** (no regression run needed; per instruction backend gates apply only if backend opened).

**Final status:** `P3.3 = COMPLETE; P3.4 = NOT STARTED; STOP`.

---

## 2. P3.3 Change Scope (exact footprint)

| File | Change |
|---|---|
| `frontend/src/app/core/utils/context-menu-position.ts` | **NEW** — pure helper `clampContextMenuPosition(clientX, clientY, { menuWidth, menuHeight, viewportWidth?, viewportHeight? })` + `CONTEXT_MENU_MARGIN = 8`. Clamps within the viewport (with `window` fallbacks for SSR/no-window), keeps a `8px` margin, and never breaks when the menu is larger than the viewport. |
| `frontend/src/app/features/plans/plan-page.component.ts` | `onContextMenu()` now computes `clampContextMenuPosition(e.event.clientX, e.event.clientY, { menuWidth: 224, menuHeight: 200 })` and sets clamped `x`/`y` on the context-menu signal (menu `min-width: 190px` + up-to-3 items). |
| `frontend/src/app/features/firevibe-schedule/firevibe-schedule.component.ts` | `onCellContextMenu()` now delegates to a new public `contextMenuPosition(clientX, clientY)` method (menu `240×340`) which uses the shared helper; added `leftContextWidth()` reading `--fv-left-w` from the scroll container (fallback `360`); `scrollToDay()` no longer hardcodes `360`. |
| `frontend/src/app/features/firevibe-schedule/firevibe-schedule.component.scss` | `:host` now defines `--fv-left-w: 360px` and `$left-w` uses `var(--fv-left-w, 360px)` (sticky corner + label cells become responsive). Added `@media (max-width: 767px)`: left column → `250px`, corner grid `78px 64px 1fr 0px` (status corner hidden), header rows/unit chips/header-actions/month-nav/view-controls/toolbar/statusbar `flex-wrap`, summary `overflow-x: auto`, legend/statusbar padding normalization. Added `@media (pointer: coarse)`: `.fv-cell-add` fills the empty cell (`calc(100% - 2px)`), avatar drag tray gains `-webkit-touch-callout: none; user-select: none`. |
| `frontend/src/app/components/schedule-grid/schedule-grid.component.scss` | Added `@media (max-width: 767px)`: shell margins shrink, sticky `left-header`/`shift-label` `180px → 150px`, `date-col`/`person-cell` `110px → 96px`. Added `@media (pointer: coarse)`: `.person-card` wraps and `.card-actions` become a visible static full-width row (`display: flex; position: static`) with `30×30` buttons (16→30px), `user-select: none` on cards. **Desktop mouse/keyboard behavior is untouched** (media-scoped only). |
| `frontend/src/app/features/plans/plan-page.component.scss` | Dialogs: `.month-picker-panel`/`.monthly-assign-panel`/`.conflicts-panel` widths → `min(Npx, calc(100vw - 32px))`. `.grid-status-bar` wraps. Added `@media (max-width: 767px)` block: `.plan-header`/`.header-left`/`.month-nav`/`.header-right`/`.plan-tabs` wrap; action/tab padding, view-toggle, KPI strip, filter/search, status-bar, validation-bar, list-view, error-glass resized/hydrated for narrow screens. |
| `frontend/src/app/core/utils/__tests__/context-menu-position.spec.ts` | **NEW** — 5 deterministic unit tests (unchanged interior, 375×667 bottom/right clamp, top-left margin, menu-larger-than-viewport, no-window fallback). |
| `frontend/src/app/features/plans/__tests__/plan-page-context-menu-touch.spec.ts` | **NEW** — 5 tests (JIT harness as in P3.2): near-edge clamp, top-left margin clamp, interior unchanged, `closeContextMenu()` dismiss, ESC dismiss of a clamped menu. |
| `frontend/src/app/features/firevibe-schedule/__tests__/firevibe-context-menu-position.spec.ts` | **NEW** — 4 tests (JIT harness): viewport containment, top-left margin clamp, `onCellContextMenu` stores clamped coords on the signal, ESC dismisses the grid context menu. |

### Notes on the approach

- The clamp helper is the **single source of truth** for both surfaces (no duplicated logic), pure, deterministic, and unit-tested with explicit viewport args so jsdom geometry cannot skew it.
- No `any`, no `@ts-ignore`, no `@ts-expect-error`, no strictness lowering, no test skip/deletion, no `@skip`/timeout flake suppression.
- Desktop behaviors are preserved: all CSS changes are scoped to `@media (max-width: 767px)` and/or `@media (pointer: coarse)`; the keyboard/a11y contract from P3.2 (`role="gridcell"`, `aria-label`, `aria-keyshortcuts`, `tabindex`, ESC close) is untouched.
- Touch targets added/kept ≥24px: schedule-grid action buttons `30×30` (was 16), FireVibe empty-cell add fills the cell, pre-existing `fv-icon-btn` 30px / `add-person-btn` 28px unchanged.
- No custom long-press gesture code was added. Context menus continue to rely on the platform `contextmenu` event (Android Chrome fires it on long-press; iOS 13+ generally does), now safely clamped. FireVibe pan uses the existing pointer-event `dragWasActive` (>4px) guard — the accidental-secondary-action protection predates P3.3 and is verified unchanged.
- No second scheduling UI, no new state management/UI framework; PrimeNG untouched.

---

## 3. Gate Results

| Gate | Command | Result |
|---|---|---|
| FE TYPECHECK | `npm run typecheck` (`npx tsc --noEmit`) | **PASS** (exit 0) |
| P3.3 focused tests | `npx vitest run` (3 new spec files) | **PASS** — 14 tests: helper 5, plan-page 5, firevibe 4 |
| P3.2 ESC regression | `npx vitest run .../plan-page-esc-keyboard.spec.ts` | **PASS** — 3/3 (unchanged) |
| FE BUILD | `npm run build` (`ng build`) | **PASS** (exit 0) — pre-existing budget warnings only (initial bundle 625.5kB vs 400kB; firevibe/plan-page/employees/onkoloji SCSS 12kB budgets; plan-page + 2 chunk 200kB budgets) — same warnings as baseline, not introduced by P3.3 |
| BE FULL REGRESSION (1090/1090) | `npm test` (backend) | **NOT RUN — NOT REQUIRED** — backend files were not opened or modified by P3.3 |
| BE BUILD (nest) | `npm run build` (backend) | **NOT RUN — NOT REQUIRED** — backend untouched |

> Full-suite FE run (all `src/**/__tests__`) additionally reports 45 pre-existing failures across **8 spec files disjoint from this change set** (verified: none import `plan-page`, `firevibe`, `schedule-grid`, or `context-menu-position`): `device-incident-report.component.spec`, `pwa-install-prompt.component.spec`, `reports.component.spec`, `authorization.service.spec`, `device-api.integration.spec`, `device-incidents.service.spec`, `pwa.service.spec`, `schedule-api.integration.spec`. These are RBAC/fetch/environment-dependent (the two integration suites require a live backend) and are outside P3.3 scope; none were touched. The 4 P3.2/P3.3 spec files run in scope pass 17/17.

---

## 4. Final Status

```text
P3.3 CONTEXT MENU   = IMPLEMENTED (shared clamp helper, both surfaces)
P3.3 FIREVIBE MOBILE= IMPLEMENTED (--fv-left-w responsive sticky col, header/summary/statusbar wrap, coarse-pointer cell targets)
P3.3 GRID TOUCH     = IMPLEMENTED (visible 30px card-actions on coarse pointer; mobile sticky column)
P3.3 NAV/DIALOGS    = IMPLEMENTED (header/tabs wrap; dialogs capped to viewport)
P3.3 TESTS          = PASS (14/14) + P3.2 ESC 3/3
FE TYPECHECK        = PASS
FE BUILD            = PASS (exit 0; pre-existing budget warnings only)
BACKEND             = NOT TOUCHED (regression/nest gates not triggered)
P3.4                = NOT STARTED
STATUS              = P3.3 COMPLETE
STOP
```

### Explicit instructions honored

- Implemented fixes directly in the canonical repo (no audit-only work); backend untouched (no regression/nest gate needed).
- No `@ts-ignore`, `@ts-expect-error`, `any`, compiler-strictness change, test skip/delete, timeout-flake suppression, desktop-behavior removal, duplicate responsive implementation, new state/UI framework, or second scheduling UI.
- P3.2 keyboard/a11y contract preserved (all three ESC tests stay green; gridcell/aria/tabindex untouched).
- Context menus stay inside the viewport and dismiss normally (backdrop click, `closeContextMenu`, ESC).