# App Store & Play Store Preparation

## App Information

| Field | Android | iOS |
|-------|---------|-----|
| **App Name** | VardiyaOS | VardiyaOS |
| **Package/Bundle ID** | com.hospital.vardiya | com.hospital.vardiya |
| **Version** | 1.0.0 | 1.0.0 |
| **Build Number** | 1 | 1 |
| **Min OS Version** | Android 8.0 (API 26) | iOS 16.0 |
| **Target OS Version** | Android 14 (API 34) | iOS 18.0 |
| **Category** | Medical / Productivity | Medical / Productivity |

## Store Assets Required

### Icon Set
- Located at `frontend/public/icons/`
- Generate platform-specific icons:
  ```bash
  npx capacitor-assets generate --iconBackgroundColor '#0f172a'
  ```

### Screenshots (Required)
| Screen | Android | iOS |
|--------|---------|-----|
| Dashboard | 1080x1920 | 1242x2688 |
| Schedule View | 1080x1920 | 1242x2688 |
| Login Screen | 1080x1920 | 1242x2688 |
| Shift Details | 1080x1920 | 1242x2688 |
| Notifications | 1080x1920 | 1242x2688 |

### Feature Graphic (Android)
- Size: 1024x500px
- Format: PNG
- Content: App logo + "Vardiya Yönetim Sistemi"

### Description Text (Turkish)
> VardiyaOS, hastanelerin radyoloji bölümlerinde vardiya yönetimini kolaylaştıran profesyonel bir mobil uygulamadır. Teknisyenler, baş teknisyenler ve yöneticiler için özel olarak tasarlanmıştır.

### Keywords (iOS)
- vardiya, nöbet, hastane, radyoloji, teknisyen, shift, schedule, hospital

## Privacy Policy
- Host at: `https://vardiya.com/privacy-policy`
- Required fields: data collection, storage, sharing, user rights
- Highlight: no health data collection, only work schedule data

## Versioning Strategy
- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Major: Breaking API changes
- Minor: New features, backward compatible
- Patch: Bug fixes

## Build Numbers
- Android: Increment per build (integer)
- iOS: Increment per build (integer)

## Testing Requirements
- [ ] TestFlight beta for iOS (minimum 1 external tester)
- [ ] Google Play Internal Testing (minimum 1 tester)
- [ ] 7-day review period for Apple App Store
- [ ] 2-3 day review for Google Play Store
