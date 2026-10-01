# VardiyaOS Mobile Readiness Audit

> Generated: 2026-06-19
> Target: Production launch for 5000 healthcare employees on Android + iOS

## Overview

The application is already deeply mobile-ready with **Capacitor v8 fully integrated**, native Android/iOS projects, and comprehensive mobile services. This document identifies remaining gaps requiring attention before production release.

---

## 1. Capacitor Integration — ALREADY DONE

| Item                     | Status | Notes                                                          |
| ------------------------ | ------ | -------------------------------------------------------------- |
| Capacitor v8 (core, cli) | ✅     | `@capacitor/core@8.4.0`, `@capacitor/cli@8.4.0`                |
| Android platform         | ✅     | `@capacitor/android@8.4.0`, native project in `android/`       |
| iOS platform             | ✅     | `@capacitor/ios@8.4.0`, native project in `ios/`               |
| `capacitor.config.ts`    | ✅     | appId: `com.hospital.vardiya`, webDir: `dist/frontend/browser` |
| Splash screen            | ✅     | Config: 1.5s duration, dark bg, blue spinner                   |
| Status bar               | ✅     | Dark style, `#0f172a` background                               |
| Keyboard handling        | ✅     | `resize: 'body'`, dark style                                   |
| Safe area insets         | ✅     | `env(safe-area-inset-*)` used in `_mobile.scss`                |

## 2. Mobile Services — ALREADY DONE

| Service                 | File                           | Status | Notes                                                       |
| ----------------------- | ------------------------------ | ------ | ----------------------------------------------------------- |
| MobileService           | `mobile.service.ts`            | ✅     | Platform detection, battery, keyboard, haptics, Preferences |
| BiometricAuthService    | `biometric-auth.service.ts`    | ✅     | `@capgo/capacitor-native-biometric`, fingerprint + Face ID  |
| PushNotificationService | `push-notification.service.ts` | ✅     | `@capacitor/push-notifications`, FCM integration            |
| CameraService           | `camera.service.ts`            | ✅     | `@capacitor/camera`, photo capture from gallery + camera    |
| DeepLinkService         | `deep-link.service.ts`         | ✅     | `@capacitor/app`, URL handling                              |
| Local notifications     | N/A                            | ✅     | `@capacitor/local-notifications@8.2.0` installed            |

## 3. PWA / Service Worker — ALREADY DONE

| Item                        | Status | Notes                                                            |
| --------------------------- | ------ | ---------------------------------------------------------------- |
| `ngsw-config.json`          | ✅     | 10 API caching data groups configured                            |
| Service worker registration | ✅     | `provideServiceWorker('ngsw-worker.js')` in app.config           |
| Web manifest                | ✅     | `manifest.webmanifest`: display=standalone, orientation=portrait |
| Viewport meta               | ✅     | `viewport-fit=cover`, `user-scalable=no`                         |
| Apple PWA tags              | ✅     | `apple-mobile-web-app-capable=yes`, `apple-touch-icon`           |

## 4. Responsive Layout — ALREADY DONE

| Item                 | Status | Notes                                                                        |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| Bottom navigation    | ✅     | 5-item bottom nav on mobile (Home, Shifts, Requests, Notifications, Profile) |
| Custom sidebar       | ✅     | Transforms to full-screen overlay drawer on mobile                           |
| Safe area bottom     | ✅     | `env(safe-area-inset-bottom, 0px)` on bottom nav                             |
| Touch targets (44px) | ✅     | Via `touch-target` mixin in `_mobile.scss`                                   |
| Reduced motion       | ✅     | `prefers-reduced-motion` media query in `_mobile.scss`                       |
| Dark mode default    | ✅     | Default `class="dark"` on `<html>`                                           |
| Breakpoints          | ✅     | 480px (mobile), 768px (tablet)                                               |

## 5. HIGH PRIORITY Issues to Fix

### 5.1 PrimeNG Data Tables Not Mobile-Responsive

**Files:**

- `src/app/components/subswap-requests/subswap-requests.component.ts`:112 — 7-column `p-table` overflows on mobile
- `src/app/components/shifts/shifts.component.ts`:145 — 6-column `p-table` overflows on mobile

**Fix needed:** Wrap tables in horizontally-scrollable container `<div class="table-responsive">` with CSS:

```scss
.table-responsive {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

### 5.2 PrimeNG Dialogs with Fixed Pixel Widths

**Files:**

- `src/app/components/subswap-requests/subswap-requests.component.ts`:191 — `[style]="{width: '400px'}"` (most phones 360-414px wide)
- `src/app/components/shifts/shifts.component.ts`:183 — `[style]="{width: '500px'}"` (will overflow most phones)
- `src/app/components/reports/reports.component.ts` HTML template — `[style]="{width: '400px'}"`

**Fix needed:** Replace fixed `width` with responsive:

```ts
[style] = "{width: 'min(90vw, 400px)'}";
```

### 5.3 No Touch Feedback on Interactive Elements

**Files affected:** All custom buttons, nav items, tab buttons in components use custom CSS without haptic feedback

**Fix needed:** Integrate `MobileService.hapticLight()` on button taps in key interactive components for native feel.

### 5.4 Orientation Lock Not Configured

**Current:** No orientation handling for mobile. Tablets could benefit from landscape support.

**Fix needed:** Add orientation detection in `MobileService` and consider: phones → portrait-primary, tablets → both.

---

## 6. MEDIUM PRIORITY Issues

### 6.1 Backend: No Image Optimization

**Issue:** Uploaded images stored at full resolution, no thumbnail generation

**Fix needed:** Add Sharp to backend for automatic thumbnail generation on upload. Resize incident photos to max 1920px width.

### 6.2 Backend: Inconsistent Pagination

**Issue:** Personnel, units, shifts, schedules, trainings endpoints lack pagination

**Fix needed:** Add standardized `page`/`limit` pagination with `total` metadata to all list endpoints.

### 6.3 Mobile: Deep Link Route Handling

**Issue:** `DeepLinkService` exists but route matching for deep links not verified

**Fix needed:** Test and verify that deep links like `vardiya://shifts/123` correctly navigate.

### 6.4 Mobile: Notched Device Testing

**Issue:** Safe area insets configured but not verified on actual devices (iPhone notch, Android punch hole)

**Fix needed:** Test on physical devices and verify safe areas on login screens, dialogs, and modals.

---

## 7. SECURITY Gaps (PHASE 9)

### 7.1 SSL Certificate Pinning — NOT IMPLEMENTED

**Risk:** MITM attacks possible on mobile networks

**Fix needed:** Add certificate pinning via `@capacitor/network` or native code in Android/iOS projects.

### 7.2 Root/Jailbreak Detection — NOT IMPLEMENTED

**Risk:** App runs on compromised devices

**Fix needed:** Add root detection (Android) / jailbreak detection (iOS) with graceful degradation.

### 7.3 OWASP Mobile Top 10 Compliance — NOT REVIEWED

**Risk:** Undiscovered security vulnerabilities

**Fix needed:** Audit against OWASP Mobile Top 10. Key areas: insecure data storage (ensure JWT not stored in plaintext), insecure communication (verify TLS), code tampering.

---

## 8. PERFORMANCE Gaps (PHASE 8)

| Item                   | Status | Notes                                  |
| ---------------------- | ------ | -------------------------------------- |
| Bundle budgets         | ✅     | 300kB initial warning, 500kB error     |
| Lazy loading           | ✅     | All routes use `loadComponent`         |
| AOT enabled            | ✅     | Production builds                      |
| Service worker caching | ✅     | 10 API data groups                     |
| Startup performance    | ⚠️     | Not measured — need TTI/TBT benchmarks |
| Image lazy loading     | ⚠️     | Not verified in components             |

---

## 9. BUILD & RELEASE Gaps (PHASE 11)

| Item               | Status | Notes                               |
| ------------------ | ------ | ----------------------------------- |
| Android build      | ✅     | `npm run cap:build:android` exists  |
| iOS build          | ✅     | `npm run cap:build:ios` exists      |
| Version management | ❌     | No automated version bump in config |
| Code signing       | ❌     | Not configured for release          |
| CI/CD pipeline     | ❌     | No GitHub Actions for mobile builds |
| App icon set       | ❌     | Uses default Capacitor icons        |
| Store screenshots  | ❌     | Not generated                       |

---

## 10. STORE PREPARATION Gaps (PHASES 12-13)

| Item                    | Status            |
| ----------------------- | ----------------- |
| Privacy policy          | ❌ Not drafted    |
| Store description       | ❌ Not drafted    |
| Screenshots             | ❌ Not generated  |
| App category            | ❌ Not researched |
| Content rating          | ❌ Not researched |
| Google Play Console     | ❌ Not set up     |
| Apple Developer Program | ❌ Not enrolled   |

---

## 11. Full Component Audit

| Component               | Mobile Friendly? | Notes                                                   |
| ----------------------- | ---------------- | ------------------------------------------------------- |
| Login                   | ✅               | Biometric auth, responsive, touch-friendly              |
| Register                | ✅               | Card layout, mobile-responsive                          |
| Onboarding              | ✅               | Step wizard, responsive                                 |
| Dashboard               | ✅               | Card layout                                             |
| My Day                  | ✅               | Card layout                                             |
| My Shifts               | ✅               | Card/list layout                                        |
| Shifts (management)     | ⚠️               | **p-table overflows**, **p-dialog fixed 500px**         |
| Employees               | ❓               | External HTML template — needs review                   |
| Schedule Grid           | ❓               | Complex grid — likely desktop-only                      |
| Schedule Mobile Card    | ✅               | Built for mobile                                        |
| Subswap Requests        | ⚠️               | **p-table overflows**, **p-dialog fixed 400px**         |
| Leave Management        | ❓               | Needs review                                            |
| Handover Notes          | ❓               | Needs review                                            |
| Device Incidents        | ❓               | Needs review                                            |
| Device Status Update    | ❓               | Needs review                                            |
| Live Tracking           | ❓               | Needs review — maps on mobile?                          |
| Notifications           | ✅               | Signal-based, responsive                                |
| Notification Center     | ✅               | Built for both mobile and desktop                       |
| Reports                 | ⚠️               | **p-dialog fixed 400px** (export), otherwise responsive |
| Performance             | ❓               | Needs review                                            |
| Fairness Analysis       | ❓               | Needs review                                            |
| Settings                | ❓               | Needs review                                            |
| Operations Center       | ❓               | Complex — needs review                                  |
| Command Center          | ❓               | Needs review                                            |
| Approval Center         | ❓               | Needs review                                            |
| Audit Center            | ❓               | Needs review                                            |
| Training List           | ❓               | Needs review                                            |
| Skill Matrix            | ❓               | Needs review                                            |
| Profile                 | ❓               | Needs review                                            |
| Plan Pages (MR/BT/etc.) | ❓               | Complex planning grids — likely desktop-only            |

---

## 12. Summary of Required Actions

| Priority  | Count | Actions                                                                      |
| --------- | ----- | ---------------------------------------------------------------------------- |
| 🔴 HIGH   | 4     | Fix p-table responsive, fix p-dialog widths, add touch feedback, orientation |
| 🟡 MEDIUM | 4     | Backend image optimization, pagination, deep links, notch testing            |
| 🔵 LOW    | 6     | Root detection, cert pinning, versioning, store prep, icon sets, CI/CD       |

---

## 13. Quick Wins (Do First)

1. **`subswap-requests`**: Wrap `p-table` in `.table-responsive`, change dialog to `[style]="{width: 'min(90vw, 400px)'}"` — 2 edits
2. **`shifts`**: Wrap `p-table` in `.table-responsive`, change dialog to `[style]="{width: 'min(90vw, 500px)'}"` — 2 edits
3. **`reports`**: Change dialog to `[style]="{width: 'min(90vw, 400px)'}"` — 1 edit
4. **Global styles**: Add `.table-responsive` to `_layout.scss` or `_mobile.scss` — 1 edit
