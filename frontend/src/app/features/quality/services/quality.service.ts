import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { QualityRecord, QualityAction } from '../models/quality.models';

@Injectable({ providedIn: 'root' })
export class QualityService {
  private readonly api = inject(ApiService);
  private readonly _records = signal<QualityRecord[]>([]);
  private readonly _selectedRecord = signal<QualityRecord | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly records = computed(() => this._records());
  readonly selectedRecord = computed(() => this._selectedRecord());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getRecords(): Observable<QualityRecord[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<QualityRecord[]>('/quality/records').pipe(
      tap((d) => this._records.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Kalite kayıtları yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getRecord(id: string): Observable<QualityRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<QualityRecord>(`/quality/records/${id}`).pipe(
      tap((d) => this._selectedRecord.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Kalite kaydı yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createRecord(data: Partial<QualityRecord>): Observable<QualityRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<QualityRecord>('/quality/records', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Kalite kaydı oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateRecord(id: string, data: Partial<QualityRecord>): Observable<QualityRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.patch<QualityRecord>(`/quality/records/${id}`, data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Kalite kaydı güncellenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  addAction(recordId: string, action: Partial<QualityAction>): Observable<QualityAction> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<QualityAction>(`/quality/records/${recordId}/actions`, action).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Aksiyon eklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
