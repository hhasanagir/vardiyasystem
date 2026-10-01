import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type {
  InventoryStock,
  InventoryTransfer,
  ConsumptionRecord,
  InventoryCount,
  WasteRecord,
  StockAlert,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly api = inject(ApiService);
  private readonly _stock = signal<InventoryStock[]>([]);
  private readonly _transfers = signal<InventoryTransfer[]>([]);
  private readonly _consumptions = signal<ConsumptionRecord[]>([]);
  private readonly _counts = signal<InventoryCount[]>([]);
  private readonly _waste = signal<WasteRecord[]>([]);
  private readonly _alerts = signal<StockAlert[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly stock = computed(() => this._stock());
  readonly transfers = computed(() => this._transfers());
  readonly consumptions = computed(() => this._consumptions());
  readonly counts = computed(() => this._counts());
  readonly waste = computed(() => this._waste());
  readonly alerts = computed(() => this._alerts());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getStock(warehouseId?: string): Observable<InventoryStock[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (warehouseId) params.warehouseId = warehouseId;
    return this.api.get<InventoryStock[]>('/inventory/stock', params).pipe(
      tap((d) => this._stock.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Stok bilgileri yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getTransfers(status?: string): Observable<InventoryTransfer[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (status) params.status = status;
    return this.api.get<InventoryTransfer[]>('/inventory/transfers', params).pipe(
      tap((d) => this._transfers.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Transferler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getConsumptions(catalogId?: string, assetId?: string): Observable<ConsumptionRecord[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (catalogId) params.catalogId = catalogId;
    if (assetId) params.assetId = assetId;
    return this.api.get<ConsumptionRecord[]>('/inventory/consumptions', params).pipe(
      tap((d) => this._consumptions.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Tüketim kayıtları yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getCounts(warehouseId?: string, status?: string): Observable<InventoryCount[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (warehouseId) params.warehouseId = warehouseId;
    if (status) params.status = status;
    return this.api.get<InventoryCount[]>('/inventory/counts', params).pipe(
      tap((d) => this._counts.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Sayaç verileri yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getWaste(wasteType?: string): Observable<WasteRecord[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (wasteType) params.wasteType = wasteType;
    return this.api.get<WasteRecord[]>('/inventory/waste', params).pipe(
      tap((d) => this._waste.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Atık kayıtları yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getAlerts(isResolved?: boolean): Observable<StockAlert[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: any = {};
    if (isResolved !== undefined) params.isResolved = isResolved;
    return this.api.get<StockAlert[]>('/inventory/alerts', params).pipe(
      tap((d) => this._alerts.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Uyarılar yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createConsumption(data: Partial<ConsumptionRecord>): Observable<ConsumptionRecord> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<ConsumptionRecord>('/inventory/consumptions', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Tüketim kaydı oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  resolveAlert(id: string, resolvedById: string): Observable<StockAlert> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<StockAlert>(`/inventory/alerts/${id}/resolve`, { resolvedById }).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Uyarı çözülemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
