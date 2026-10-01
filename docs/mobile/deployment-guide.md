# Mobile Conversion Documentation

## Overview

VardiyaOS has been converted from a web-only Angular PWA to a hybrid mobile application using Capacitor 8. The app targets Android (8.0+) and iOS (16.0+) for deployment to 5000+ hospital employees.

## Architecture

```
frontend/                   ← Angular 21 application
├── src/
│   ├── app/
│   │   ├── services/       ← Capacitor-aware services
│   │   │   ├── mobile.service.ts        ← Platform detection, haptics, safe areas
│   │   │   ├── biometric-auth.service.ts ← Fingerprint/Face ID auth
│   │   │   ├── push-notification.service.ts ← FCM push handling
│   │   │   ├── camera.service.ts        ← Camera & gallery capture
│   │   │   ├── deep-link.service.ts     ← Deep link routing
│   │   │   ├── api-cache.service.ts     ← Offline GET cache
│   │   │   ├── offline-queue.service.ts ← Offline mutation queue
│   │   │   └── offline-sync.service.ts  ← Offline sync engine
│   │   ├── directives/
│   │   │   └── swipe.directive.ts       ← Touch swipe gesture
│   │   ├── components/
│   │   │   └── schedule-mobile-card/    ← Mobile schedule card view
│   │   └── ...existing app code...
│   └── styles/
│       └── _mobile.scss                 ← Mobile responsive utilities
├── android/                 ← Native Android project
├── ios/                     ← Native iOS project
├── capacitor.config.ts      ← Capacitor configuration
└── package.json             ← Mobile build scripts

backend/
├── src/
│   └── modules/
│       └── push-tokens/     ← FCM push token management
└── prisma/schema.prisma     ← PushToken model added
```

## Capacitor Plugins Installed

| Plugin                              | Version | Purpose                          |
| ----------------------------------- | ------- | -------------------------------- |
| `@capacitor/app`                    | 8.1.0   | App lifecycle & deep links       |
| `@capacitor/camera`                 | 8.2.0   | Camera & photo gallery           |
| `@capacitor/device`                 | 8.0.2   | Device info & battery            |
| `@capacitor/haptics`                | 8.0.2   | Haptic feedback                  |
| `@capacitor/keyboard`               | 8.0.5   | Keyboard show/hide events        |
| `@capacitor/local-notifications`    | 8.2.0   | Local (foreground) notifications |
| `@capacitor/preferences`            | 8.0.1   | Encrypted key-value storage      |
| `@capacitor/push-notifications`     | 8.1.1   | FCM push notifications           |
| `@capacitor/splash-screen`          | 8.0.1   | Native splash screen             |
| `@capacitor/status-bar`             | 8.0.2   | Status bar styling               |
| `@capgo/capacitor-native-biometric` | 8.4.8   | Fingerprint/Face ID auth         |

## Mobile Build Commands

```bash
npm run mobile:build              # Build + copy
npm run mobile:build:android      # Build + sync Android
npm run mobile:build:ios          # Build + sync iOS
npm run cap:open:android          # Open Android Studio
npm run cap:open:ios              # Open Xcode
npm run cap:run:android           # Run on device
npm run cap:run:ios               # Run on device
```

## Push Notification Setup

### Android

1. Create Firebase project at https://console.firebase.google.com
2. Add Android app with package `com.hospital.vardiya`
3. Download `google-services.json` to `frontend/android/app/`
4. In `android/app/build.gradle`, add: `implementation platform('com.google.firebase:firebase-bom:32.7.0')` and `implementation 'com.google.firebase:firebase-messaging'`
5. Apply Google Services plugin

### iOS

1. Add iOS app with bundle ID `com.hospital.vardiya` in Firebase
2. Download `GoogleService-Info.plist` to `frontend/ios/App/App/`
3. Enable Push Notifications capability in Xcode
4. Upload APNs key to Firebase Console

## Biometric Authentication

### Android

- Fingerprint scanner or Face Unlock (Android 10+)
- No additional config needed

### iOS

- Face ID or Touch ID
- Add to Info.plist: `NSFaceIDUsageDescription` = "Vardiya uygulamasına giriş için yüz tanıma kullanılır"

## Offline Sync

- Clock-in/out, handover notes, incidents, checklists work offline
- Queued actions auto-sync when online
- GET responses cached via ApiCacheService + IndexedDB

## API Changes for Mobile

- CORS — allow Capacitor origins (`null`)
- CSRF — skip for mobile requests
- Compression — add middleware
- Pagination — add to personnel, trainings
- File upload — multer for camera photos
- Push token — FCM registration endpoint
