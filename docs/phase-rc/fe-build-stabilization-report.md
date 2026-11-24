# FE BUILD STABILIZATION — SCHEDULE GRID TEMPLATE/TS REMEDIATION

- **Repo (canonical):** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Non-canonical (NOT used):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mod:** FE only — `frontend/src/app/components/schedule-grid/`
- **Date:** 2026-09-25

---

## 1. Baseline

Initial FE production build (`npm run build`, `ng build`): **FAIL (exit 1)**.

Exact captured errors (ANSI-stripped, from `fe-build-stabilization-baseline.log`):

| # | File:line:col | Error |
|---|---|---|
| 1 | schedule-grid.component.html:3:104 | TS2339: Property 'totalRowCount' does not exist |
| 2 | schedule-grid.component.html:100:300 | TS2554: Expected 4-6 arguments, but got 2 |
| 3 | schedule-grid.component.html:100:479 | TS2339: Property 'st' does not exist |
| 4 | schedule-grid.component.html:100:492 | TS2339: Property 'et' does not exist |
| 5 | schedule-grid.component.html:101:291 | TS2554: Expected 4-6 arguments, but got 2 |
| 6 | schedule-grid.component.html:101:396 | TS2339: Property 'pt' does not exist |
| 7 | schedule-grid.component.html:101:489 | TS2339: Property 'st' does not exist |
| 8 | schedule-grid.component.html:101:502 | TS2339: Property 'et' does not exist |
| 9 | schedule-grid.component.html:135:346 | TS2554: Expected 4-6 arguments, but got 2 |
| 10 | schedule-grid.component.html:135:449 | TS2339: Property 'pt' does not exist |
| 11 | schedule-grid.component.html:135:542 | TS2339: Property 'st' does not exist |
| 12 | schedule-grid.component.html:135:555 | TS2339: Property 'et' does not exist |

---

## 2. Root-Cause Classification

### 2.1 `totalRowCount` missing (html:3)

- **Template expression:** `aria-rowcount="{{ totalRowCount() }}"`
- **TS symbol:** `ScheduleGridComponent.totalRowCount` — undefined.
- **Root cause:** The grid `aria-rowcount` references a computed row-count that was never implemented on the component. The template emits one `<tr>` per visible shift in the shifts-loop branch (lines 19-85), plus one fallback day row (`isShiftVisibleFallback`) and one night row (`device.mode === 'vardiya'`) in the no-shifts branch, plus the header row. No backing member existed.
- **Planned fix:** Add a typed `computed` signal `totalRowCount` that mirrors exactly what the template renders: `1` (header) + per visible device: visible shift rows, or fallback day row + night row.
- **Risk:** Low — pure read-only computation over existing signals/filters; no behavior change.

### 2.2 Out-of-scope `st` / `et` / `pt` (html:100:479/492, 101:396/489/502, 135:449/542/555)

- **Template expression:** inside `onAssignmentKeydown($event, {...object})` payload `{..., personnelType: pt, startTime: st, endTime: et}`.
- **TS symbol:** `pt`, `st`, `et` — declared as `@let` **inside the shifts-loop branch** (lines 23-27: `@let shiftType`, `@let pt = shift.personnelType`, `@let st = shift.startTime`, `@let et = shift.endTime`). They do **not** exist in the fallback (no-shifts) day/night branches that host lines 100-101 and 135, because those branches iterate `days()` without a `shift` object.
- **Root cause:** The fallback day/night cards were authored as if running inside the shifts-loop scope; `st`/`et`/`pt` were out of scope there.
- **Planned fix:** Remove the object-literal payload entirely (see 2.3) and pass only the values the typed handler actually consumes. `st`/`et`/`pt` are therefore not referenced in the fallback/night branches at all — no scope violation, no global/local hack, no `any`.
- **Risk:** Low — the typed handler does not use start/end/personnelType.

### 2.3 Wrong `onAssignmentKeydown` arity (html:100:300, 101:291, 135:346)

- **TEMPLATE expression:** `(keydown)="onAssignmentKeydown($event, {...single object})"` → 2 arguments.
- **TS symbol:** `onAssignmentKeydown(event: KeyboardEvent, device: DeviceInfo, day: DayColumn, shiftType: string, personnelId?: string, personnelName?: string)` (component L165) → expects 4-6 positional args.
- **Root cause:** Template passed a single object literal (a `SlotEvent`-shaped payload) against a positional positional typed signature.
- **Planned fix:** Re-align template calls to the real canonical signature:
  - day card: `onAssignmentKeydown($event, device, day, 'gunduz', assignment.personnelId, assignment.personnelName)`
  - night card: `onAssignmentKeydown($event, device, day, 'gece', assignment.personnelId, assignment.personnelName)`
  - Both `device`, `day`, `assignment` are in scope in their branches. Signature NOT loosened (`any`/optional not added).
- **Risk:** Low-to-medium — verified `device`/`day` in scope; keyboard/context-menu routing flows unchanged (handler already read from `device`/`day`/`shiftType` and emits edit/delete/copy/contextMenu).

### 2.4 Duplicate template attributes (html:100-101)

- **Template expression:** The day-card `<div>` opening tag was split across two source lines and carried **duplicate** `role="gridcell"`, `tabindex="0"`, `[attr.aria-label]`, `aria-keyshortcuts` and **two** `(keydown)` bindings (one per line fragment).
- **TS symbol:** n/a (pure markup).
- **Root cause:** The day-card opening tag had attributes duplicated on a continuation line (likely from an earlier partial edit), producing invalid/ambiguous markup and two binding conflicts.
- **Planned fix:** Collapse into ONE canonical opening tag keeping a single `role="gridcell"`, single `tabindex="0"`, single richer `aria-label` (with shift announcement), single `aria-keyshortcuts`, single `(keydown)`, plus dragstart/dragend. All accessibility contracts preserved.
- **Risk:** Low — the richer of the two `aria-label`s was kept; the two `(keydown)` bindings had identical routing intent, now exactly one.

---

## 3. Implementation

### Error 1 — `totalRowCount`
**File:** `schedule-grid.component.ts` (added L109-120)
**Fix:** typed `computed` mirroring rendered rows:
```ts
readonly totalRowCount = computed(() => {
  let rows = 1;
  for (const device of this.visibleDevices()) {
    if (device.shifts && device.shifts.length > 0) {
      rows += device.shifts.filter(shift => this.isShiftVisible(shift)).length;
    } else {
      if (this.isShiftVisibleFallback(device)) rows += 1;
      if (device.mode === 'vardiya') rows += 1;
    }
  }
  return rows;
});
```
**Behavior preserved:** `aria-rowcount` now reports the real, filter-aware row count; visibility filters feed it exactly as they feed the rendered `<tr>`s.

### Errors 2-8 — day card (html:100-101)
**File:** `schedule-grid.component.html`
**Fix:** Merge duplicate-attribute opening tag into one line; replace object-literal keydown with positional call:
```html
<div class="person-card day-card" [class.dimmed]="isCellDimmed(device, day, 'gunduz')" draggable="true"
     role="gridcell" tabindex="0"
     [attr.aria-label]="'Personel: ' + assignment.personnelName + ', gündüz vardiyası. Enter: Düzenle, Delete: Sil, c: Kopyala, Shift+F10: Bağlam menüsü'"
     aria-keyshortcuts="Enter Düzenle Delete Sil c Kopyala Shift+F10 Bağlam"
     (keydown)="onAssignmentKeydown($event, device, day, 'gunduz', assignment.personnelId, assignment.personnelName)"
     (dragstart)="..." (dragend)="...">
```
**Behavior preserved:** role/tabindex/aria-label/aria-keyshortcuts keyboard contract retained; single keydown routes Enter/Space, Delete/Backspace, c/C, F10/ContextMenu exactly as before.

### Errors 9-12 — night card (html:135)
**File:** `schedule-grid.component.html`
**Fix:** Replace object-literal keydown with positional call matching the real signature:
```html
(keydown)="onAssignmentKeydown($event, device, day, 'gece', assignment.personnelId, assignment.personnelName)"
```
**Behavior preserved:** night-card keyboard/context-menu flow unchanged.

---

## 4. Verification

| Gate | Command | Result |
|---|---|---|
| FE TYPECHECK | `npx tsc --noEmit` | **PASS** (exit 0) |
| FE BUILD (production) | `npm run build` (`ng build`) | **PASS** (exit 0) — 0 template/TS errors |
| P3.2 ESC REGRESSION | `npx vitest run src/app/features/plans/__tests__/plan-page-esc-keyboard.spec.ts` | **PASS** — 1 file / 3 tests |
| BE TEST (full regression) | `npm test` | **PASS** — 99 files / **1090 tests** |
| NEST BUILD | `npm run build` | **PASS** (exit 0) |
| RAW BE TSC (`--noEmit` incl. specs) | `npx tsc --noEmit` | Pre-existing P3.1 spec `5e01-p3-01-pwa-hardening.fe-invariants.spec.ts` uses `statSync` without import (TS2304). **UNCHANGED** — separate known debt, outside this FE stabilization (see §10). |
| SCOPE DIFF | review | Only the 2 schedule-grid files changed (below). |

**Build warnings (pre-existing budgets, do not fail build):**
- `bundle initial exceeded maximum budget` — Budget 400.00 kB not met by 225.53 kB (625.53 kB total).
- Component SCSS budgets exceeded (`plan-page`, `firevibe-schedule`, `employees`, `onkoloji`) and two lazy chunks exceeded 200 kB budgets.
- These existed before; no budget/compiler change made.

---

## 5. Scope — Changed Files

| File | Change type |
|---|---|
| `frontend/src/app/components/schedule-grid/schedule-grid.component.ts` | Added `totalRowCount` computed (L109-120). No signature loosening. |
| `frontend/src/app/components/schedule-grid/schedule-grid.component.html` | Day card (L100-101) duplicate-attribute merge + positional keydown; night card (L134-135) positional keydown. |

**Not changed:** anything outside `schedule-grid/`. No `plan-page.*`, no backend, no coverage code, no PWA config, no accessibility behavior changes, no compiler/strictness/budget/test changes.

---

## 6. Posterity Statements

```text
P3.2 ESC behavior preserved         : yes (regression 3/3 PASS; ESC handler untouched)
Coverage restore untouched          : yes
P3.3 not started                    : yes
No compiler/test weakening          : yes
No migration                        : yes
No dummy state/property             : yes (totalRowCount is a real source-of-truth computed)
No `any` / `@ts-ignore` / `@ts-expect-error` : yes
No duplicate attribute deleted randomly : yes (canonical single attribute retained)
```

---

## 7. Final Status

```text
FE TEMPLATE ERRORS   = 0
FE TYPECHECK         = PASS
FE PRODUCTION BUILD  = PASS
P3.2 ESC REGRESSION  = PASS
BACKEND REGRESSION   = PASS (1090/1090)
NEST BUILD           = PASS
SCOPE                = CLEAN

FE BUILD STABILIZATION = COMPLETE
P3.2                    = UNBLOCKED
P3.3                    = NOT STARTED
STOP
```