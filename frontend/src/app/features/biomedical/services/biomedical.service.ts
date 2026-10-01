import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { MaintenanceRecord, MaintenanceDashboard } from '../models/biomedical.models';

@Injectable({ providedIn: 'root' })
export class BiomedicalService {
  private readonly api = inject(ApiService);
  private readonly _records = signal<MaintenanceRecord[]>([]);
  private readonly _selectedRecord = signal<MaintenanceRecord | null>(null);
  private readonly _dashboard = signal<MaintenanceDashboard | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly records = computed(() => this._records());
  readonly selectedRecord = computed(() => this._selectedRecord());
  readonly dashboard = computed(() => this._dashboard());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getMaintenanceList(): Observable<MaintenanceRecord[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<MaintenanceRecord[]>('/biomedical/maintenance').pipe(
      tap((d) => this._records.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Bakım kayıtları yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getMaintenance(id: string): Observable<MaintenanceRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<MaintenanceRecord>(`/biomedical/maintenance/${id}`).pipe(
      tap((d) => this._selectedRecord.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Bakım kaydı yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createMaintenance(data: Partial<MaintenanceRecord>): Observable<MaintenanceRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<MaintenanceRecord>('/biomedical/maintenance', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Bakım kaydı oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateMaintenance(id: string, data: Partial<MaintenanceRecord>): Observable<MaintenanceRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.put<MaintenanceRecord>(`/biomedical/maintenance/${id}`, data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Bakım kaydı güncellenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
