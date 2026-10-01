import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';
import { MobileService } from './mobile.service';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

export interface BiometricState {
  available: boolean;
  enrolled: boolean;
  type: 'fingerprint' | 'face' | 'iris' | 'none';
  enabled: boolean;
}

const BIOMETRIC_ENABLED_KEY = 'vardiya_biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY = 'vardiya_biometric_credentials';

@Injectable({ providedIn: 'root' })
export class BiometricAuthService {
  private mobile = inject(MobileService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly state = signal<BiometricState>({
    available: false,
    enrolled: false,
    type: 'none',
    enabled: false,
  });

  constructor() {
    this.checkAvailability();
  }

  private mapBiometryType(biometryType: BiometryType): BiometricState['type'] {
    switch (biometryType) {
      case BiometryType.FINGERPRINT:
      case BiometryType.TOUCH_ID:
        return 'fingerprint';
      case BiometryType.FACE_ID:
      case BiometryType.FACE_AUTHENTICATION:
        return 'face';
      case BiometryType.IRIS_AUTHENTICATION:
        return 'iris';
      default:
        return 'none';
    }
  }

  private async checkAvailability() {
    if (!this.mobile.isNative()) {
      this.state.set({ available: false, enrolled: false, type: 'none', enabled: false });
      return;
    }
    try {
      const result = await NativeBiometric.isAvailable();
      this.state.set({
        available: result.isAvailable,
        enrolled: result.isAvailable,
        type: this.mapBiometryType(result.biometryType),
        enabled: await this.isBiometricEnabled(),
      });
    } catch {
      this.state.set({ available: false, enrolled: false, type: 'none', enabled: false });
    }
  }

  async saveCredentials(email: string, password: string): Promise<boolean> {
    if (!this.state().available) return false;
    try {
      await NativeBiometric.setCredentials({
        username: email,
        password,
        server: 'vardiya.app.biometric',
      });
      await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: 'true' });
      this.state.update((s) => ({ ...s, enabled: true }));
      return true;
    } catch {
      return false;
    }
  }

  async removeCredentials(): Promise<void> {
    try {
      await NativeBiometric.deleteCredentials({ server: 'vardiya.app.biometric' });
      await Preferences.remove({ key: BIOMETRIC_ENABLED_KEY });
      this.state.update((s) => ({ ...s, enabled: false }));
    } catch {}
  }

  async tryBiometricLogin(): Promise<boolean> {
    if (!this.state().enabled) return false;
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Vardiya uygulamasına giriş yapmak için kimliğinizi doğrulayın',
        title: 'Biometrik Doğrulama',
        subtitle: 'Parmak izi veya yüz tanıma ile giriş',
        description: 'Devam etmek için biyometrik verinizi kullanın',
      });
      const credentials = await NativeBiometric.getCredentials({
        server: 'vardiya.app.biometric',
      });
      if (!credentials.username || !credentials.password) return false;
      return new Promise<boolean>((resolve) => {
        this.auth.login(credentials.username!, credentials.password!).subscribe({
          next: () => {
            this.router.navigate(['/app/dashboard']);
            resolve(true);
          },
          error: () => {
            this.removeCredentials();
            resolve(false);
          },
        });
      });
    } catch {
      return false;
    }
  }

  async isBiometricEnabled(): Promise<boolean> {
    try {
      const val = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY });
      return val.value === 'true';
    } catch {
      return false;
    }
  }
}
