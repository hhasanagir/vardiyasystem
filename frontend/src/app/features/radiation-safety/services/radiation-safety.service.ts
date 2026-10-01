import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import type {
  RadiationDosimeter,
  RadiationMeasurement,
  RadiationArea,
} from '../models/radiation.models';

@Injectable({ providedIn: 'root' })
export class RadiationSafetyService {
  private readonly api = inject(ApiService);
  private readonly _dosimeters = signal<RadiationDosimeter[]>([]);
  private readonly _measurements = signal<RadiationMeasurement[]>([]);
  private readonly _areas = signal<RadiationArea[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly dosimeters = computed(() => this._dosimeters());
  readonly measurements = computed(() => this._measurements());
  readonly areas = computed(() => this._areas());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());

  getDosimeters(): Observable<RadiationDosimeter[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<RadiationDosimeter[]>('/radiation/dosimeters').pipe(
      tap((d) => this._dosimeters.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Dozimetreler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getMeasurements(): Observable<RadiationMeasurement[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<RadiationMeasurement[]>('/radiation/measurements').pipe(
      tap((d) => this._measurements.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Ölçümler yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getAreas(): Observable<RadiationArea[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api.get<RadiationArea[]>('/radiation/areas').pipe(
      tap((d) => this._areas.set(d)),
      catchError((err) => {
        this._error.set(err.message || 'Alanlar yüklenemedi');
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
