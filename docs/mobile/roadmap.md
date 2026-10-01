# VardiyaOS Mobile Transformation — Implementation Roadmap

> **Status:** Planning  
> **Target:** Native-quality Android + iOS healthcare app for 5000 employees  
> **Stack:** Angular 21 + Capacitor 8 + PrimeNG + NestJS + PostgreSQL  
> **Principle:** Zero regression on existing web app — all changes additive via responsive engine + feature flags

---

## Architecture Principles

1. **Single Codebase, Two Experiences** — Same Angular app, same backend. A responsive layout engine switches between web-optimized and mobile-optimized UI at the component level.
2. **Feature Flags** — Every mobile-specific feature toggles via `MobileFeatureFlag` service + environment config. Web-only code is never removed, only wrapped.
3. **Capacitor as Augmentation Layer** — Native APIs are called only on device via `@capacitor/*` plugins. Web fallbacks exist for every feature.
4. **Mobile-First CSS** — New components are mobile-first with `min-width` breakpoints scaling up to desktop. Existing components get mobile overrides.
5. **Offline-First Data** — All critical data (schedules, personnel, shifts) caches locally. Writes queue to IndexedDB/SQLite when offline, sync when online.
6. **Role-Adaptive UX** — Dashboard, navigation, and home screen adapt to role (technician, supervisor, manager, admin).

---

## Phase Breakdown

---

## PHASE 1 — Mobile UX Audit

**Goal:** Document every screen, every component, every interaction against mobile UX heuristics.

### Actions

- [ ] Audit all 35+ route components against mobile criteria
- [ ] Identify desktop-first layouts, fixed widths, overflowing tables
- [ ] Document touch target violations (<44px)
- [ ] Find horizontal scrolling, unreadable tables on small screens
- [ ] Check landscape/tablet layouts
- [ ] Audit all PrimeNG dialogs for mobile overflow
- [ ] Check all PrimeNG tables for responsive wrapping
- [ ] Produce `docs/mobile/mobile-audit.md` with per-component findings

### Output

- `docs/mobile/mobile-audit.md` — per-component audit with severity ratings (P0-P3)
- `docs/mobile/mobile-audit.ts` — machine-readable audit JSON

---

## PHASE 2 — Native Navigation

**Goal:** Mobile navigation that feels native — bottom tabs, gesture drawer, back button, deep links.

### Actions

- [ ] Upgrade bottom nav to 5-tab persistent shell with animated transitions
- [ ] Implement swipe-to-open drawer (left edge gesture)
- [ ] Add `@capacitor/app` back button listener (Android hardware back)
- [ ] Wire deep linking: `varyados://schedule/{id}`, `https://app.vardiya/shift/{id}`
- [ ] Configure Android App Links + iOS Universal Links
- [ ] Add URL scheme handling in Capacitor config
- [ ] Add page transition direction hints (left-to-right for push, right-to-left for pop)
- [ ] Replace desktop sidebar with native drawer on mobile
- [ ] Implement FAB as primary action entry point per role

### Files to Create

- `src/app/core/services/navigation.service.ts` — unified nav state
- `src/app/core/services/deep-link.service.ts` — deep link router
- `src/app/shared/mobile-drawer/mobile-drawer.component.ts`
- `src/app/shared/mobile-tab-bar/mobile-tab-bar.component.ts`

### Files to Modify

- `capacitor.config.ts` — add URL scheme, deep link config
- `src/app/app.routes.ts` — add deep link resolvers
- `src/app/layouts/main-layout/main-layout.component.ts` — replace sidebar on mobile

---

## PHASE 3 — Responsive Layout Engine

**Goal:** Every page looks perfect on phone (320px) through ultra-wide (2560px).

### Actions

- [ ] Create `BreakpointService` with reactive `isPhone`, `isTablet`, `isDesktop`, `isLandscape` signals
- [ ] Build CSS grid utility classes: `.grid-phone-1`, `.grid-tablet-2`, `.grid-desktop-3`, `.grid-wide-4`
- [ ] Implement responsive container system: `.container-phone`, `.container-tablet`, `.container-desktop`
- [ ] Add responsive typography scale (smaller on phone, larger on desktop)
- [ ] Audit every `.page`, `.card`, `.grid-*` for mobile overflow
- [ ] Fix all `max-width` and `min-width` that cause overflow
- [ ] Add `overflow-x: hidden` to body, `overflow-x: auto` to tables only
- [ ] Add safe area insets to every full-screen container
- [ ] Create mobile list view transform for data tables (card-per-row instead of table)
- [ ] Add orientation change detection + graceful layout adjustment

### Files to Create

- `src/app/core/services/breakpoint.service.ts`
- `src/styles/_responsive.scss` — responsive grid + typography
- `src/app/shared/responsive-container/responsive-container.component.ts`
- `src/app/shared/data-list/data-list.component.ts` — mobile-friendly list view for table data

### Files to Modify

- `src/styles/_layout.scss` — convert `page` class to responsive
- `src/styles/_mobile.scss` — enhance breakpoints
- `src/app/layouts/main-layout/main-layout.component.ts` — responsive sidebar

---

## PHASE 4 — Native Components

**Goal:** Replace web-native PrimeNG components with mobile-native equivalents on device.

### Actions

- [ ] Build `MobileDatePickerComponent` — uses `@capacitor/dialog` date picker or native `<input type="date">`
- [ ] Build `MobileTimePickerComponent` — native time input
- [ ] Build `MobileSelectComponent` — action sheet style selector
- [ ] Build `MobileActionSheetComponent` — iOS/Android bottom action sheet
- [ ] Build `MobileBottomSheetComponent` — draggable bottom sheet (using `_mobile.scss` bottom-sheet classes)
- [ ] Build `MobileDialogComponent` — full-screen modal on phone, centered on desktop
- [ ] Implement Pull-to-Refresh on all list pages using touch events
- [ ] Implement Infinite Scroll on paginated lists
- [ ] Build native haptic feedback integration: `HapticsService` wrapper
- [ ] Add `MobileService.light()` / `.heavy()` / `.selection()` to key interactions

### Files to Create

- `src/app/shared/mobile-date-picker/mobile-date-picker.component.ts`
- `src/app/shared/mobile-time-picker/mobile-time-picker.component.ts`
- `src/app/shared/mobile-select/mobile-select.component.ts`
- `src/app/shared/mobile-action-sheet/mobile-action-sheet.component.ts`
- `src/app/shared/mobile-bottom-sheet/mobile-bottom-sheet.component.ts`
- `src/app/shared/mobile-dialog/mobile-dialog.component.ts`
- `src/app/core/services/haptics.service.ts`
- `src/app/core/directives/pull-to-refresh.directive.ts`
- `src/app/core/directives/infinite-scroll.directive.ts`

### Capacitor Plugins Required

- `@capacitor/dialog` — native dialogs
- `@capacitor/haptics` — haptic feedback (already installed)

---

## PHASE 5 — Offline First

**Goal:** Full offline support — schedules, personnel, attendance work without internet.

### Actions

- [ ] Replace IndexedDB queue with SQLite via `@capacitor-community/sqlite` or `@op-engineering/op-sqlite`
- [ ] Build `OfflineStorageService` — generic key-value + query storage on top of SQLite
- [ ] Cache all critical API responses: schedules, personnel, devices, units, shift definitions, notifications
- [ ] Implement offline write queue with conflict detection (version vectors)
- [ ] Build conflict resolution UI: show diff, let user pick version or auto-merge
- [ ] Implement background sync: `navigator.serviceWorker.sync.register()` or Capacitor background task
- [ ] Add offline badge indicator to navigation
- [ ] Implement stale-while-revalidate for cached data
- [ ] Build offline attendance: clock-in/out queues locally, syncs when online
- [ ] Add offline schedule viewing (read-only cached schedules)
- [ ] Implement offline notification display
- [ ] Add `OfflineScheduleViewComponent` — cached schedule browser
- [ ] Wire `offline.interceptor.ts` to serve cached responses

### Files to Create

- `src/app/core/services/offline-storage.service.ts` — SQLite-based storage
- `src/app/core/services/cache.service.ts` — response caching layer
- `src/app/core/services/conflict-resolver.service.ts` — version vector conflict resolution
- `src/app/shared/conflict-resolver/conflict-resolver.component.ts`
- `src/app/shared/offline-badge/offline-badge.component.ts`

### Files to Modify

- `src/app/services/offline-queue.service.ts` — upgrade to SQLite
- `src/app/services/offline-sync.service.ts` — add background sync + conflict handling
- `src/app/interceptors/offline.interceptor.ts` — serve cache when offline

### Capacitor Plugins Required

- `@capacitor-community/sqlite` — local SQLite database

### Backend Changes

- Add `if-match`/`if-none-match` header support for optimistic concurrency
- Add `X-Sync-Version` header support
- Add batch sync endpoint: `POST /sync/batch`

---

## PHASE 6 — Push Notifications

**Goal:** Deeply integrate existing backend notification system with mobile push.

### Actions

- [ ] Register for FCM push tokens via `@capacitor/push-notifications`
- [ ] Send FCM token to backend `POST /push-tokens/register`
- [ ] Handle foreground push: display in-app notification
- [ ] Handle background push: badge update, silent data sync
- [ ] Handle notification tap: deep link to relevant page
- [ ] Implement notification actions: "Accept Swap", "Approve Leave", "Acknowledge Alert"
- [ ] Configure critical alerts for emergency/urgent notifications (iOS critical alert entitlement)
- [ ] Implement local notification fallback for scheduled reminders
- [ ] Build shift reminder: notify 1 hour before shift start
- [ ] Build approval reminder: notify approvers of pending requests
- [ ] Build training expiry reminder: notify when certification expires
- [ ] Build emergency alert: critical push + local notification + in-app banner
- [ ] Integrate with existing `NotificationEventService` backend events
- [ ] Add notification categories/channels for user preference control
- [ ] Implement delivery tracking: mark as delivered, read, actioned

### Files to Create

- `src/app/core/services/push-notification.service.ts` — FCM registration + handling
- `src/app/core/services/local-notification.service.ts` — scheduled local notifications
- `src/app/core/services/notification-scheduler.service.ts` — background notification scheduling

### Files to Modify

- `src/app/services/pwa.service.ts` — add FCM push handling
- `src/app/services/notification-center.service.ts` — integrate push
- `src/app/app.config.ts` — register push handlers
- `capacitor.config.ts` — update PushNotifications config

### Backend — Already Done

- `fcm-sender.service.ts` — FCM push sender
- `push-tokens.controller.ts` — token registration
- `notification-orchestrator.service.ts` — multi-channel dispatch
- `notification-event.service.ts` — domain event → notification mapping

---

## PHASE 7 — Authentication

**Goal:** Biometric + PIN + seamless session restore — login once, use for weeks.

### Actions

- [ ] Implement PIN login as fallback when biometric unavailable
- [ ] Implement secure credential storage via Capacitor Preferences (encrypted)
- [ ] Implement auto-login on app cold start (check stored credentials → biometric verify → login)
- [ ] Implement refresh token rotation (existing backend support)
- [ ] Add session timeout warning with graceful extension
- [ ] Build biometric enrollment UI: prompt on first login, allow toggle in settings
- [ ] Implement secure logout: clear credentials, blacklist tokens
- [ ] Add "Switch User" option without full logout
- [ ] Build PIN creation flow (6-digit minimum, confirm)
- [ ] Implement device-specific session binding (optional, enhanced security)

### Files to Create

- `src/app/features/auth/pin-login.component.ts` — PIN entry screen
- `src/app/features/auth/pin-setup.component.ts` — PIN creation flow
- `src/app/features/auth/biometric-enrollment.component.ts` — biometric setup flow

### Files to Modify

- `src/app/services/biometric-auth.service.ts` — add PIN fallback
- `src/app/services/auth.service.ts` — add auto-login, session restore
- `src/app/components/login/login.component.ts` — add biometric prompt after login

### Capacitor Plugins Required

- `@capgo/capacitor-native-biometric` — already installed
- `@capacitor/preferences` — already installed

---

## PHASE 8 — Native Device Features

**Goal:** Full device API integration — camera, file picker, QR scanner, contacts, etc.

### Actions

- [ ] Camera: capture incident photos, profile photos, equipment documentation
- [ ] Gallery: pick images for incident reports
- [ ] File picker: upload documents (PDFs, reports)
- [ ] QR/Barcode scanner: scan equipment QR for quick device lookup
- [ ] Clipboard: copy schedule details, shift times
- [ ] Share sheet: export schedule as image/text to other apps
- [ ] Contacts: lookup personnel phone numbers
- [ ] Location: verify clock-in location (geofence around hospital)
- [ ] Calendar: add shift to device calendar (iOS Calendar, Google Calendar)
- [ ] Integrate with existing `CameraService`, `DeepLinkService`

### Files to Create

- `src/app/core/services/qr-scanner.service.ts`
- `src/app/core/services/file-picker.service.ts`
- `src/app/core/services/location.service.ts`
- `src/app/core/services/calendar.service.ts`

### Files to Modify

- `src/app/services/camera.service.ts` — enhance with gallery, file picker
- `src/app/components/device-incidents/` — add camera/QR for incident reporting

### Capacitor Plugins Required

- `@capacitor/camera` — already installed
- `@capacitor/filesystem` — file storage
- `@capacitor/share` — share sheet
- `@capacitor/clipboard` — clipboard access
- `@capacitor/geolocation` — location services
- `@capacitor/contacts` — device contacts
- `@capacitor/local-notifications` — already installed
- `cordova-plugin-qrscanner` or `capacitor-barcode-scanner` — QR scanning

---

## PHASE 9 — Healthcare UX Optimizations

**Goal:** UI optimized for hospital environment — gloved hands, night shifts, emergency access.

### Actions

- [ ] Increase all touch targets to minimum 48px (WCAG 2.5.5 exceeds 44px)
- [ ] Implement glove-friendly hit areas (larger padding, 16px minimum around interactive elements)
- [ ] Build high-contrast theme (WCAG AAA) — toggle in settings
- [ ] Optimize dark mode for night shifts — reduce blue light, warmer tones
- [ ] Build one-handed operation mode — bottom-anchored controls, reachable thumb zone
- [ ] Implement emergency quick-access button on lock screen and nav
- [ ] Build emergency SOS flow: one-tap alert to supervisor + manager
- [ ] Implement fast shift check-in: one tap clock-in with location verification
- [ ] Add "Night Mode" quick toggle to top bar
- [ ] Add font size scaling (accessibility setting)
- [ ] Build critical alert banner (persistent, high-visibility for emergencies)
- [ ] Add "Do Not Disturb" mode for off-duty personnel

### Files to Create

- `src/app/core/services/theme.service.ts` — high-contrast, night mode, accessibility themes
- `src/app/shared/emergency-button/emergency-button.component.ts`
- `src/app/shared/emergency-alert/emergency-alert.component.ts`
- `src/app/shared/glove-button/glove-button.directive.ts`
- `src/styles/_healthcare.scss` — healthcare-specific overrides

### Files to Modify

- `src/styles/_tokens.scss` — add high-contrast, night-mode tokens
- `src/app/app.config.ts` — register theme service
- `src/app/layouts/main-layout/` — add emergency quick-access

---

## PHASE 10 — Performance

**Goal:** Cold start <2s, 60fps scrolling, native-feel responsiveness.

### Actions

- [ ] Analyze bundle with `ng build --stats-json` + `esbuild-visualizer`
- [ ] Implement route-level lazy loading (already partially done)
- [ ] Implement image lazy loading via `loading="lazy"` attribute
- [ ] Implement virtual scrolling for large lists (schedule calendar, employee list)
- [ ] Optimize Angular change detection: use `OnPush` everywhere (already done)
- [ ] Preload critical route chunks (my-day, my-shifts, dashboard)
- [ ] Implement `@defer` for non-critical UI sections
- [ ] Optimize PrimeNG tree-shaking: import only used modules
- [ ] Implement critical CSS inlining
- [ ] Configure Angular Service Worker for aggressive caching: pre-cache shell, cache-first for API
- [ ] Implement image CDN with WebP conversion
- [ ] Optimize WebSocket connection: lazy connect, reconnect with backoff
- [ ] Implement memory-efficient list rendering for 5000+ employees
- [ ] Add Frame Timing API monitoring (FPS meter in dev mode)
- [ ] Implement component-level suspense/placeholder loading

### Files to Create

- `src/app/core/services/performance-monitor.service.ts`
- `src/app/shared/virtual-scroll/virtual-scroll.directive.ts`
- `src/styles/_performance.scss` — `content-visibility: auto`, `contain: strict` classes

### Files to Modify

- `src/app/app.config.ts` — add preloading strategy (already `PreloadAllModules`)
- `angular.json` — update budgets after optimization
- `ngsw-config.json` — update caching strategy

### Build Tooling

- `esbuild` (already default in Angular 21) — fine-tune config
- `light-house-ci` — add to CI pipeline

---

## PHASE 11 — Animations

**Goal:** Subtle, purposeful animations that feel native — never gratuitous.

### Actions

- [ ] Implement native page transitions: slide left/right for push/pop navigation
- [ ] Add hero animations: list item → detail page (shared element transition)
- [ ] Add ripple effect on all touchable elements (PrimeNG ripple already enabled)
- [ ] Implement swipe-to-delete on list items
- [ ] Implement swipe-to-complete on task items
- [ ] Add loading skeleton animations (already present — enhance)
- [ ] Add micro-interactions: button press scale (0.97), card lift on hover
- [ ] Add FAB animation: rotate on open, stagger child buttons
- [ ] Add pull-to-refresh animation (spinner + haptic feedback)
- [ ] Add bottom sheet spring animation
- [ ] Add notification slide-in animation
- [ ] Respect `prefers-reduced-motion` (already done in `_mobile.scss`)
- [ ] Implement staggered list entry animations
- [ ] Add orientation change animation

### Files to Create

- `src/app/shared/page-transition/page-transition.directive.ts`
- `src/app/shared/hero-animation/hero-animation.directive.ts`
- `src/app/shared/swipe-action/swipe-action.directive.ts`
- `src/styles/_animations.scss` (already exists — enhance with spring curves)

### Angular Animations

- Use Angular Animation Builder for route transitions
- Use `RouterOutlet` animation events
- Keep animation duration under 300ms for mobile

---

## PHASE 12 — Security

**Goal:** OWASP MASVS L2 compliance — enterprise-grade mobile security.

### Actions

- [ ] Implement certificate pinning via `@capacitor/network` or manual `HttpClient` interceptor
- [ ] Implement encrypted local storage (SQLite + encryption or `capacitor-secure-storage-plugin`)
- [ ] Implement root/jailbreak detection — show warning, optionally block access
- [ ] Implement tamper detection — checksum app resources on launch
- [ ] Implement secure logging — redact PII, tokens from logs
- [ ] Implement app attestation — Android Play Integrity + iOS DeviceCheck
- [ ] Implement session binding to device — token tied to device ID
- [ ] Implement clipboard blocking on sensitive fields
- [ ] Implement screenshot blocking for sensitive screens (HIPAA)
- [ ] Add security event logging to existing `AuditLogService`
- [ ] Implement auto-logout on jailbreak/root detection
- [ ] Implement screen recording detection

### Files to Create

- `src/app/core/services/certificate-pinning.service.ts`
- `src/app/core/services/secure-storage.service.ts`
- `src/app/core/services/device-integrity.service.ts` — root/jailbreak/tamper detection
- `src/app/core/services/secure-logger.service.ts`
- `src/app/core/guards/device-integrity.guard.ts`

### Files to Modify

- `src/app/interceptors/auth.interceptor.ts` — add certificate pinning
- `src/app/services/auth.service.ts` — add device binding
- `src/app/app.config.ts` — register security services

### Capacitor Plugins Required

- `@aparajita/capacitor-secure-storage` or `capacitor-secure-storage-plugin`
- `@capacitor/device` — already installed
- `@capacitor/app` — already installed

### Backend Changes

- Add device attestation endpoint: `POST /auth/attest`
- Add device fingerprint to JWT payload
- Add device revocation endpoint

---

## PHASE 13 — Accessibility

**Goal:** WCAG AA minimum, WCAG AAA preferred — inclusive design for all personnel.

### Actions

- [ ] Implement large font mode (up to 200% scale)
- [ ] Ensure all interactive elements have focus indicators
- [ ] Add proper ARIA labels to all components
- [ ] Implement screen reader support: VoiceOver (iOS), TalkBack (Android)
- [ ] Test all flows with screen reader
- [ ] Implement high contrast mode (WCAG AAA)
- [ ] Ensure proper heading hierarchy on every page
- [ ] Implement keyboard navigation (hardware keyboards on tablets)
- [ ] Add `prefers-reduced-motion` support (already done)
- [ ] Add `prefers-color-scheme` support (already dark-only, add light mode)
- [ ] Implement focus trapping in modals/bottom sheets
- [ ] Add skip-to-content link
- [ ] Ensure color contrast meets WCAG AA (4.5:1 text, 3:1 large text)
- [ ] Add announcements for dynamic content (toast, notifications)
- [ ] Test with actual assistive technology

### Files to Create

- `src/app/core/services/accessibility.service.ts`
- `src/app/shared/skip-link/skip-link.component.ts`
- `src/app/shared/live-region/live-region.directive.ts`
- `src/styles/_accessibility.scss`

### Files to Modify

- `src/styles/_tokens.scss` — add accessible color palette
- All component templates — add ARIA attributes

---

## PHASE 14 — Role-Based UX

**Goal:** Every role sees exactly what they need — no noise, no clutter.

### Actions

- [ ] Design and implement RoleHomeService — returns home screen config per role
- [ ] **Technician Home**: Today's shift, Quick clock-in/out, Tasks, Next shift, Notifications, Emergency alert
- [ ] **Supervisor Home**: Unit coverage status, Pending approvals, Live staff tracking, Device alerts, Attendance exceptions
- [ ] **Manager Home**: Hospital KPIs, Operational summary, Analytics summary, Compliance status, Staffing gaps
- [ ] **Admin Home**: Full command center, System health, Audit summary, User management, Settings
- [ ] Implement role-based FAB actions (each role has different primary actions)
- [ ] Implement role-based bottom nav items
- [ ] Implement role-based quick action grid
- [ ] Implement role-based KPI widgets
- [ ] Build widget system: configurable dashboard widgets per role
- [ ] Implement role-based notification filtering

### Files to Create

- `src/app/core/services/role-home.service.ts` — home config per role
- `src/app/core/services/widget-registry.service.ts` — dashboard widget system
- `src/app/shared/role-home/technician-home.component.ts`
- `src/app/shared/role-home/supervisor-home.component.ts`
- `src/app/shared/role-home/manager-home.component.ts`
- `src/app/shared/role-home/admin-home.component.ts`

### Files to Modify

- `src/app/layouts/main-layout/main-layout.component.ts` — role-based navigation
- `src/app/features/dashboard/dashboard.component.ts` — role-based widgets
- `src/app/components/floating-actions/floating-actions.component.ts` — role-based FAB

---

## PHASE 15 — Mobile Dashboard

**Goal:** A dedicated mobile-first dashboard that replaces the desktop dashboard on phone.

### Actions

- [ ] Build `MobileDashboardComponent` — completely separate from desktop dashboard
- [ ] **Technician Dashboard**:
  - Active shift card with large clock-in/out button
  - Remaining hours countdown
  - Task completion progress
  - Next 3 shifts preview
  - Recent notifications feed
  - Emergency alert button
- [ ] **Supervisor Dashboard**:
  - Live unit coverage cards
  - Staff on/off duty count
  - Pending approvals count
  - Device alerts summary
  - Quick navigation to operations center
- [ ] **Manager Dashboard**:
  - KPI summary cards
  - Staffing gap alerts
  - Department occupancy
  - Overtime trends
  - Compliance status
- [ ] Implement pull-to-refresh on dashboard
- [ ] Add skeleton loading for dashboard cards
- [ ] Implement dashboard widget drag-to-reorder (persisted)

### Files to Create

- `src/app/features/technician-dashboard/technician-dashboard.component.ts`
- `src/app/features/supervisor-dashboard/supervisor-dashboard.component.ts`
- `src/app/features/manager-dashboard/manager-dashboard.component.ts`
- `src/app/shared/dashboard-widget/dashboard-widget.component.ts`
- `src/app/shared/active-shift-card/active-shift-card.component.ts`
- `src/app/shared/staff-coverage-card/staff-coverage-card.component.ts`

### Files to Modify

- `src/app/app.routes.ts` — add role-specific dashboard routes
- `src/app/layouts/main-layout/` — role-based default redirect

---

## PHASE 16 — Mobile Forms

**Goal:** Every form is mobile-optimized — large inputs, numeric keyboards, auto-save, stepper.

### Actions

- [ ] Build `MobileFormComponent` — stepper-based multi-step form wrapper
- [ ] Build `MobileFormFieldComponent` — large touch-friendly input with floating label
- [ ] Build `MobileNumericInputComponent` — numeric keyboard, large target
- [ ] Build `MobileDateInputComponent` — native date picker integration
- [ ] Build `MobileSelectFieldComponent` — action sheet + search
- [ ] Implement auto-save: periodic save to local storage as user types
- [ ] Implement offline draft: save incomplete forms to IndexedDB/SQLite
- [ ] Implement form validation with large error messages
- [ ] Redesign key forms:
  - Leave request → 2-step: type + dates, reason + submit
  - Swap request → 3-step: shift to swap, preferred shift, reason
  - Incident report → camera + category + severity + description
  - Handover note → priority + recipient + note
  - Clock-in/out → one-tap with location
- [ ] Add form progress indicator (step X of Y)

### Files to Create

- `src/app/shared/mobile-form/mobile-form.component.ts`
- `src/app/shared/mobile-form/mobile-form-field.component.ts`
- `src/app/shared/mobile-form/mobile-numeric-input.component.ts`
- `src/app/shared/mobile-form/mobile-date-input.component.ts`
- `src/app/shared/mobile-form/mobile-select-field.component.ts`
- `src/app/shared/mobile-form/auto-save.directive.ts`

### Files to Modify

- `src/app/components/leave-management/leave-management.component.ts` — mobile form
- `src/app/components/subswap-requests/subswap-requests.component.ts` — mobile form
- `src/app/components/device-incidents/device-incident-report.component.ts` — mobile form
- `src/app/components/handover-notes/handover-notes.component.ts` — mobile form

---

## PHASE 17 — Production Readiness

**Goal:** App store submission ready — builds, signing, compliance.

### Actions

- [ ] Configure Android build: APK + AAB with proper signing
- [ ] Configure iOS build: IPA with App Store distribution
- [ ] Implement Android App Signing by Google Play
- [ ] Implement iOS Code Signing + Provisioning Profiles
- [ ] Test Android build: `npx cap sync android && npx cap open android`
- [ ] Test iOS build: `npx cap sync ios && npx cap open ios`
- [ ] Configure CI/CD for mobile builds (GitHub Actions + Fastlane)
- [ ] Set up Android Play Console listing (internal track first)
- [ ] Set up Apple App Store Connect listing
- [ ] Implement in-app review prompt (Android `InAppReview`, iOS `SKStoreReviewController`)
- [ ] Implement in-app update prompt (Android `InAppUpdate`)
- [ ] Implement crash reporting (Firebase Crashlytics or Sentry)
- [ ] Implement usage analytics (Firebase Analytics or PostHog)
- [ ] Set up monitoring: crash-free rate, ANR rate, startup time

### Files to Create

- `fastlane/Fastfile`
- `fastlane/Appfile`
- `fastlane/Matchfile`
- `.github/workflows/android-build.yml`
- `.github/workflows/ios-build.yml`

### Files to Modify

- `capacitor.config.ts` — final app ID, name, version
- `android/app/build.gradle` — signing config
- `ios/App/App.xcodeproj` — code signing

### Capacitor Plugins Required

- `@capacitor/app-launcher` — app review
- `@capacitor/filesystem` — file management

---

## PHASE 18 — Store Assets

**Goal:** Professional store listing that drives downloads and meets editorial guidelines.

### Actions

- [ ] Generate adaptive icons: Android (various densities), iOS (various sizes)
- [ ] Generate splash screens: Android (9-patch), iOS (storyboard)
- [ ] Design feature graphic (Google Play: 1024x500)
- [ ] Design store screenshots:
  - Android: 7 screenshots (phone 5.5" + 6.5", tablet 7" + 10", landscape)
  - iOS: 6.5" + 5.5" + 12.9" displays
- [ ] Write app description (Turkish + English):
  - Short description (80 chars)
  - Full description (4000 chars)
  - Feature highlights
  - Target audience
- [ ] Set up keywords (Turkish + English)
- [ ] Prepare privacy policy (HIPAA-compliant)
- [ ] Prepare support URL
- [ ] Set up app versioning strategy (semver + build number)

### Files to Create

- `docs/mobile/store-assets/android/` — adaptive icons, feature graphic, screenshots
- `docs/mobile/store-assets/ios/` — app icons, screenshots
- `docs/mobile/store-assets/description.md`
- `docs/mobile/store-assets/privacy-policy.md`

### Files to Modify

- `capacitor.config.ts` — finalize version, app name
- `android/app/src/main/res/` — icon resources
- `ios/App/App/Assets.xcassets/` — icon assets

---

## PHASE 19 — Testing

**Goal:** Comprehensive automated testing for all mobile features.

### Actions

- [ ] Unit tests for all mobile services (push, biometric, offline, navigation, cache)
- [ ] Unit tests for all mobile components (bottom sheet, action sheet, dialog)
- [ ] E2E tests for mobile flows (login, clock-in, view schedule, submit leave)
- [ ] Offline tests: enable airplane mode, verify cached data, queue writes, sync on reconnect
- [ ] Notification tests: receive foreground/background push, tap action
- [ ] Biometric tests: verify identity, fallback to PIN, cancel flow
- [ ] Rotation tests: portrait → landscape on all screens
- [ ] Performance tests: cold start time, FPS, memory usage
- [ ] Accessibility tests: screen reader flow, contrast ratio, touch target size
- [ ] Network condition tests: 3G, 4G, slow network, offline
- [ ] Install tests: fresh install, upgrade from previous version
- [ ] Multi-window tests (Android 7+ / iPadOS)

### Files to Create

- `e2e/mobile/` — mobile-specific E2E tests
- `src/app/core/services/__tests__/` — service tests
- `src/app/shared/__tests__/` — component tests

### Test Framework

- Unit: Vitest (existing) + Angular TestBed for component tests
- E2E: Playwright (existing) + `@capacitor/test` or Appium
- Performance: Lighthouse CI + Web Vitals

---

## PHASE 20 — Final Audit

**Goal:** Score 10/10 across all categories — fix any gap automatically.

### Actions

- [ ] Score each category with detailed rubric
- [ ] **Native Feel (10/10)**: Bottom nav, gesture drawer, page transitions, haptic feedback, native pickers, swipe actions, pull-to-refresh
- [ ] **UX (10/10)**: Role-based home, large touch targets, mobile-first forms, dashboard widgets, one-handed operation
- [ ] **Performance (10/10)**: Cold start <2s, 60fps scrolling, virtual scroll, lazy loading, bundle <500KB initial
- [ ] **Security (10/10)**: Certificate pinning, encrypted storage, biometric auth, root detection, OWASP MASVS L2
- [ ] **Accessibility (10/10)**: WCAG AA+, screen reader, high contrast, large fonts, keyboard nav
- [ ] **Healthcare Workflow (10/10)**: Glove-friendly, night mode, emergency alert, fast check-in, critical alerts
- [ ] **Offline (10/10)**: SQLite storage, full offline CRUD, conflict resolution, automatic background sync
- [ ] **Notifications (10/10)**: FCM push, local notifications, notification actions, deep link, scheduled reminders
- [ ] **Production Readiness (10/10)**: App store builds, signing, CI/CD, crash reporting, analytics, monitoring
- [ ] Generate final scorecard in `docs/mobile/final-audit.md`
- [ ] Any score below 10/10 triggers automated remediation loop

### Output

- `docs/mobile/final-audit.md` — comprehensive 10/10 scorecard with evidence for each criterion

---

## Implementation Order

```
Week 1-2:  Phase 1 (Audit) + Phase 2 (Navigation) + Phase 3 (Layout)
Week 3-4:  Phase 4 (Components) + Phase 5 (Offline)
Week 5-6:  Phase 6 (Push) + Phase 7 (Auth) + Phase 8 (Device)
Week 7:    Phase 9 (Healthcare) + Phase 10 (Performance)
Week 8:    Phase 11 (Animations) + Phase 12 (Security)
Week 9:    Phase 13 (Accessibility) + Phase 14 (Role UX)
Week 10:   Phase 15 (Dashboard) + Phase 16 (Forms)
Week 11:   Phase 17 (Production) + Phase 18 (Store Assets)
Week 12:   Phase 19 (Testing) + Phase 20 (Final Audit)
```

**Total: 12 weeks to 10/10 across all categories.**

---

## Backward Compatibility Guarantee

| Layer          | Strategy                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| Routes         | Web routes unchanged. Mobile routes added under `/app/mobile/` prefix      |
| Components     | Mobile components are new. Web components unchanged                        |
| CSS            | All mobile styles scoped under `.is-mobile` body class or `@media` queries |
| State          | Shared signals/computed — mobile and web read from same source             |
| Backend        | Zero changes to existing endpoints. New mobile-specific endpoints optional |
| Build          | Single `ng build` produces both web and mobile experience                  |
| Service Worker | Existing PWA caching unchanged. Mobile adds SQLite layer                   |
