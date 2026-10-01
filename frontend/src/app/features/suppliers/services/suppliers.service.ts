import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { Supplier } from '../models/supplier.models';

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly api = inject(ApiService);
  private readonly _suppliers = signal<Supplier[]>([]);
  private readonly _selectedSupplier = signal<Supplier | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly suppliers = computed(() => this._suppliers());
  readonly selectedSupplier = computed(() => this._selectedSupplier());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getSuppliers(): Observable<Supplier[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<Supplier[]>('/suppliers').pipe(
      tap((d) => this._suppliers.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Tedarikçiler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getSupplier(id: string): Observable<Supplier> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<Supplier>(`/suppliers/${id}`).pipe(
      tap((d) => this._selectedSupplier.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Tedarikçi yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createSupplier(data: Partial<Supplier>): Observable<Supplier> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<Supplier>('/suppliers', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Tedarikçi oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateSupplier(id: string, data: Partial<Supplier>): Observable<Supplier> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.put<Supplier>(`/suppliers/${id}`, data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Tedarikçi güncellenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
