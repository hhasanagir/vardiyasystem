import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class MobileService {
  private platformId = inject(PLATFORM_ID);

  isNative(): boolean {
    return false;
  }

  isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  getPlatform(): 'web' | 'ios' | 'android' {
    return 'web';
  }
}
