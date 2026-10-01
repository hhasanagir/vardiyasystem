import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map, catchError, throwError, shareReplay, finalize } from 'rxjs';
import { ApiService } from '../api/api.service';
import { NotificationService } from '../../services/notification.service';
import type { UnitType } from '../../domain/enums';

export interface Device {
  id: string;
  code: string;
  name: string;
  block?: string;
  manufacturer?: string;
  model?: string;
  mode: 'vardiya' | 'polyclinic';
  tripleShift: boolean;
  isActive: boolean;
  unit: UnitType;
  requiredSkills?: string[];
  workDays?: number[];
  startHour?: number;
  endHour?: number;
  shiftTypes?: string[];
}

export interface DeviceListResponse {
  devices: Device[];
  total: number;
}

export interface DeviceApiError {
  code: string;
  message: string;
  unit?: UnitType;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceApiService {
  private readonly api = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly _cache = new Map<UnitType, Observable<Device[]>>();

  private readonly _isLoading = signal(false);
  private readonly _loadError = signal<DeviceApiError | null>(null);

  readonly isLoading = computed(() => this._isLoading());
  readonly loadError = computed(() => this._loadError());

  getDevicesForUnit(unit: UnitType): Observable<Device[]> {
    const cached = this._cache.get(unit);
    if (cached) return cached;

    this._isLoading.set(true);
    this._loadError.set(null);

    const obs = this.api.get<DeviceListResponse>(`/devices/unit/${unit}`).pipe(
      map(response => response.devices),
      catchError(err => {
        const error: DeviceApiError = {
          code: 'DEVICE_LOAD_ERROR',
          message: `Cihazlar yüklenemedi: ${unit}`,
          unit,
        };
        this._loadError.set(error);
        this.notification.error('Yükleme Hatası', error.message);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false)),
      shareReplay(1),
    );

    this._cache.set(unit, obs);
    return obs;
  }

  private readonly _devices = signal<Device[]>([]);
  private readonly _devicesByUnit = signal<Map<UnitType, Device[]>>(new Map());

  readonly devices = computed(() => this._devices());
  readonly devicesByUnit = computed(() => this._devicesByUnit());

  loadDevices(params?: { unit?: UnitType; isActive?: boolean }): Observable<DeviceListResponse> {
    this._isLoading.set(true);
    this._loadError.set(null);

    const queryParams: Record<string, string> = {};
    if (params?.unit) queryParams['unit'] = params.unit;
    if (params?.isActive !== undefined) queryParams['isActive'] = String(params.isActive);

    return this.api.get<DeviceListResponse>('/devices', { params: queryParams }).pipe(
      tap(response => {
        if (response) {
          this._devices.set(response.devices);
          this.updateDevicesByUnit(response.devices);
        }
      }),
      catchError(err => {
        const message = err.message || 'Cihazlar yüklenemedi';
        this._loadError.set({ code: 'DEVICE_LOAD_ERROR', message, unit: params?.unit });
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => ({ devices: [], total: 0 }));
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  private updateDevicesByUnit(devices: Device[]): void {
    const byUnit = new Map<UnitType, Device[]>();
    for (const device of devices) {
      const existing = byUnit.get(device.unit) || [];
      existing.push(device);
      byUnit.set(device.unit, existing);
    }
    this._devicesByUnit.set(byUnit);
  }

  clearCache(): void {
    this._cache.clear();
    this._devices.set([]);
    this._devicesByUnit.set(new Map());
    this._loadError.set(null);
  }

  retry(unit?: UnitType): void {
    this._cache.delete(unit ?? ('' as UnitType));
    this._loadError.set(null);
  }
}
