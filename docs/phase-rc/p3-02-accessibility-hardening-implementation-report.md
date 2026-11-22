# P3.2 — Accessibility Hardening — ESC Close Context Menu (Implementation Report)

- **Canonical repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Non-canonical (NOT used):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mod:** IMPLEMENTATION — FE only (`plan-page.component.ts` + new regression spec); backend untouched
- **Date:** 2026-09-25

---

## 1. Executive Summary

P3.2 ESC accessibility gap is **IMPLEMENTED** on the plan page. Pressing `Escape` while the plan-page context menu is open now closes it via the **existing** `closeContextMenu()` → `contextMenu.set(null)` mechanism. Pressing `Escape` while the menu is closed is a guard-based **no-op** (no schedule/assignment state mutation).

The focused P3.2 ESC regression suite **PASSES (3/3)**. FE typecheck **PASSES**. Backend full regression **PASSES (1090/1090, 99 files)** and backend build **PASSES**.

The FE production build **REMAINS BLOCKED** by **pre-existing** template/TypeScript mismatches entirely located in `frontend/src/app/components/schedule-grid/schedule-grid.component.html` — a file the P3.2 work never touched (last modified 2026-09-23, two days before P3.2 changes on 2026-09-25). Per instruction, these errors are **NOT repaired** as part of P3.2. They are reported as the exact blocker below. **P3.2 causality = NOT FOUND.**

**Final status:** `P3.2 = PARTIAL` (ESC works, but FE build blocker remains, pre-existing) — details in §6.

---

## 2. P3.2 Change Scope (exact footprint)

| File | Change |
|---|---|
| `frontend/src/app/features/plans/plan-page.component.ts` | Added `HostListener` to existing `@angular/core` import; added `@HostListener('document:keydown.escape') onEscapeKeydown()` that reads `this.contextMenu()` and closes via existing `closeContextMenu()` when a menu is open (lines 1199-1203). |
| `frontend/src/app/features/plans/__tests__/plan-page-esc-keyboard.spec.ts` | NEW — 3-test regression spec (excluded from the Angular build by `tsconfig.app.json` `exclude: ["src/**/*.spec.ts"]`). |

Implementation, verbatim (canonical, `plan-page.component.ts:1199-1203`):

```ts
@HostListener('document:keydown.escape')
onEscapeKeydown(): void {
  const c = this.contextMenu();
  if (c) this.closeContextMenu();
}
```

- Uses the **existing** `closeContextMenu()` / `contextMenu` signal architecture (plan-page.component.ts:1205-1207, signal at 601) — no new context-menu system.
- Guard `if (c)` ensures ESC with menu closed mutates nothing.
- Matches the established repo-wide convention `@HostListener('document:keydown.escape')` (modal L68, search-palette L170).

---

## 3. ESC Regression — Verified

Command (canonical frontend):

```
npx vitest run src/app/features/plans/__tests__/plan-page-esc-keyboard.spec.ts
Test Files  1 passed (1)
Tests       3 passed (3)
```

Required behaviors (each has a dedicated test):

```
context-menu OPEN --Escape--> existing close/dismiss --> context-menu CLOSED
context-menu CLOSED --Escape--> no schedule/assignment mutation
```

---

## 4. STEP 1 — FE Build Error Causality Classification

The canonical repo has **no `.git`**, so no byte-diff against a pre-P3.2 baseline is possible. Classification below is based on: (a) file modification timestamps and (b) the P3.2 change footprint being disjoint from every error location. Causality is the definitive result; "pre-existing" is timestamp-supported but, having no VCS baseline, is stated with that caveat rather than as proven-by-diff.

All 12 reported errors occur in **`schedule-grid.component.html`** (last write 2026-09-23 10:20:31; P3.2 work on `plan-page.component.ts` = 09-25 12:21:03).

| # | Error | Location (html:line:col) | P3.2 TOUCHED | P3.2 CAUSAL | STATUS |
|---|---|---|---|---|---|
| 1 | `TS2339 totalRowCount` | 3:104 | NO | NO | PRE-EXISTING |
| 2 | `TS2554 Expected 4-6 arguments, got 2` (keydown) | 100:300 | NO | NO | PRE-EXISTING |
| 3 | `TS2339 Property 'st'` | 100:479 | NO | NO | PRE-EXISTING |
| 4 | `TS2339 Property 'et'` | 100:492 | NO | NO | PRE-EXISTING |
| 5 | `TS2554 Expected 4-6 arguments, got 2` (keydown) | 101:291 | NO | NO | PRE-EXISTING |
| 6 | `TS2339 Property 'pt'` | 101:396 | NO | NO | PRE-EXISTING |
| 7 | `TS2339 Property 'st'` | 101:489 | NO | NO | PRE-EXISTING |
| 8 | `TS2339 Property 'et'` | 101:502 | NO | NO | PRE-EXISTING |
| 9 | `TS2554 Expected 4-6 arguments, got 2` (keydown) | 135:346 | NO | NO | PRE-EXISTING |
| 10 | `TS2339 Property 'pt'` | 135:449 | NO | NO | PRE-EXISTING |
| 11 | `TS2339 Property 'st'` | 135:542 | NO | NO | PRE-EXISTING |
| 12 | `TS2339 Property 'et'` | 135:555 | NO | NO | PRE-EXISTING |

### Evidence for P3.2 CAUSAL = NO (each error)

- **P3.2 changed exactly two files** (§2). `schedule-grid.component.html` is not among them, and `plan-page.component.ts` is not a dependency of `ScheduleGridComponent` (it is the consumer), so the new ESC listener on the plan page class cannot participate in the grid template's type-checking.
- **Timestamp proof:** `schedule-grid.component.html` last write = 2026-09-23 10:20:31, two days before P3.2 edits. The corrupted fallback-branch template (duplicate `role=`/`tabindex=`/`aria-label=`/`aria-keyshortcuts=`/`(keydown)` attributes at lines 100-101, plus references to `st`/`et`/`pt` with no `@let` in that branch scope, plus `totalRowCount()` with no such member on `ScheduleGridComponent`) all exist in a region P3.2 never opened.
- **Structural mismatch highlights (all pre-existing):**
  - `aria-rowcount="{{ totalRowCount() }}"` → method does not exist on `ScheduleGridComponent`.
  - Fallback branch (devices with no shifts, lines 86-121) calls `onAssignmentKeydown($event, {...2 args})` but the component signature is positional `(event, device, day, shiftType, personnelId?, personnelName?)` (4-6 args) — template/components API out of sync.
  - `st`/`et`/`pt` are referenced with no `@let` declaration in that branch (the `@let` declarations at lines 24-27 exist only in the shifts-loop branch).

**Conclusion:** All 12 errors are disjoint from the P3.2 footprint → **P3.2 INTRODUCED = NO**. Status `PRE-EXISTING` (timestamp-evidenced; no VCS baseline exists to byte-prove, so "cannot be proven via diff" is stated explicitly).

---

## 5. Gates

| Gate | Command | Result |
|---|---|---|
| P3.2 ESC regression | `npx vitest run .../plan-page-esc-keyboard.spec.ts` | **PASS** — 1 file, 3 tests |
| FE TYPECHECK | `npm run typecheck` (`npx tsc --noEmit`) | **PASS** (exit 0) |
| FE BUILD | `npm run build` (`ng build`) | **BLOCKED** — 12 pre-existing `schedule-grid.component.html` errors (see §4) |
| BE FULL REGRESSION | `npm test` | **PASS** — 99 files / 1090 tests (exit 0) |
| BE BUILD (TSC, app scope) | `npm run build` (`nest build`, specs excluded via `tsconfig.build.json`) | **PASS** (exit 0) |
| BE TSC (raw, includes `*.spec.ts`) | `npx tsc --noEmit` (base `tsconfig.json`) | **BLOCKED** on pre-existing P3.1 spec `5e01-p3-01-pwa-hardening.fe-invariants.spec.ts` (last write 2026-09-22) — uses `statSync` without an `import` (TS2304). Not P3.2-related; backend not opened by P3.2. |

> Notes:
> - FE TYPECHECK passes because `tsc` does not type-check Angular HTML templates; only `ng build` does, which is where the pre-existing blocker is visible.
> - The raw BE `tsc --noEmit` including spec files now surfaces a pre-existing P3.1 spec defect; the app-scope backend build (`nest build`, which excludes `**/*spec.ts`) is green.

---

## 6. Final Status

```text
P3.2 ESC          = IMPLEMENTED
ESC REGRESSION    = PASS (3/3)
FE TYPECHECK      = PASS
FE BUILD          = BLOCKED
BLOCKER           = PRE-EXISTING schedule-grid.component.html template/TS mismatches (12 errors, §4)
P3.2 CAUSALITY    = NOT FOUND
BACKEND           = 1090/1090 PASS · BE build PASS · BE raw tsc FAILS on pre-existing P3.1 spec (not P3.2)
P3.3              = NOT STARTED
STATUS            = P3.2 PARTIAL
STOP
```

### Explicit instructions honored

- P3.2 ESC is limited to the existing context-menu close/dismiss architecture — NO new context-menu system.
- The pre-existing schedule-grid template debt was **NOT** repaired opportunistically (`totalRowCount`, `st`/`et`/`pt`, unrelated `onAssignmentKeydown` call sites, duplicate attributes are all left untouched).
- No template cleanup, no refactor of schedule-grid, no coverage-code changes, no backend changes, no weakened/skipped tests, no suppressed Angular template errors, no compiler-strictness change, no build-budget increase, no artificial green gate.
- The FE build failure remains visible exactly as-is: a real blocker.