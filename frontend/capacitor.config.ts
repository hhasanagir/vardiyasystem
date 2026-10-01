import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hospital.vardiya',
  appName: 'Vardiya Yönetim Sistemi',
  webDir: 'dist/frontend/browser',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    hostname: 'app.vardiya.local',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    minimumOSVersion: '16.0',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    backgroundColor: '#0f172a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#3b82f6',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_schedule',
      iconColor: '#3b82f6',
    },
  },
};

export default config;
