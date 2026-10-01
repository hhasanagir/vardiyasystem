import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  requestPermission(): Observable<NotificationPermission> {
    return of('denied' as NotificationPermission);
  }

  getToken(): Observable<string | null> {
    return of(null);
  }

  onMessage(): Observable<any> {
    return of(null);
  }
}
