# VardiyaOS Capacitor Mobile Transformation

**Target:** Native Feel 10/10  
**Audience:** 5,000+ hospital staff (MR, BT, Röntgen, Nükleer Tıp, Radyasyon Onkolojisi)  
**Platforms:** iOS 16+ (iPadOS), Android 14+ (Tablets)  
**Architecture:** Angular 21.2 + Capacitor 8 + Native Plugins

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Angular Shell                        │
│  ┌───────────────────────────────────────────────┐   │
│  │          Native Navigation (IonTabs/Drawer)    │   │
│  │  ┌─────┐ ┌───────┐ ┌──────┐ ┌───────────┐   │   │
│  │  │Tabs │ │Drawer │ │Depth │ │  Tablet    │   │   │
│  │  │     │ │       │ │Nav   │ │  SplitView │   │   │
│  │  └─────┘ └───────┘ └──────┘ └───────────┘   │   │
│  ├───────────────────────────────────────────────┤   │
│  │         Feature Components (30 routes)         │   │
│  ├───────────────────────────────────────────────┤   │
│  │           Native Plugin Abstraction            │   │
│  │  Camera │ QR │ File │ Share │ Biometric │ Haptics│
│  ├───────────────────────────────────────────────┤   │
│  │            Offline-First Data Layer             │   │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────┐  │   │
│  │  │  SQLite  │  │   Sync    │  │  Conflict  │  │   │
│  │  │  (Local) │  │   Engine  │  │  Resolver  │  │   │
│  │  └──────────┘  └───────────┘  └────────────┘  │   │
│  ├───────────────────────────────────────────────┤   │
│  │      Push Notifications (FCM + Local)          │   │
│  ├───────────────────────────────────────────────┤   │
│  │          Deep Links / Universal Links          │   │
│  └───────────────────────────────────────────────┘   │
│                    Capacitor 8 Bridge                 │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision        | Choice                                   | Rationale                                                                                                                                                        |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Navigation**  | Custom Angular-driven (no Ionic)         | Existing routes, guard system, and animations would require full rewrite with Ionic. Custom implementation gives full control and avoids 500KB+ bundle overhead. |
| **Bottom Tabs** | Capacitor Tabs plugin + Angular routing  | Native tab bar (not CSS) for true native feel. Each tab is a separate WKWebView/WebView for instant switching.                                                   |
| **Drawer**      | Native drawer plugin                     | Native slide-in menu with proper gesture handling, not a CSS overlay.                                                                                            |
| **Local DB**    | SQLite via `@capacitor-community/sqlite` | Replaces IndexedDB for true native persistence. Supports complex queries, migrations, encryption.                                                                |
| **Sync**        | CRDT-based conflict resolution           | Last-write-wins is insufficient for hospital scheduling. CRDT merges ensure no data loss.                                                                        |
| **Forms**       | Keep Angular forms                       | Hospital workflow forms are complex; native form frameworks don't support multi-step validation.                                                                 |
| **Navigation**  | URL-based routing (same as web)          | Deep links, universal links, and push notification deep linking all resolve to URLs. Single source of truth.                                                     |

---

## Phase 1: Native Foundation (Week 1-2)

### 1.1 Firebase Cloud Messaging Setup

**Files to create:**

```
frontend/
├── android/app/google-services.json        # From Firebase Console
├── ios/App/App/GoogleService-Info.plist     # From Firebase Console
├── scripts/setup-firebase.sh               # Firebase project bootstrap
```

**Implementation:**

```gradle
// android/app/build.gradle additions
plugins {
  id 'com.google.gms.google-services' version '4.4.2'
}
dependencies {
  implementation platform('com.google.firebase:firebase-bom:33.12.0')
  implementation 'com.google.firebase:firebase-messaging'
}
```

**iOS:**

```swift
// AppDelegate.swift additions
import Firebase
FirebaseApp.configure()
// Capacitor PushNotifications handles registration
```

### 1.2 Missing Services (4 files)

#### `core/services/mobile.service.ts`

Native platform abstraction layer. Handles:

- `isNative()` / `isWeb()` / `isIOS()` / `isAndroid()` detection
- `isTablet()` based on Device plugin info
- `getDeviceInfo()` returning platform, OS version, model
- `getStatusBarHeight()` for safe area computation
- App lifecycle events (resume, pause, back button)
- Haptic feedback wrapper (`impact()`, `notification()`, `selection()`)
- Screen orientation lock/unlock

#### `services/push-notification.service.ts`

Handles:

- FCM registration via Capacitor PushNotifications plugin
- Token management (store, refresh, send to backend)
- Permission request flow (with rationale dialog)
- Notification tap handling → route navigation
- Badge count management
- Local notification scheduling for shift reminders
- `notifications$` observable for in-app handling

#### `services/camera.service.ts`

Wraps @capacitor/camera for:

- `takePhoto()` → returns base64 or file URI
- `pickFromGallery()` → returns base64 or file URI
- Automatic thumbnail generation
- Exif stripping for privacy
- Permission management
- Max file size enforcement (10MB for upload)

#### `services/deep-link.service.ts`

Handles:

- Universal Link / App Link parsing via @capacitor/app `appUrlOpen`
- Custom URL scheme (`vardiya://`) handling
- Route resolution from URL path
- Push notification payload → route navigation
- `link$` observable for subscribers

### 1.3 App Lifecycle Integration

**Files to modify:**

- `src/app/app.component.ts` — add Capacitor app lifecycle listeners
- `src/app/app.config.ts` — register deep link handler

```typescript
// app.component.ts additions
import { App } from "@capacitor/app";
import { StatusBar } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";

@Component({
  // ...
})
export class AppComponent {
  constructor(private mobile: MobileService) {
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) this.mobile.onPause();
      else this.mobile.onResume();
    });

    App.addListener("backButton", ({ canGoBack }) => {
      if (!canGoBack) App.exitApp();
      else history.back();
    });

    Keyboard.addListener("keyboardWillShow", (info) => {
      document.body.classList.add("keyboard-open");
    });

    Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("keyboard-open");
    });
  }
}
```

---

## Phase 2: Native Navigation & UI (Week 3-4)

### 2.1 Native Bottom Tabs

**Problem:** Current CSS-based bottom nav (5 items) is not native. Tab switching reloads components.

**Solution:** Use `@capacitor/tabs` or implement custom tab system using WKWebView instances.  
**Alternative approach:** Since Angular routes + guards are critical, keep Angular routing but wrap in a native tab container.

**Implementation plan:**

```
src/app/
├── layouts/
│   ├── main-layout/          # Desktop sidebar layout
│   ├── mobile-tab-layout/    # NEW: Mobile with native bottom tabs
│   │   ├── mobile-tab-layout.component.ts
│   │   ├── mobile-tab-layout.component.scss
│   │   └── mobile-tab-layout.component.html
│   └── tablet-layout/        # NEW: Tablet with split view
│       ├── tablet-layout.component.ts
│       └── tablet-layout.component.scss
```

**Tab structure (5 tabs):**
| Tab | Icon | Route | Deep Link |
|---|---|---|---|
| Ana Sayfa | `home-outline` | `/app/dashboard` | `vardiya://dashboard` |
| Vardiyam | `calendar-outline` | `/app/my-day` | `vardiya://my-day` |
| Bildirimler | `notifications-outline` | `/app/notifications` | `vardiya://notifications` |
| Personel | `people-outline` | `/app/employees` | `vardiya://employees` |
| Diğer | `ellipsis-horizontal` | (drawer menu) | — |

### 2.2 Native Drawer

Drawer contains secondary navigation items:

- Vardiya Planları (MR, BT, Röntgen, Nükleer, Onkoloji)
- Onay Merkezi
- Yetkinlik Matrisi
- Sertifikalar
- Raporlar
- Ayarlar
- Profil
- Çıkış

Use native drawer component via `<ion-menu>` or custom plugin bridge.
On tablets: drawer is persistent side panel (like sidebar).

### 2.3 Tablet Layouts (Split View)

Tablets (iPad, large Android tablets) get:

- **Master-detail:** Left panel (300-400px) shows list/nav, right panel shows detail
- **Grid view:** Schedule overview with month calendar + personnel side-by-side
- **Drag-and-drop:** Personnel assignment across split panel
- **Floating action button** for quick actions
- **Multi-window support** on iPadOS (SceneDelegate)

Breakpoints:

- `< 400px`: Phone portrait (bottom tabs + full-screen routes)
- `400-768px`: Phone landscape (tabs + wider content)
- `768-1024px`: Tablet portrait (drawer persistent + stacked nav)
- `1024px+`: Tablet landscape (split view + sidebar)

### 2.4 One-Handed UX

**Design patterns for hospital staff on-the-go:**

1. **Bottom sheets** for all actions (instead of modals)
2. **Thumb zone**: Primary actions at bottom 1/3 of screen
3. **Reachability**: Pull header content down (iOS-style)
4. **Swipe gestures**: Swipe to complete task, swipe to call, swipe to clock in/out
5. **Floating action button** with thumb-accessible position
6. **Large touch targets**: 48px minimum, 56px preferred
7. **Contextual toolbar**: Appears at thumb-level when action is available

### 2.5 Adaptive Icons & Native Splash

**Icons:**

- Android: Adaptive icon (foreground + background layers) in `android/app/src/main/res/`
- iOS: All icon sizes in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

**Splash:**

- Animated splash using Lottie
- Branded background with pulsing logo
- Auto-dismiss after 1.5s or when app ready

---

## Phase 3: Offline-First Architecture (Week 5-6)

### 3.1 SQLite Local Database

**Install:** `npm install @capacitor-community/sqlite`

**Schema (mirrors backend):**

```sql
-- Schedules, cached for offline browsing
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  unit TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  data JSON NOT NULL,  -- Full schedule with assignments
  version INTEGER DEFAULT 1,
  synced_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Personnel cache
CREATE TABLE personnel (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,  -- Full personnel object
  synced_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Devices cache
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  synced_at TEXT
);

-- Offline queue (replaces IndexedDB)
CREATE TABLE offline_queue (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,      -- 'create', 'update', 'delete'
  entity TEXT NOT NULL,      -- 'schedule', 'personnel', 'device', 'incident', 'handover', 'attendance'
  entity_id TEXT,
  payload JSON NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, syncing, completed, conflicted, failed
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  conflict_type TEXT,
  server_version INTEGER
);

-- Conflict log
CREATE TABLE conflict_log (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_version JSON NOT NULL,
  server_version JSON NOT NULL,
  resolution TEXT,             -- 'local_wins', 'server_wins', 'merged'
  resolved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 SQLite Service (`core/services/sqlite.service.ts`)

```typescript
@Injectable({ providedIn: "root" })
export class SqliteService {
  private db!: SQLiteDBConnection;

  async initialize(): Promise<void> {
    const sqlite = CapacitorSQLite;
    const ret = await sqlite.createConnection(
      "vardiyaos",
      false,
      "no-encryption",
      1,
      false,
    );
    this.db = ret.connection!;
    await this.db.open();
    await this.migrate();
  }

  async execute(
    sql: string,
    params?: any[],
  ): Promise<SQLiteDBConnectionResult> {
    return this.db.run(sql, params);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.db.query(sql, params);
    return result.values as T[];
  }

  // CRUD helpers
  async upsert(table: string, data: Record<string, any>): Promise<void> {
    /* ... */
  }
  async delete(table: string, id: string): Promise<void> {
    /* ... */
  }
  async getById<T>(table: string, id: string): Promise<T | null> {
    /* ... */
  }
  async getAll<T>(table: string, orderBy?: string): Promise<T[]> {
    /* ... */
  }
}
```

### 3.3 Sync Engine Rewrite (`core/services/sync-engine.service.ts`)

Replaces `offline-sync.service.ts`. New capabilities:

1. **Periodic sync:** Every 30s when online + items pending
2. **Background fetch:** On iOS 16+, background app refresh
3. **Push-triggered sync:** When notification arrives, sync that entity
4. **Manual pull-to-refresh sync**
5. **Selective sync:** Sync only changed entities
6. **Delta sync:** Send only changed fields (not full objects)
7. **Priority queue:** Critical actions (clock-in, incident report) sync before low-priority

### 3.4 Conflict Resolution

CRDT-based resolution engine for conflicting edits:

| Entity                   | Conflict Strategy | Details                                              |
| ------------------------ | ----------------- | ---------------------------------------------------- |
| **Attendance**           | Last-write-wins   | Clock-in/out can't be merged. Server timestamp wins. |
| **Handover notes**       | Last-write-wins   | Single author. Server version wins.                  |
| **Device incidents**     | Last-write-wins   | Single reporter. Server version wins.                |
| **Schedule assignments** | **CRDT merge**    | Both edits preserved. Admin resolves UI conflicts.   |
| **Swap requests**        | Three-way merge   | If both parties edited, merge with status 'pending'. |
| **Profile edits**        | Last-write-wins   | Manager overrides.                                   |

### 3.5 Offline Queue Enhancement

Current IndexedDB queue → SQLite queue. Enhance with:

- **Optimistic update:** Apply changes to local DB immediately, show checkmark, then sync
- **Queue persistence:** Survive app restarts
- **Retry with backoff:** 5s → 30s → 5m → 30m → fail
- **Batch sync:** Group actions per entity for batch API calls
- **Progress indicator:** Show sync progress in status bar/FAB

### 3.6 Connection-Aware UI

- Global connection status indicator (green dot / yellow dot / red dot)
- Offline banner: "Çevrimdışı mod - Değişiklikler senkronize edilecek"
- Disabled buttons with tooltip explaining offline limitation
- Read-only mode for entities that require network
- Queued action count badge on sync button

---

## Phase 4: Native Device Features (Week 7)

### 4.1 QR/Barcode Scanner

**Plugin:** `@capacitor-mlkit/barcode-scanning` (Android) / `@capacitor-community/barcode-scanner` (cross-platform)

**Use cases:**
| Flow | Action |
|---|---|
| Device identification | Scan QR on device → open device detail / incident report |
| Personnel badge | Scan badge → view personnel profile |
| Equipment check | Scan asset tag → update maintenance record |
| Room/location | Scan room QR → view unit schedule |

**Implementation:**

```typescript
// services/qr-scanner.service.ts
@Injectable({ providedIn: "root" })
export class QrScannerService {
  async scan(): Promise<string> {
    // Open camera in scanner mode
    // Return scanned value
  }

  async generate(data: string): Promise<string> {
    // Generate QR code image (base64)
    // For printing device labels
  }
}
```

### 4.2 File Picker

**Plugin:** `@capacitor/filesystem` + `@capacitor/file-picker` or native `<input type="file">`

**Use cases:**
| Flow | Action |
|---|---|
| Incident photo | Attach from gallery or take photo |
| Document upload | Pick PDF/Excel for shift reports |
| Signature | Capture signature image for handover |

### 4.3 Share Sheet

**Plugin:** `@capacitor/share`

**Use cases:**
| Flow | Action | Content |
|---|---|---|
| Share schedule | Export as PDF/iCal | Schedule file |
| Share report | Send analytics link | Deep link + description |
| Share device status | Quick update to WhatsApp | Status text + photo |

### 4.4 Native Camera Integration

Camera is used in these flows:

1. **Incident reporting:** Photo of broken device
2. **Handover notes:** Photo of whiteboard/notes
3. **Personnel profile:** Profile photo
4. **Equipment inspection:** Evidence photo

Flow: `CameraService.takePhoto()` → compress to 1080px max → store in SQLite as base64 → upload to backend → sync

---

## Phase 5: Deep Links & Sharing (Week 8)

### 5.1 Universal Links (iOS)

Configure `apple-app-site-association` file on backend at `/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.hospital.vardiya",
        "paths": ["/app/*", "/login/*"]
      }
    ]
  }
}
```

Configure iOS entitlement in Xcode: `Associated Domains: applinks:app.vardiya.com`

### 5.2 Android App Links

Configure assetlinks.json on backend at `/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.hospital.vardiya",
      "sha256_cert_fingerprints": ["..."]
    }
  }
]
```

Configure Android manifest:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.vardiya.com" android:pathPrefix="/app/" />
</intent-filter>
```

### 5.3 Route Resolution Map

```typescript
const DEEP_LINK_ROUTES: Record<string, string> = {
  dashboard: "/app/dashboard",
  "my-day": "/app/my-day",
  "my-shifts": "/app/my-shifts",
  employees: "/app/employees",
  "employees/:id": "/app/employees/", // append id
  "mr-plan": "/app/mr-plan",
  "bt-plan": "/app/bt-plan",
  "rontgen-plan": "/app/rontgen-plan",
  "incident/:id": "/app/device-incidents", // navigate + open detail
  "handover/:id": "/app/handover-notes",
  notifications: "/app/notifications",
  profile: "/app/profile",
  settings: "/app/settings",
  "swap-requests": "/app/swap-requests",
  "leave-management": "/app/leave-management",
};

function resolveDeepLink(url: string): string {
  const path = url.replace(/^(vardiya:\/\/|https:\/\/app\.vardiya\.com\/)/, "");
  // Match to route map
  return DEEP_LINK_ROUTES[path] || "/app/dashboard";
}
```

---

## Phase 6: Hospital Workflow Optimization (Week 9)

### 6.1 One-Tap Clock In/Out

- When within geofence of hospital (100m radius), show "Vardiyaya Başla" on lock screen
- On tap: biometric verification → clock in → haptic confirmation → navigate to My Day
- Estimated location using `@capacitor/geolocation` (optional, permission-gated)

### 6.2 Fast Incident Reporting (3-tap)

1. Tap FAB → "Arıza Bildir" → camera opens → take photo → select device from scanned QR or dropdown → submit
2. All offline-capable. Queue if no network.

### 6.3 QR-Based Device Identification

Scan QR on device → auto-fill device ID, unit, location → show:

- Current schedule for this device
- Active incidents
- Maintenance history
- Quick "Arıza Bildir" button

### 6.4 Handover Note Quick Create

End-of-shift flow:

1. Tap "Devir Teslim" on My Day screen
2. See checklist of incomplete tasks
3. Add notes via voice-to-text or keyboard
4. Attach photos if needed
5. Sign with finger
6. One-tap complete

### 6.5 Offline Shift Viewing

All current and upcoming shifts cached in SQLite:

- Browse without network
- See full schedule details
- Make swap requests (queued)
- View personnel list (cached)

### 6.6 Shift Swap on Mobile

1. View upcoming shifts
2. Tap "Takas İste" on a shift
3. Select replacement from personnel list
4. Optional note
5. Submit (queued if offline)
6. Get push notification when accepted/rejected

### 6.7 Quick Actions for Shift Managers

- Approve/reject leave requests from notification
- Quick personnel reassignment (drag on tablet, tap on phone)
- Emergency fill: "Find available staff for [shift]" → shows top 3 candidates

---

## Phase 7: Polish & QA (Week 10)

### 7.1 Native Feel Audit Checklist

| Criterion              | Target         | How                                                   |
| ---------------------- | -------------- | ----------------------------------------------------- |
| App startup            | < 2s           | Native splash + lazy load                             |
| Navigation transitions | 300ms spring   | Native tab switching                                  |
| Scrolling              | 60fps          | Virtual scroll + GPU acceleration                     |
| Tap response           | < 100ms        | Touch events, not click events                        |
| Haptic feedback        | ✓              | All interactions have haptics                         |
| Safe areas             | ✓              | Proper insets on all devices                          |
| Keyboard handling      | ✓              | Content adjusts, scrolls into view                    |
| Dark mode              | ✓              | Follows system + manual toggle                        |
| Accessibility          | WCAG AA        | VoiceOver, TalkBack, dynamic type                     |
| Orientation            | Portrait-first | Lock to portrait on phones, allow rotation on tablets |
| App icon               | ✓              | Adaptive icons all sizes                              |
| Splash screen          | ✓              | Branded, animated                                     |

### 7.2 Performance Targets

| Metric                 | Current | Target            |
| ---------------------- | ------- | ----------------- |
| First meaningful paint | ~1.5s   | < 1s (cached)     |
| Time to interactive    | ~3s     | < 1.5s            |
| JS bundle size         | ~350KB  | < 300KB           |
| Offline schedule load  | ~2s     | < 200ms (SQLite)  |
| Sync latency (1 item)  | ~5s     | < 2s              |
| Photo upload           | ~10s    | < 5s (compressed) |

### 7.3 Testing Matrix

| Device                | OS            | Test                      |
| --------------------- | ------------- | ------------------------- |
| iPhone 16 Pro         | iOS 18        | All features              |
| iPhone SE (3rd gen)   | iOS 17        | Small screen, one-handed  |
| iPad Pro 12.9"        | iPadOS 18     | Tablet layout, split view |
| Samsung Galaxy S24    | Android 14    | All features              |
| Samsung Galaxy Tab S9 | Android 14    | Tablet layout             |
| Xiaomi Redmi Note 13  | Android 14    | Budget device             |
| Offline mode          | iOS + Android | Full offline workflow     |
| Network degradation   | iOS + Android | 3G simulation             |

---

## File Manifest

### New Files to Create

```
frontend/src/app/
├── core/
│   ├── services/
│   │   ├── mobile.service.ts              # Native platform abstraction
│   │   ├── sqlite.service.ts              # SQLite database service
│   │   ├── sync-engine.service.ts         # Offline sync engine (CRDT)
│   │   ├── conflict-resolver.service.ts   # Conflict resolution logic
│   │   ├── deep-link.service.ts           # Deep/universal link handler
│   │   └── qr-scanner.service.ts          # QR/barcode scanner wrapper
│   ├── states/
│   │   ├── connectivity.state.ts          # Online/offline/connection quality
│   │   └── sync.state.ts                  # Sync progress/status
│   └── guards/
│       └── deep-link.guard.ts             # Deep link route guard
├── services/
│   ├── push-notification.service.ts       # FCM + Capacitor Push wrapper
│   ├── camera.service.ts                  # Camera plugin wrapper
│   └── share.service.ts                   # Share sheet wrapper
├── layouts/
│   ├── mobile-tab-layout/                 # NEW: Native bottom tabs
│   │   ├── mobile-tab-layout.component.ts
│   │   ├── mobile-tab-layout.component.html
│   │   └── mobile-tab-layout.component.scss
│   └── tablet-layout/                     # NEW: Split view for tablets
│       ├── tablet-layout.component.ts
│       ├── tablet-layout.component.html
│       └── tablet-layout.component.scss
└── components/
    ├── connection-banner/                  # Offline/online indicator
    ├── sync-progress/                      # Sync status indicator
    ├── bottom-sheet/                       # Reusable bottom sheet
    ├── reachability-header/               # Pull-to-reach header
    └── qr-scanner-overlay/                # Full-screen QR scanner

docs/mobile/
├── capacitor-transformation.md            # This roadmap
├── firebase-setup.md                      # FCM configuration guide
└── deep-link-spec.md                      # Deep link specification

scripts/
├── setup-firebase.sh                      # Firebase project bootstrap
└── generate-icons.sh                      # Adaptive icon generation
```

### Files to Modify

```
frontend/
├── package.json                           # Add SQLite, QR, share plugins
├── angular.json                           # Mobile-specific build config
├── capacitor.config.ts                    # Deep link scheme, server config
├── src/
│   ├── index.html                         # Add iOS status bar meta
│   ├── app/
│   │   ├── app.component.ts              # Lifecycle, keyboard, back button
│   │   ├── app.component.scss            # Safe area base styles
│   │   ├── app.config.ts                 # Register providers
│   │   ├── app.routes.ts                 # Add mobile/tablet layouts
│   │   ├── layouts/main-layout/          # Add isNative() check
│   │   ├── services/index.ts             # Point to new files
│   │   ├── services/offline-queue.service.ts   # Migrate to SQLite
│   │   ├── services/offline-sync.service.ts    # Delegate to sync-engine
│   │   ├── services/api-cache.service.ts       # Migrate to SQLite
│   │   ├── services/biometric-auth.service.ts  # Add native guard
│   │   └── services/pwa.service.ts            # Add native platform check
│   └── styles/
│       ├── styles.scss                    # Import mobile enhancements
│       └── _mobile.scss                  # Add bottom sheet, reachability
android/
├── app/src/main/
│   ├── assets/capacitor.config.json       # Updated config
│   ├── res/                               # Adaptive icon assets
│   └── java/com/hospital/vardiya/
│       └── MainActivity.java             # Deep link handling
ios/App/
├── App/
│   ├── Assets.xcassets/AppIcon.appiconset/  # All icon sizes
│   └── AppDelegate.swift                 # FCM, deep links
```

---

## Dependencies to Install

```bash
# SQLite
npm install @capacitor-community/sqlite

# QR/Barcode scanning
npm install @capacitor-mlkit/barcode-scanning  # Android
npm install @capacitor-community/barcode-scanner  # iOS fallback

# File picker
npm install @capacitor/filesystem

# Share
# Already available via @capacitor/core

# Geolocation (optional)
npm install @capacitor/geolocation

# Screen orientation
npm install @capacitor/screen-orientation

# Capacitor Tabs (for native tab bar)
npm install @capacitor/tabs

# Lottie (for animated splash)
npm install lottie-web
npm install @lottiefiles/svg-lottie-player
```

---

## Implementation Order

```
Week 1-2:  Phase 1  Native Foundation
           ├── Firebase FCM (google-services.json, GoogleService-Info.plist)
           ├── mobile.service.ts
           ├── push-notification.service.ts
           ├── camera.service.ts
           ├── deep-link.service.ts
           └── App lifecycle + keyboard + haptics

Week 3-4:  Phase 2  Native Navigation & UI
           ├── Bottom tabs layout
           ├── Tablet split-view layout
           ├── Native drawer
           ├── One-handed UX patterns
           ├── Adaptive icons
           └── Native splash (Lottie)

Week 5-6:  Phase 3  Offline-First Architecture
           ├── SQLite service + migrations
           ├── Sync engine rewrite
           ├── Conflict resolver
           ├── Connection-aware UI
           └── Optimistic updates

Week 7:    Phase 4  Native Device Features
           ├── QR scanner
           ├── File picker
           ├── Share sheet
           └── Camera integration

Week 8:    Phase 5  Deep Links & Sharing
           ├── Universal links config
           ├── Android App Links config
           ├── Deep link route resolver
           └── Push notification deep linking

Week 9:    Phase 6  Hospital Workflow Optimization
           ├── One-tap clock in/out
           ├── Fast incident (3-tap)
           ├── QR device identification
           ├── Handover quick create
           ├── Offline shift viewing
           └── Shift swap on mobile

Week 10:   Phase 7  Polish & QA
           ├── Native feel audit
           ├── Performance optimization
           ├── Real device testing
           ├── Edge case handling
           └── Accessibility pass
```

---

## Risk Register

| Risk                                                    | Impact | Likelihood | Mitigation                                                    |
| ------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------- |
| Apple App Store review rejects push notification usage  | High   | Low        | Document all notification use cases, get explicit consent     |
| Android OEMs (Xiaomi, Huawei) have custom FCM behavior  | Medium | Medium     | Test on top 5 OEMs, implement fallback polling                |
| SQLite encryption requires Capacitor Enterprise license | Medium | Low        | Use `no-encryption` mode, rely on OS-level encryption         |
| Capacitor plugin API changes during v8 beta             | Medium | Medium     | Lock plugin versions, test after each plugin update           |
| iPad split view requires significant routing refactor   | High   | Medium     | Build tablet layout as separate route tree                    |
| Offline CRDT merge complexity                           | High   | Medium     | Start with last-write-wins, add CRDT only for schedule        |
| Biometric auth flakiness on Android                     | Medium | Low        | Implement biometric + PIN fallback                            |
| Deep link conflicts with existing PWA service worker    | Low    | Low        | Service worker intercepts only same-origin, not custom scheme |
