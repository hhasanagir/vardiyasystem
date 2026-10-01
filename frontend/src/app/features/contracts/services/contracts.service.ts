import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { ServiceContract } from '../models/contract.models';

@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly api = inject(ApiService);
  private readonly _contracts = signal<ServiceContract[]>([]);
  private readonly _selectedContract = signal<ServiceContract | null>(null);
  private readonly _expiringContracts = signal<ServiceContract[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly contracts = computed(() => this._contracts());
  readonly selectedContract = computed(() => this._selectedContract());
  readonly expiringContracts = computed(() => this._expiringContracts());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getContracts(): Observable<ServiceContract[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ServiceContract[]>('/contracts').pipe(
      tap((d) => this._contracts.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Sözleşmeler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getContract(id: string): Observable<ServiceContract> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ServiceContract>(`/contracts/${id}`).pipe(
      tap((d) => this._selectedContract.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Sözleşme yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createContract(data: Partial<ServiceContract>): Observable<ServiceContract> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<ServiceContract>('/contracts', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Sözleşme oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateContract(id: string, data: Partial<ServiceContract>): Observable<ServiceContract> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.put<ServiceContract>(`/contracts/${id}`, data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Sözleşme güncellenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getExpiringContracts(): Observable<ServiceContract[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ServiceContract[]>('/contracts/expiring').pipe(
      tap((d) => this._expiringContracts.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Sona eren sözleşmeler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
