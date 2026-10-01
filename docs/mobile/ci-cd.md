# CI/CD — Android & iOS Build Pipeline

## GitHub Actions Workflow

### Android Build (`cd-android.yml`)

```yaml
name: Build Android APK

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: npm ci
        working-directory: frontend

      - name: Type Check
        run: npm run typecheck
        working-directory: frontend

      - name: Build Angular
        run: npm run build
        working-directory: frontend

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: "temurin"
          java-version: "17"

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Sync Capacitor
        run: npx cap sync android
        working-directory: frontend

      - name: Build APK
        run: |
          cd android
          ./gradlew assembleRelease

      - name: Sign APK
        uses: r0adkll/sign-android-release@v1
        with:
          releaseDirectory: frontend/android/app/build/outputs/apk/release
          signingKeyBase64: ${{ secrets.ANDROID_SIGNING_KEY }}
          alias: ${{ secrets.ANDROID_KEY_ALIAS }}
          keyStorePassword: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          keyPassword: ${{ secrets.ANDROID_KEY_PASSWORD }}

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: vardiyaos-release.apk
          path: frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### iOS Build (`cd-ios.yml`)

```yaml
name: Build iOS IPA

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  build-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: npm ci
        working-directory: frontend

      - name: Build Angular
        run: npm run build
        working-directory: frontend

      - name: Sync Capacitor
        run: npx cap sync ios
        working-directory: frontend

      - name: Install CocoaPods
        run: pod install
        working-directory: frontend/ios/App

      - name: Build & Archive
        run: |
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -sdk iphoneos \
            -configuration Release \
            -archivePath $RUNNER_TEMP/VardiyaOS.xcarchive \
            archive
          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/VardiyaOS.xcarchive \
            -exportOptionsPlist exportOptions.plist \
            -exportPath $RUNNER_TEMP/VardiyaOS.ipa

      - name: Upload IPA
        uses: actions/upload-artifact@v4
        with:
          name: vardiyaos-release.ipa
          path: ${{ runner.temp }}/VardiyaOS.ipa/VardiyaOS.ipa
```

## Code Signing

### Android

- Generate keystore:
  ```bash
  keytool -genkey -v -keystore vardiyaos-release.keystore \
    -alias vardiyaos -keyalg RSA -keysize 2048 -validity 10000
  ```
- Store in GitHub Secrets:
  - `ANDROID_SIGNING_KEY` (base64 of keystore)
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_PASSWORD`

### iOS

- Apple Developer account required ($99/year)
- Create App Store Connect API Key
- Store in GitHub Secrets:
  - `APP_STORE_CONNECT_KEY`
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_ISSUER_ID`
  - `BUILD_CERTIFICATE_BASE64`
  - `P12_PASSWORD`
  - `KEYCHAIN_PASSWORD`

## Fastlane Configuration

For automated deployment to stores, add Fastlane:

```ruby
# fastlane/Fastfile
default_platform(:android)

platform :android do
  lane :deploy do
    gradle(task: 'assembleRelease')
    upload_to_play_store(
      track: 'production',
      release_status: 'completed'
    )
  end
end

platform :ios do
  lane :deploy do
    build_app(scheme: 'App')
    upload_to_app_store(skip_metadata: true, skip_screenshots: true)
  end
end
```

## Required Environment Variables

```env
# CI/CD
ANDROID_SIGNING_KEY=<base64-encoded-keystore>
ANDROID_KEY_ALIAS=vardiyaos
ANDROID_KEYSTORE_PASSWORD=<password>
ANDROID_KEY_PASSWORD=<password>
MATCH_PASSWORD=<ios-cert-password>
FASTLANE_APPLE_ID=<apple-id>
FASTLANE_APPLE_APP_SPECIFIC_PASSWORD=<app-specific-password>
```
