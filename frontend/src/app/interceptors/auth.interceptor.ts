import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, retry, timer } from 'rxjs';
import { AuthService } from '../services/auth.service';

const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(cloned);
  }

  return next(req);
};

function shouldRetry(error: HttpErrorResponse, req: HttpRequest<unknown>): boolean {
  if (
    req.url.includes('/auth/login') ||
    req.url.includes('/auth/refresh') ||
    req.url.includes('/health')
  ) {
    return false;
  }
  if (req.method !== 'GET') return false;
  return RETRYABLE_STATUSES.includes(error.status);
}

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);
  return next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error, retryCount) => {
        if (!(error instanceof HttpErrorResponse) || !shouldRetry(error, req)) {
          throw error;
        }
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
        console.warn(
          `[RETRY] ${req.method} ${req.urlWithParams} attempt ${retryCount}/${MAX_RETRIES} after ${delay}ms`,
        );
        return timer(delay);
      },
    }),
    catchError((error: HttpErrorResponse) => {
      const url = req.urlWithParams;
      const method = req.method;
      const status = error.status;
      const isAuthRefresh = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

      const willRefresh = status === 401 && !isAuthRefresh;

      if (!willRefresh) {
        const optionalEndpoints = ['/notifications', '/schedules/dashboard/stats', '/shifts/live'];
        const isOptional = optionalEndpoints.some((e) => url.includes(e));
        if (!isOptional) {
          console.error(
            `[HTTP ${method}] ${url} -> ${status}: ${error.message ?? 'Unknown error'}`,
          );
        }
      }

      if (status === 401 && !isAuthRefresh) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            const newToken = authService.getToken();
            if (newToken) {
              const cloned = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                },
              });
              return next(cloned);
            }
            authService.forceLogout();
            return throwError(() => error);
          }),
          catchError((refreshError) => {
            console.error(`[AUTH] Token refresh failed after 401 on ${url}`);
            authService.forceLogout();
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
