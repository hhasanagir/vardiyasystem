import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type {
  ConsumableCatalog,
  ConsumableStock,
  ConsumableTransaction,
} from '../models/consumable.models';

@Injectable({ providedIn: 'root' })
export class ConsumablesService {
  private readonly api = inject(ApiService);
  private readonly _catalog = signal<ConsumableCatalog[]>([]);
  private readonly _stock = signal<ConsumableStock[]>([]);
  private readonly _transactions = signal<ConsumableTransaction[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly catalog = computed(() => this._catalog());
  readonly stock = computed(() => this._stock());
  readonly transactions = computed(() => this._transactions());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getConsumables(): Observable<ConsumableCatalog[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ConsumableCatalog[]>('/consumables').pipe(
      tap((d) => this._catalog.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Sarf malzemeleri yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getConsumable(id: string): Observable<ConsumableCatalog> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ConsumableCatalog>(`/consumables/${id}`).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Sarf malzemesi yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createConsumable(data: Partial<ConsumableCatalog>): Observable<ConsumableCatalog> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<ConsumableCatalog>('/consumables', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Sarf malzemesi oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getStock(): Observable<ConsumableStock[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ConsumableStock[]>('/consumables/stock').pipe(
      tap((d) => this._stock.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Stok bilgileri yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getTransactions(): Observable<ConsumableTransaction[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<ConsumableTransaction[]>('/consumables/transactions').pipe(
      tap((d) => this._transactions.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'İşlem geçmişi yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
