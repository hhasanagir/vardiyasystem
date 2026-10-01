import { Injectable, inject, signal, computed } from '@angular/core';
import { catchError, finalize, Observable, tap, throwError } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { SupervisorCenterDashboard } from '../models/supervisor-center.models';

@Injectable({ providedIn: 'root' })
export class SupervisorCenterService {
  private readonly api = inject(ApiService);
  private readonly _data = signal<SupervisorCenterDashboard | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly data = computed(() => this._data());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  loadDashboard(date?: string): Observable<SupervisorCenterDashboard> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: Record<string, string> = {};
    if (date) params['date'] = date;
    return this.api.get<SupervisorCenterDashboard>('/supervisor-center/dashboard', { params }).pipe(
      tap((d) => this._data.set(d)),
      catchError((err) => {
        this._error.set(err?.message || 'Süpervizör Merkezi verileri yüklenemedi');
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
