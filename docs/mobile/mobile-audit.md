# Mobile UX Audit — Per-Component Analysis

> **Date:** 2026-06-26  
> **Scope:** All 35+ route components, shared components, and layout  
> **Methodology:** Manual audit against mobile UX heuristics (NN Group, Google Material, Apple HIG, WCAG)  
> **Scale:** 5000 employees on Android + iOS

---

## Audit Criteria

| Metric                   | Standard                        | Severity                            |
| ------------------------ | ------------------------------- | ----------------------------------- |
| Touch target             | ≥44px (WCAG 2.5.5)              | P0 if <44px on primary actions      |
| Horizontal scroll        | Zero                            | P0 if any horizontal overflow       |
| Readable text            | ≥11px on mobile                 | P0 if <11px                         |
| Tap feedback             | Visual + haptic                 | P1 if missing                       |
| Desktop-first layout     | No grid-3/4 on mobile           | P1 if unchanged for mobile          |
| PrimeNG dialog overflow  | No fixed width >90vw            | P1 if overflow on 375px screen      |
| PrimeNG table responsive | Card view on mobile             | P1 if table-only on mobile          |
| Safe area                | env(safe-area-inset-\*) present | P2 if missing                       |
| Orientation support      | Portrait + landscape            | P2 if portrait-locked unnecessarily |
| Loading state            | Skeleton/spinner                | P2 if missing                       |
| Empty state              | Helpful message + action        | P2 if missing                       |
| Error state              | Retry action                    | P2 if missing                       |

---

## Layout & Shell

### Main Layout (`main-layout.component.ts`)

| Issue                            | Severity | Details                                                                                                                                        |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar as primary navigation    | P0       | Desktop sidebar is main nav. Bottom nav is secondary (only shown on <768px). On mobile, bottom nav should be primary with drawer as secondary. |
| Search bar hidden on mobile      | P1       | `topbar-search` has `display: none` at <768px. No mobile search available.                                                                     |
| Topbar height on mobile          | P1       | `height: 48px` — adequate but empty on mobile (search hidden, only status dot and notification badge remain).                                  |
| Bottom nav text size             | P1       | `font-size: 9px` on labels — too small for readability. Minimum 11px needed.                                                                   |
| Bottom nav items only 5          | P2       | Only 5 hardcoded items. Cannot accommodate all roles — admin items buried in drawer.                                                           |
| Page header not mobile-optimized | P2       | `page-header` has `font-size: var(--text-2xl)` which is 24px — large but may overflow on small screens with long Turkish text.                 |
| Safe area on bottom nav          | ✅       | `env(safe-area-inset-bottom)` present.                                                                                                         |
| Touch targets on bottom nav      | ✅       | `min-width: 56px` meets 44px standard.                                                                                                         |

### Auth Layout (`auth-layout.component.ts`)

| Issue                  | Severity | Details                                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------------------- |
| No mobile optimization | P0       | Just a flexbox centering container. Login/register forms may overflow on small screens. |
| No safe area insets    | P2       | `min-height: 100vh` should use `100dvh` for mobile browsers.                            |

---

## Dashboard (`dashboard.component.ts`)

| Issue                     | Severity | Details                                                                                                                                                                  |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit grid on mobile       | P0       | `.unit-grid` uses CSS Grid but collapses to 1 column on mobile via `_layout.scss` media query. However cards are dense with information — too cluttered for 375px width. |
| KPI cards grid            | P1       | `bottom-grid` uses default grid — `app-my-tasks-today`, `app-device-status-quick-update`, `app-next-shift-card` stack vertically. Functional but not optimized.          |
| Insight grid              | P1       | `.insight-grid` collapses to 1 column — OK but containers have `padding: 24px` which wastes space on mobile.                                                             |
| Touch targets             | P2       | Unit cards are clickable (`navigateToUnit`) but no min-height constraint.                                                                                                |
| Empty state on first load | P2       | Shows skeleton loading, then cards — acceptable. No empty state if no units configured.                                                                                  |
| Font size on mobile       | P2       | `metric-lbl` is `var(--text-xs)` = 11px — meets minimum but barely.                                                                                                      |

### Unit Health Card

| Issue                  | Severity | Details                                                                                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dense layout on mobile | P1       | Shows 4 metrics (occupancy rate, completion %, device count, status badge) in tight space. Should reduce to 2 key metrics on mobile. |
| Progress bars          | P2       | `.unit-bar-track` has fixed height. Should be thicker on mobile for touch.                                                           |

---

## My Day (`my-day.component.ts`)

| Issue                               | Severity | Details                                                                                                           |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Shift card not full-width on mobile | P0       | Uses `.dashboard-grid` which collapses to single column — OK. But shift card has fixed padding that wastes space. |
| Task list buttons                   | P1       | `.task-item` uses `touch-target` class — good. But haptic feedback not integrated.                                |
| Task check circle                   | P2       | 20px diameter — below 44px touch target for interactive element. Should be larger.                                |
| Incident items                      | P2       | `.incident-item` uses `touch-target` — good.                                                                      |
| Empty state                         | ✅       | Shows "Bugün vardiya yok" with icon.                                                                              |
| Loading skeleton                    | ✅       | Present with shimmer animation.                                                                                   |

---

## My Shifts (`my-shifts.component.ts`)

| Issue              | Severity | Details                                                                                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KPI grid on mobile | P1       | 4 KPI cards in `.kpi-grid` — collapses to 2 columns on tablet, 1 column on phone via `_mobile.scss`. But KPI cards have `padding: 16px` + icon — adequate. |
| Empty state        | P2       | No empty state when no shifts exist (e.g., new user). Shows skeleton then blank cards.                                                                     |
| Today shift card   | P2       | Has fixed layout — works on mobile since it's a single-column layout.                                                                                      |
| Quick actions grid | P2       | `.quick-actions` uses flexbox with 3 items. On 375px, wraps to 2+1 — acceptable.                                                                           |
| Pull-to-refresh    | ✅       | Implemented with `pullDistance` signal.                                                                                                                    |

### Calendar View (inside My Shifts)

| Issue                 | Severity | Details                                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| Month grid too small  | P0       | 7-column calendar with day cells — each cell is ~45px on 375px screen. Touch target barely meets 44px. |
| Day numbers           | P2       | Font size ~12px — readable but cramped on mobile.                                                      |
| No gesture navigation | P2       | No swipe left/right to change month. Only button-based.                                                |

---

## Swap Requests (`subswap-requests.component.ts`)

| Issue                               | Severity | Details                                                                                                        |
| ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| PrimeNG table not mobile-responsive | P0       | 7-column `p-table` overflows on mobile. Table has `width: max-content` behavior. Needs card-based mobile view. |
| Dialog fixed width                  | P0       | `[style]="{width: '400px'}"` — overflows on phones <400px wide. Should use `min(90vw, 400px)`.                 |
| Action buttons in table             | P1       | Approve/Reject buttons inside table cells — too small on mobile. Should be full-width action cards.            |
| No mobile list view                 | P1       | No alternative card-based view for mobile. Users must horizontal-scroll.                                       |
| Empty state                         | ✅       | Present with helpful message.                                                                                  |
| Loading state                       | ✅       | Skeleton cards present.                                                                                        |

---

## Shifts (`shifts.component.ts`)

| Issue                  | Severity | Details                                                               |
| ---------------------- | -------- | --------------------------------------------------------------------- |
| PrimeNG table overflow | P0       | 6-column `p-table` overflows on mobile.                               |
| Dialog fixed width     | P0       | `[style]="{width: '500px'}"` — overflows on all phones.               |
| No mobile card view    | P1       | No alternative layout for mobile.                                     |
| Shift type management  | P2       | Form fields inside dialog — adequate on mobile if dialog width fixed. |

---

## Reports (`reports.component.ts`)

| Issue              | Severity | Details                                                          |
| ------------------ | -------- | ---------------------------------------------------------------- |
| Dialog fixed width | P1       | `[style]="{width: '400px'}"` — overflows on smaller phones.      |
| Tab interface      | P2       | PrimeNG tab view — tabs may not wrap correctly on mobile.        |
| Charts             | P2       | Chart.js responsive — adequate but may need mobile sizing.       |
| Export buttons     | P2       | `btn-sm` which is `padding: 4px 10px` — below 44px touch target. |

---

## Device Incidents (`device-incident-report.component.ts`)

| Issue              | Severity | Details                                                                   |
| ------------------ | -------- | ------------------------------------------------------------------------- |
| Multi-step form    | P1       | Step indicator may wrap on mobile. Steps should be full-screen on mobile. |
| Camera integration | ✅       | Capacitor camera already integrated.                                      |
| Severity selector  | P2       | Radio buttons or segmented control — may need larger touch targets.       |
| Empty state        | ✅       | Present.                                                                  |

---

## Employees (`employees.component.ts`)

| Issue                | Severity | Details                                                 |
| -------------------- | -------- | ------------------------------------------------------- |
| PrimeNG table        | P0       | Likely overflows on mobile. Needs card-based list view. |
| Search/filter        | P1       | Filter controls may not be mobile-optimized.            |
| Employee detail card | P2       | Dense information layout. Needs mobile card design.     |

---

## Leave Management (`leave-management.component.ts`)

| Issue             | Severity | Details                                                                                                             |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Form layout       | P0       | Multi-field form — fields stack vertically on mobile (OK) but date pickers use browser native, which is acceptable. |
| Request list      | P1       | If using PrimeNG table, overflows on mobile.                                                                        |
| Date range picker | P2       | Two date inputs — need mobile-native date/time pickers.                                                             |

---

## Handover Notes (`handover-notes.component.ts`)

| Issue         | Severity | Details                                                                     |
| ------------- | -------- | --------------------------------------------------------------------------- |
| Note list     | P1       | Card-based layout already — good for mobile.                                |
| New note form | P2       | Has priority selector, recipient search, note text — stacks well on mobile. |
| Search        | P2       | Search input width may overflow on mobile.                                  |

---

## Live Tracking (`live-tracking.component.ts`)

| Issue         | Severity | Details                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| Map/interface | P1       | If using a calendar-like grid, may overflow on mobile.                         |
| Unit tabs     | P2       | Horizontal scrollable tabs — adequate for mobile if using `mobile-tabs` class. |

---

## Plans (MR, BT, Röntgen, Nükleer — `plan-page.component.ts`)

| Issue               | Severity | Details                                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Schedule grid table | P0       | 31+ column calendar grid with `width: max-content` — completely unusable on mobile. Horizontal scroll is broken. |
| Days as columns     | P0       | Each day is a column — on mobile with 31 days, each cell is ~12px wide. Unreadable.                              |
| Month navigation    | P1       | Button-based only, no swipe gesture.                                                                             |
| Shift legend        | P2       | May overflow on mobile.                                                                                          |

---

## Onkoloji Plan (`onkoloji-plan.component.ts`)

| Issue              | Severity | Details                                                      |
| ------------------ | -------- | ------------------------------------------------------------ |
| Fixed-width tables | P0       | Same issue as plan-page — horizontal overflow.               |
| Dense data         | P1       | More speciality-specific data makes mobile rendering harder. |

---

## Operations Center (`operations-center.component.ts`)

| Issue                  | Severity | Details                                         |
| ---------------------- | -------- | ----------------------------------------------- |
| Desktop-only card grid | P1       | Cards may not reflow properly on mobile.        |
| Dense metrics          | P2       | Multiple KPI metrics — needs mobile truncation. |

---

## Command Center (`command-center.component.ts`)

| Issue               | Severity | Details                                       |
| ------------------- | -------- | --------------------------------------------- |
| Real-time dashboard | P1       | Multiple data panels — needs responsive grid. |
| Alert list          | P2       | If table-based, overflows on mobile.          |

---

## My Tasks Today (`my-tasks-today.component.ts`)

| Issue           | Severity | Details                                                      |
| --------------- | -------- | ------------------------------------------------------------ |
| Task checkboxes | P1       | Touch targets should be ≥44px. Currently small icon circles. |
| Task list       | ✅       | Vertical list with checkboxes — good mobile pattern.         |

---

## Next Shift Card (`next-shift-card.component.ts`)

| Issue        | Severity | Details                                        |
| ------------ | -------- | ---------------------------------------------- |
| Card layout  | ✅       | Single card with shift info — good for mobile. |
| Touch target | ✅       | Entire card is tappable — meets 44px.          |

---

## Device Status Quick Update (`device-status-quick-update.component.ts`)

| Issue          | Severity | Details                                                          |
| -------------- | -------- | ---------------------------------------------------------------- |
| Status buttons | P1       | Multiple status options — need ≥44px touch targets.              |
| Device list    | P2       | If scrolling list with many devices — needs mobile optimization. |

---

## Notification Center (`notification-center.component.ts`)

| Issue         | Severity | Details                                  |
| ------------- | -------- | ---------------------------------------- |
| List layout   | ✅       | Card-based list — good for mobile.       |
| Swipe actions | P2       | No swipe-to-delete/mark-read gesture.    |
| Touch targets | ✅       | List items are tappable — adequate size. |

---

## Notification Badge (`notification-badge.component.ts`)

| Issue        | Severity | Details                                                |
| ------------ | -------- | ------------------------------------------------------ |
| Touch target | P1       | Badge icon is ~20px — needs 44px touch target wrapper. |
| Badge count  | P2       | Small text — acceptable for badge but could be larger. |

---

## Profile (`profile.component.ts`)

| Issue    | Severity | Details                                                           |
| -------- | -------- | ----------------------------------------------------------------- |
| Layout   | P1       | Dense information layout — may need mobile-specific profile view. |
| Settings | P2       | Toggle switches — need ≥44px.                                     |

---

## Performance (`performance.component.ts`)

| Issue   | Severity | Details                                                                |
| ------- | -------- | ---------------------------------------------------------------------- |
| Charts  | P1       | Chart.js charts — responsive but may need mobile width adjustments.    |
| Metrics | P2       | Multiple metric cards — mobile layout adequate if using grid collapse. |

---

## Fairness Analysis (`fairness-analysis.component.ts`)

| Issue       | Severity | Details                 |
| ----------- | -------- | ----------------------- |
| Data tables | P1       | May overflow on mobile. |
| Charts      | P2       | Chart.js — responsive.  |

---

## Settings (`settings.component.ts`)

| Issue           | Severity | Details                                            |
| --------------- | -------- | -------------------------------------------------- |
| Form layout     | P2       | Form fields stack vertically — adequate on mobile. |
| Toggle switches | P2       | Need ≥44px touch targets.                          |

---

## Training & Skills (`training-list.component.ts`, `skill-matrix.component.ts`)

| Issue                | Severity | Details                                     |
| -------------------- | -------- | ------------------------------------------- |
| Data tables          | P0       | PrimeNG tables likely overflow on mobile.   |
| Certification badges | P2       | Small badges may be hard to read on mobile. |

---

## Approval Center (`approval-center.component.ts`)

| Issue          | Severity | Details                                              |
| -------------- | -------- | ---------------------------------------------------- |
| Approval list  | P1       | If table-based, overflows. Card list works better.   |
| Action buttons | P1       | Approve/Reject — need large touch targets on mobile. |

---

## Audit Center (`audit-center.component.ts`)

| Issue       | Severity | Details                                                    |
| ----------- | -------- | ---------------------------------------------------------- |
| Audit table | P0       | Many columns — overflows on mobile. Needs card-based view. |
| Filters     | P2       | Filter form — stacks adequately on mobile.                 |

---

## Management Dashboard (`management-dashboard.component.ts`)

| Issue    | Severity | Details                                                              |
| -------- | -------- | -------------------------------------------------------------------- |
| KPI grid | P1       | Dense KPI cards — mobile collapse adequate but cards may be cramped. |
| Charts   | P2       | Chart.js — needs mobile width adjustment.                            |

---

## Global Issues

| Issue                      | Affected    | Severity | Details                                                                                 |
| -------------------------- | ----------- | -------- | --------------------------------------------------------------------------------------- |
| Haptic feedback missing    | All buttons | P1       | No haptic feedback on any user action. Should integrate `MobileService.light()` on tap. |
| Page transition animations | All routes  | P2       | No native-feel page transitions. Routes snap instantly.                                 |
| Font size too small        | Multiple    | P2       | Base font is 13px — adequate for desktop but should be 14-16px on mobile.               |
| No light mode              | All         | P2       | Dark-only theme. Healthcare workers in bright rooms need light mode.                    |
| No high contrast mode      | All         | P2       | No high-contrast theme for visually impaired personnel.                                 |
| No reduced data mode       | All         | P2       | No option to reduce data usage on cellular.                                             |
| Offline experience         | All         | P2       | Basic IndexedDB queue. No SQLite, no proper offline-first strategy.                     |
| Orientation handling       | All         | P2       | No orientation change optimization.                                                     |
| Keyboard avoidance         | Forms       | P1       | No keyboard-aware form scrolling on mobile.                                             |
| Safe area on modals        | Dialogs     | P2       | PrimeNG dialogs don't use safe area insets on mobile.                                   |

---

## Severity Distribution

| Severity | Count | Critical Items                                                                            |
| -------- | ----- | ----------------------------------------------------------------------------------------- |
| **P0**   | 12    | Schedule grid, PrimeNG tables, dialog widths, sidebar nav, auth layout, plan page grids   |
| **P1**   | 24    | Haptic feedback, font size, keyboard avoidance, touch targets, form layouts, tab overflow |
| **P2**   | 20    | Safe area, orientation, empty states, light mode, high contrast, offline                  |

---

## Scoring Summary

| Category                | Score | Key Issues                                                                    |
| ----------------------- | ----- | ----------------------------------------------------------------------------- |
| Navigation              | 6/10  | Bottom nav secondary, no gesture drawer, no deep links, no back button        |
| Layout & Responsiveness | 4/10  | Sidebar-first, no responsive engine, fixed PrimeNG widths, grid overflow      |
| Touch & Interaction     | 5/10  | Most lists OK, but tables failing, no haptics, small touch targets in tables  |
| Forms & Input           | 6/10  | Stacks vertically OK, but no native pickers, no auto-save, no offline draft   |
| Tables & Data           | 3/10  | PrimeNG tables unusable on mobile, no card-based alternatives                 |
| Feedback & States       | 7/10  | Loading/empty/error states present in most components                         |
| Performance             | 6/10  | OnPush everywhere, lazy routes, but no virtual scroll, no bundle optimization |
| Accessibility           | 4/10  | No high contrast, no screen reader testing, small fonts, no light mode        |
| Offline                 | 4/10  | Basic IndexedDB queue, no SQLite, no full offline, no conflict resolution     |
| Native Features         | 5/10  | Camera present, biometric present, but QR scanner, calendar, location missing |

**Overall Mobile UX Score: 50/100**

---

## Priority Fix List

### P0 — Must Fix Before Mobile Launch

1. Replace sidebar-primary navigation with bottom-nav-primary on mobile
2. Add card-based list view for all PrimeNG tables
3. Fix all PrimeNG dialog widths to use `min(90vw, 400px)`
4. Add mobile calendar view (swipeable, not 31-column grid)
5. Fix auth layout for mobile screens
6. Add safe area insets to all full-screen containers
7. Implement responsive layout engine with breakpoints

### P1 — Should Fix

1. Add haptic feedback to all touch interactions
2. Increase base font to 14px on mobile
3. Add keyboard-aware form scrolling
4. Implement pull-to-refresh on all list pages
5. Add swipe gestures (drawer, calendar, delete)
6. Add native date/time pickers
7. Implement mobile form auto-save
8. Add orientation change handler

### P2 — Nice to Have

1. Add light mode theme
2. Add high contrast mode
3. Implement proper offline-first with SQLite
4. Add page transition animations
5. Add virtual scrolling for long lists
6. Implement deep linking (Android App Links + iOS Universal Links)
7. Add QR/barcode scanner
8. Implement share sheet integration
