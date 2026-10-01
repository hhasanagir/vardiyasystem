import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type {
  EnterpriseAsset,
  AssetDashboard,
  AssetDetail,
  QRCodeResult,
  WarrantyStatus,
  AssetDocument,
  AssetMovement,
} from '../models/asset.models';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly api = inject(ApiService);
  private readonly _assets = signal<EnterpriseAsset[]>([]);
  private readonly _selectedAsset = signal<AssetDetail | null>(null);
  private readonly _dashboard = signal<AssetDashboard | null>(null);
  private readonly _warranty = signal<WarrantyStatus | null>(null);
  private readonly _qrResult = signal<QRCodeResult | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly assets = computed(() => this._assets());
  readonly selectedAsset = computed(() => this._selectedAsset());
  readonly dashboard = computed(() => this._dashboard());
  readonly warranty = computed(() => this._warranty());
  readonly qrResult = computed(() => this._qrResult());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getAssets(filters?: {
    category?: string;
    status?: string;
    unitId?: string;
    departmentId?: string;
    search?: string;
  }): Observable<EnterpriseAsset[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.unitId) params.set('unitId', filters.unitId);
    if (filters?.departmentId) params.set('departmentId', filters.departmentId);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    return this.api.get<EnterpriseAsset[]>(`/assets${qs ? '?' + qs : ''}`).pipe(
      tap((d) => this._assets.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Varlıklar yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getDashboard(): Observable<AssetDashboard> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<AssetDashboard>('/assets/dashboard').pipe(
      tap((d) => this._dashboard.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Dashboard yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getAsset(id: string): Observable<EnterpriseAsset> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<EnterpriseAsset>(`/assets/${id}`).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Varlık yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getAssetDetail(id: string): Observable<AssetDetail> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<AssetDetail>(`/assets/${id}/detail`).pipe(
      tap((d) => this._selectedAsset.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Varlık detayı yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  generateQR(id: string): Observable<QRCodeResult> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<QRCodeResult>(`/assets/${id}/qr`).pipe(
      tap((d) => this._qrResult.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'QR kod oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getWarrantyStatus(): Observable<WarrantyStatus> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<WarrantyStatus>('/assets/warranty-status').pipe(
      tap((d) => this._warranty.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Garanti durumu yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getDocuments(assetId: string): Observable<AssetDocument[]> {
    return this.api.get<AssetDocument[]>(`/assets/${assetId}/documents`);
  }

  getMovements(assetId: string): Observable<AssetMovement[]> {
    return this.api.get<AssetMovement[]>(`/assets/${assetId}/movements`);
  }

  createAsset(data: Partial<EnterpriseAsset>): Observable<EnterpriseAsset> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.post<EnterpriseAsset>('/assets', data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Varlık oluşturulamadı');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateAsset(id: string, data: Partial<EnterpriseAsset>): Observable<EnterpriseAsset> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.put<EnterpriseAsset>(`/assets/${id}`, data).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Varlık güncellenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  deleteAsset(id: string): Observable<void> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.delete<void>(`/assets/${id}`).pipe(
      catchError((err) => {
        this._error.set(err.message || 'Varlık silinemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
