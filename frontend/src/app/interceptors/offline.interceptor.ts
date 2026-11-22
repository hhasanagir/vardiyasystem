import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { OfflineGuard } from '../features/scheduling/services/offline-guard';

function isNetworkError(error: HttpErrorResponse): boolean {
  return error.status === 0 || error.error instanceof ErrorEvent || error.message.includes('Http failure response for');
}

/**
 * Offline interceptor.
 *
 * P3.1 (PWA HARDENING): This interceptor NO LONGER:
 *  - caches authenticated/tenant/user-scoped GET responses (no IndexedDB API cache, no cross-user cache risk),
 *  - queues offline writes (no offline write/approve/queue design),
 *  - fabricates success (no fake 202/200 — no "sahte başarı").
 *
 * It only surfaces a meaningful, deterministic message when a request fails
 * because the device is offline, then RETHROWS the original error so the
 * standard error pipeline + GlobalErrorHandler present the real failure to
 * the user. Offline means a genuine network failure with a clear error, never
 * a silent/queued/"successful" result.
 */
export const offlineInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const offlineGuard = inject(OfflineGuard);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (isNetworkError(error)) {
        const isOffline = offlineGuard.isOffline();
        console.warn(
          `[VardiyaOS ${isOffline ? 'OFFLINE' : 'NETWORK-ERROR'}] ` +
          `${req.method} ${req.urlWithParams} — işlem gerçekleştirilmedi: ` +
          (isOffline
            ? 'İnternet bağlantısı yok (çevrimdışı). Bağlantı kurulunca yeniden deneyin.'
            : 'Sunucuya ulaşılamadı.')
        );
      }
      return throwError(() => error);
    })
  );
};
