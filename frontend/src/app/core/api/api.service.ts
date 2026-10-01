import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, catchError, retry, tap, map, finalize } from 'rxjs';
import { environment } from '../../environments';

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private readonly isLoading = signal(false);
  private readonly error = signal<ApiError | null>(null);

  readonly loading$ = computed(() => this.isLoading());
  readonly error$ = computed(() => this.error());

  get<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  post<T>(endpoint: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('POST', endpoint, body, options);
  }

  put<T>(endpoint: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('PUT', endpoint, body, options);
  }

  patch<T>(endpoint: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  delete<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }

  private request<T>(
    method: string,
    endpoint: string,
    body?: any,
    options?: RequestOptions
  ): Observable<T> {
    this.isLoading.set(true);
    this.error.set(null);

    const url = this.buildUrl(endpoint, options?.params);
    const httpOptions = this.buildOptions(options);

    let response$: Observable<any>;

    switch (method) {
      case 'GET':
        response$ = this.http.get<T>(url, httpOptions);
        break;
      case 'POST':
        response$ = this.http.post<T>(url, body, httpOptions);
        break;
      case 'PUT':
        response$ = this.http.put<T>(url, body, httpOptions);
        break;
      case 'PATCH':
        response$ = this.http.patch<T>(url, body, httpOptions);
        break;
      case 'DELETE':
        response$ = this.http.delete<T>(url, httpOptions);
        break;
      default:
        response$ = throwError(() => new Error(`Unsupported HTTP method: ${method}`));
    }

    let pipeline$ = response$;
    if (options?.retry) {
      pipeline$ = pipeline$.pipe(retry({ count: options.retry.count, delay: options.retry.delay }));
    }

    return pipeline$.pipe(
      tap(data => {
        if (options?.onSuccess) {
          options.onSuccess(data);
        }
      }),
      catchError(err => this.handleError(err, options)),
      finalize(() => {
        this.isLoading.set(false);
        if (options?.onComplete) {
          options.onComplete();
        }
      })
    );
  }

  private buildUrl(endpoint: string, params?: Record<string, string>): string {
    let url = `${this.baseUrl}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    return url;
  }

  private buildOptions(options?: RequestOptions): any {
    const httpOptions: any = {
      headers: options?.headers,
    };

    if (options?.observe === 'response') {
      httpOptions.observe = 'response';
    }

    return httpOptions;
  }

  private handleError(error: HttpErrorResponse, options?: RequestOptions): Observable<never> {
    let apiError: ApiError;

    if (error.error instanceof ErrorEvent) {
      apiError = {
        code: 'CLIENT_ERROR',
        message: error.error.message,
        statusCode: 0,
        timestamp: new Date().toISOString(),
      };
    } else {
      apiError = {
        code: error.error?.code || 'SERVER_ERROR',
        message: error.error?.message || error.message,
        statusCode: error.status,
        timestamp: new Date().toISOString(),
        path: error.url ?? undefined,
      };
    }

    this.error.set(apiError);

    if (options?.onError) {
      options.onError(apiError);
    }

    if (options?.silent) {
      return throwError(() => apiError);
    }

    console.error('API Error:', apiError);
    return throwError(() => apiError);
  }

  clearError(): void {
    this.error.set(null);
  }

  // Token management delegated to AuthService — these methods are unused
}

export interface RequestOptions {
  params?: Record<string, string>;
  headers?: any;
  observe?: 'body' | 'response';
  retry?: {
    count: number;
    delay: number;
  };
  silent?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: ApiError) => void;
  onComplete?: () => void;
}
