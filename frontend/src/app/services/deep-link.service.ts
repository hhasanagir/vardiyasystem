import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  handleDeepLink(url: string): void {
    console.warn('[DeepLink] No native handler available', url);
  }

  onDeepLink(): Observable<string | null> {
    return of(null);
  }
}
