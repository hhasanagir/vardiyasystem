import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type { ProcurementRequest, ProcurementOrder } from '../models/procurement.models';

@Injectable({ providedIn: 'root' })
export class ProcurementService {
  private readonly api = inject(ApiService);
  private readonly _requests = signal<ProcurementRequest[]>([]);
  private readonly _orders = signal<ProcurementOrder[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly requests = computed(() => this._requests());
  readonly orders = computed(() => this._orders());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getRequests(): Observable<ProcurementRequest[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ProcurementRequest[]>('/procurement/requests').pipe(
      tap((d) => this._requests.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Talepler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createRequest(data: Partial<ProcurementRequest>): Observable<ProcurementRequest> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<ProcurementRequest>('/procurement/requests', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Talep oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getOrders(): Observable<ProcurementOrder[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ProcurementOrder[]>('/procurement/orders').pipe(
      tap((d) => this._orders.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Siparişler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createOrder(data: Partial<ProcurementOrder>): Observable<ProcurementOrder> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<ProcurementOrder>('/procurement/orders', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Sipariş oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
