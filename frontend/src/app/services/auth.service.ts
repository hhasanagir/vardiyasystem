import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError, BehaviorSubject, from } from 'rxjs';
import { tap, catchError, filter, take } from 'rxjs/operators';
import { environment } from '../environments';
import { User, AuthResponse } from '../domain/models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = environment.apiUrl;
  private readonly TOKEN_KEY = 'accessToken';
  private readonly REFRESH_TOKEN_KEY = 'refreshToken';
  private readonly USER_KEY = 'user';

  private currentUser = signal<User | null>(null);
  private accessToken = signal<string | null>(null);
  private authInitialized = signal(false);

  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly REFRESH_MARGIN_SEC = 60;

  readonly user = this.currentUser.asReadonly();
  readonly token = this.accessToken.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser() && this.authInitialized());
  readonly isAdmin = computed(() => {
    const user = this.currentUser();
    return user?.role === 'hospital_admin' || user?.role === 'system_admin';
  });

  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  constructor() {
    this.initializeAuth();
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (event.key === this.TOKEN_KEY && !event.newValue) {
      this.clearAuth();
      this.router.navigate(['/login']);
    }
  }

  private initializeAuth(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadStoredAuth();
      this.authInitialized.set(true);
    }
  }

  private decodeToken(token: string): { exp: number } | null {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }

  private scheduleProactiveRefresh(token: string): void {
    this.clearRefreshTimer();
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) return;
    const delayMs = decoded.exp * 1000 - Date.now() - this.REFRESH_MARGIN_SEC * 1000;
    if (delayMs <= 0) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshToken().subscribe({ error: () => {} });
    }, delayMs);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private loadStoredAuth(): void {
    try {
      const token = localStorage.getItem(this.TOKEN_KEY);
      const userStr = localStorage.getItem(this.USER_KEY);

      if (token && userStr) {
        const user = JSON.parse(userStr) as User;
        this.accessToken.set(token);
        this.currentUser.set(user);
        this.scheduleProactiveRefresh(token);
      }
    } catch (e) {
      this.clearAuth();
    }
  }

  register(data: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
    role?: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, data).pipe(
      tap((response) => this.handleAuthResponse(response)),
      catchError(this.handleError.bind(this)),
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, {
        email: email.toLowerCase().trim(),
        password,
      })
      .pipe(
        tap((response) => {
          if (!response) {
            throw new Error('Empty auth response');
          }
          this.handleAuthResponse(response);
        }),
        catchError(this.handleError.bind(this)),
      );
  }

  logout(): void {
    this.clearAuth();
    const refreshToken = this.getRefreshToken();

    if (refreshToken) {
      this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken }).subscribe({
        error: () => console.error('[AUTH] Logout notification failed'),
      });
    }

    this.router.navigate(['/login']);
  }

  logoutAll(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/logout-all`, {}).pipe(
      tap(() => this.clearAuth()),
      catchError(() => {
        this.clearAuth();
        return throwError(() => new Error('Logout failed'));
      }),
    );
  }

  getToken(): string | null {
    return this.accessToken();
  }

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  refreshToken(): Observable<any> {
    const storedRefreshToken = this.getRefreshToken();

    if (!storedRefreshToken) {
      this.forceLogout();
      return throwError(() => new Error('No refresh token'));
    }

    if (this.isRefreshing) {
      return from(this.refreshTokenSubject.pipe(take(1)).toPromise()) as unknown as Observable<any>;
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/refresh`, {
        refreshToken: storedRefreshToken,
      })
      .pipe(
        tap({
          next: (response) => {
            this.handleAuthResponse(response);
            this.isRefreshing = false;
            this.refreshTokenSubject.next(response.accessToken);
          },
          error: (err) => {
            this.isRefreshing = false;
            this.refreshTokenSubject.next(null);
            this.forceLogout();
          },
        }),
        catchError((err) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(null);
          this.forceLogout();
          return throwError(() => err);
        }),
      );
  }

  forceLogout(): void {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  handle401Error(): Observable<any> {
    return this.refreshToken();
  }

  private handleAuthResponse(response: AuthResponse): void {
    if (!response || !response.accessToken || !response.user) {
      console.error('[AUTH] Invalid auth response structure — missing accessToken or user');
      throw new Error('Invalid auth response');
    }

    this.accessToken.set(response.accessToken);
    this.currentUser.set(response.user);
    this.scheduleProactiveRefresh(response.accessToken);

    try {
      localStorage.setItem(this.TOKEN_KEY, response.accessToken);
      localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
      localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    } catch {
      console.error('Failed to save to localStorage');
    }
  }

  private clearAuth(): void {
    this.clearRefreshTimer();
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.isRefreshing = false;

    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch {
      console.error('Failed to clear localStorage');
    }
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let message = 'Bir hata oluştu';

    if (error.status === 401) {
      message = 'Geçersiz e-posta veya şifre';
    } else if (error.status === 0) {
      message = 'Sunucuya bağlanılamıyor';
    } else if (error.status === 423) {
      message = 'Hesap kilitli. Lütfen daha sonra tekrar deneyin.';
    } else if (error.status === 409) {
      message = 'Bu e-posta adresi zaten kullanılmaktadır';
    } else if (error.error?.message) {
      message = error.error.message;
    }

    return throwError(() => new Error(message));
  }
}
