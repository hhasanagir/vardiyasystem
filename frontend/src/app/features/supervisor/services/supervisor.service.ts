import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { SupervisorDashboard } from '../models/supervisor.models';

@Injectable({ providedIn: 'root' })
export class SupervisorService {
  private readonly api = inject(ApiService);
  private readonly _data = signal<SupervisorDashboard | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly data = computed(() => this._data());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  loadDashboard(date?: string): Observable<SupervisorDashboard> {
    this._isLoading.set(true);
    this._error.set(null);

    const params = date ? { date } : undefined;
    return this.api.get<SupervisorDashboard>('/supervisor/dashboard', { params }).pipe(
      tap((d) => this._data.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Dashboard yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  refresh(): void {
    this._data.set(null);
    this.loadDashboard().subscribe();
  }
}
