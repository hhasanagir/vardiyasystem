import { Injectable, signal, computed } from '@angular/core';
import type {
  UnitType,
  ShiftType,
  ScheduleStatus,
  GenerationStatus,
  Schedule,
  ShiftAssignment,
  Conflict,
  HeatmapMetrics,
  UnitMetrics,
} from '../../domain';
import { UnitTypeEnum, ScheduleStatusEnum, GenerationStatusEnum } from '../../domain/enums';
import { UNIT_CONFIG } from '../../domain/rules';

export { ScheduleStore, type PublishedSchedule } from './schedule.store';

@Injectable({ providedIn: 'root' })
export class MetricsStore {
  private readonly _metrics = signal<UnitMetrics>({
    activeMRDevices: 0,
    activeBTDevices: 0,
    activeRontgenDevices: 0,
    activeNukleerTipDevices: 0,
    onDutyPersonnel: 0,
    pendingRequests: 0,
    occupancyRate: 0,
    riskScore: 0,
  });

  private readonly _selectedHeatmapUnit = signal<UnitType>(UnitTypeEnum.MR);
  private readonly _heatmapMetrics = signal<Map<UnitType, HeatmapMetrics>>(new Map());

  readonly metrics = this._metrics.asReadonly();
  readonly selectedHeatmapUnit = this._selectedHeatmapUnit.asReadonly();
  readonly heatmapMetrics = this._heatmapMetrics.asReadonly();

  readonly currentHeatmapMetrics = computed(() => {
    const unit = this._selectedHeatmapUnit();
    return (
      this._heatmapMetrics().get(unit) || {
        active: 0,
        idle: 0,
        maintenance: 0,
        critical: 0,
        occupancyRate: 0,
      }
    );
  });

  setMetrics(metrics: UnitMetrics): void {
    this._metrics.set(metrics);
  }

  setSelectedHeatmapUnit(unit: UnitType): void {
    this._selectedHeatmapUnit.set(unit);
  }

  setHeatmapMetrics(unit: UnitType, metrics: HeatmapMetrics): void {
    const map = new Map(this._heatmapMetrics());
    map.set(unit, metrics);
    this._heatmapMetrics.set(map);
  }

  updateMetrics(partial: Partial<UnitMetrics>): void {
    this._metrics.update((current) => ({ ...current, ...partial }));
  }
}

@Injectable({ providedIn: 'root' })
export class UnitStore {
  private readonly _selectedUnit = signal<UnitType>(UnitTypeEnum.MR);
  private readonly _availableUnits = signal<UnitType[]>([
    UnitTypeEnum.MR,
    UnitTypeEnum.BT,
    UnitTypeEnum.RONTGEN,
    UnitTypeEnum.NUKLEER,
  ]);

  readonly selectedUnit = this._selectedUnit.asReadonly();
  readonly availableUnits = this._availableUnits.asReadonly();

  readonly currentUnitConfig = computed(() => {
    return UNIT_CONFIG[this._selectedUnit()];
  });

  setSelectedUnit(unit: UnitType): void {
    this._selectedUnit.set(unit);
  }

  getUnitConfig(unit: UnitType) {
    return UNIT_CONFIG[unit];
  }
}

@Injectable({ providedIn: 'root' })
export class PersistenceStore {
  private readonly _isOnline = signal(navigator.onLine);
  private readonly _lastSync = signal<Date | null>(null);
  private readonly _pendingChanges = signal<number>(0);

  readonly isOnline = this._isOnline.asReadonly();
  readonly lastSync = this._lastSync.asReadonly();
  readonly pendingChanges = this._pendingChanges.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._isOnline.set(true));
    window.addEventListener('offline', () => this._isOnline.set(false));
  }

  markSynced(): void {
    this._lastSync.set(new Date());
    this._pendingChanges.set(0);
  }

  addPendingChange(): void {
    this._pendingChanges.update((n) => n + 1);
  }

  saveToLocalStorage(key: string, data: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      console.error('Failed to save to localStorage');
    }
  }

  loadFromLocalStorage<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
