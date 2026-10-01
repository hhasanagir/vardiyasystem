import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, of, switchMap, tap } from 'rxjs';
import { OfflineQueueService } from '../services/offline-queue.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { ApiCacheService } from '../services/api-cache.service';

const CACHEABLE_METHODS = ['GET'];
const CACHEABLE_PREFIXES = [
  '/api/v1/personnel',
  '/api/v1/schedules',
  '/api/v1/units',
  '/api/v1/devices',
  '/api/v1/shifts',
  '/api/v1/notifications',
  '/api/v1/holidays',
  '/api/v1/skills',
  '/api/v1/trainings',
  '/api/v1/me',
  '/api/v1/my-shifts',
];

const WRITE_ENDPOINTS: { prefix: string; actionType: string }[] = [
  { prefix: '/api/v1/attendance/clock-in', actionType: 'clock-in' },
  { prefix: '/api/v1/attendance/clock-out', actionType: 'clock-out' },
  { prefix: '/api/v1/handover-notes', actionType: 'create-handover' },
  { prefix: '/api/v1/device-incidents', actionType: 'create-incident' },
  { prefix: '/api/v1/shift-tasks/', actionType: 'update-checklist' },
];

function matchWriteEndpoint(url: string): string | null {
  for (const ep of WRITE_ENDPOINTS) {
    if (url.includes(ep.prefix)) return ep.actionType;
  }
  return null;
}

function isCacheable(req: HttpRequest<unknown>): boolean {
  if (!CACHEABLE_METHODS.includes(req.method)) return false;
  return CACHEABLE_PREFIXES.some((prefix) => req.urlWithParams.includes(prefix));
}

function isNetworkError(error: HttpErrorResponse): boolean {
  return (
    error.status === 0 ||
    error.error instanceof ErrorEvent ||
    error.message.includes('Http failure response for')
  );
}

export const offlineInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const offlineSync = inject(OfflineSyncService);
  const apiCache = inject(ApiCacheService);

  if (isCacheable(req)) {
    const cacheKey = req.urlWithParams;

    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.ok) {
          const etag = event.headers.get('etag') || undefined;
          apiCache.set(cacheKey, event.body, 5 * 60 * 1000, etag);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        if (isNetworkError(error) || !navigator.onLine) {
          return of(null).pipe(
            switchMap(async () => {
              const cached = await apiCache.get(cacheKey);
              if (cached) {
                return new HttpResponse({
                  status: 200,
                  statusText: 'OK (Cached)',
                  body: cached.data,
                  headers: cached.etag
                    ? req.headers.set('X-Cached-ETag', cached.etag)
                    : req.headers,
                });
              }
              throw error;
            }),
            switchMap((response) => of(response)),
            catchError(() => {
              return of(
                new HttpResponse({
                  status: 503,
                  statusText: 'Offline',
                  body: { offline: true, message: 'No cached data available' },
                }),
              );
            }),
          );
        }
        throw error;
      }),
    );
  }

  if (
    req.method !== 'POST' &&
    req.method !== 'PATCH' &&
    req.method !== 'PUT' &&
    req.method !== 'DELETE'
  ) {
    return next(req);
  }

  const actionType = matchWriteEndpoint(req.urlWithParams);
  if (!actionType) return next(req);

  const offlineQueue = inject(OfflineQueueService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (!isNetworkError(error)) throw error;

      const headers: Record<string, string> = {};
      req.headers.keys().forEach((key) => {
        if (key.toLowerCase() !== 'authorization') headers[key] = req.headers.get(key) || '';
      });

      offlineQueue
        .add({
          actionType: actionType as any,
          method: req.method,
          url: req.urlWithParams,
          headers,
          body: req.body,
        })
        .then(() => offlineSync.refreshPendingCount());

      return of(
        new HttpResponse({
          status: 202,
          statusText: 'Accepted (Offline Queued)',
          body: { queued: true, actionType },
        }),
      );
    }),
  );
};
