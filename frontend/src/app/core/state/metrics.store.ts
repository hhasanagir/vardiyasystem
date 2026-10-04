import { Injectable, signal, computed, effect } from '@angular/core';
import {
  UnitType,
  UnitMetrics,
  HeatmapMetrics,
  Conflict,
  Device,
  ShiftAssignment,
} from './state.models';

interface DashboardMetrics {
  activeMRDevices: number;
  activeBTDevices: number;
  activeRontgenDevices: number;
  activeNukleerTipDevices: number;
  activeOnkolojiDevices: number;
  onDutyPersonnel: number;
  pendingRequests: number;
  occupancyRate: number;
  riskScore: number;
}

@Injectable({
  providedIn: 'root',
})
export class MetricsStore {
  private readonly _metrics = signal<DashboardMetrics>({
    activeMRDevices: 7,
    activeBTDevices: 6,
    activeRontgenDevices: 18,
    activeNukleerTipDevices: 5,
    activeOnkolojiDevices: 4,
    onDutyPersonnel: 0,
    pendingRequests: 0,
    occupancyRate: 0,
    riskScore: 0,
  });

  private readonly _pendingSwaps = signal<number>(0);
  private readonly _criticalAlerts = signal<Conflict[]>([]);
  private readonly _selectedHeatmapUnit = signal<UnitType>('mr');

  private readonly _devices = signal<Device[]>([]);
  private readonly _assignments = signal<ShiftAssignment[]>([]);
  private readonly _isLoading = signal<boolean>(false);

  readonly metrics = computed(() => this._metrics());
  readonly pendingSwaps = computed(() => this._pendingSwaps());
  readonly criticalAlerts = computed(() => this._criticalAlerts());
  readonly selectedHeatmapUnit = computed(() => this._selectedHeatmapUnit());
  readonly devices = computed(() => this._devices());
  readonly assignments = computed(() => this._assignments());
  readonly isLoading = computed(() => this._isLoading());

  readonly activeMRDevices = computed(() => this._metrics().activeMRDevices);
  readonly activeBTDevices = computed(() => this._metrics().activeBTDevices);
  readonly activeRontgenDevices = computed(() => this._metrics().activeRontgenDevices);
  readonly activeNukleerTipDevices = computed(() => this._metrics().activeNukleerTipDevices);
  readonly activeOnkolojiDevices = computed(() => this._metrics().activeOnkolojiDevices);
  readonly onDutyPersonnel = computed(() => this._metrics().onDutyPersonnel);
  readonly pendingRequests = computed(() => this._metrics().pendingRequests);
  readonly occupancyRate = computed(() => this._metrics().occupancyRate);
  readonly riskScore = computed(() => this._metrics().riskScore);

  readonly totalActiveDevices = computed(() => {
    const m = this._metrics();
    return (
      m.activeMRDevices +
      m.activeBTDevices +
      m.activeRontgenDevices +
      m.activeNukleerTipDevices +
      m.activeOnkolojiDevices
    );
  });

  readonly criticalAlertsCount = computed(() => this._criticalAlerts().length);

  readonly heatmapMetrics = computed((): Record<UnitType, HeatmapMetrics> => {
    const devices = this._devices();
    const assignments = this._assignments();
    const today = new Date().toISOString().split('T')[0];

    const result: Record<UnitType, HeatmapMetrics> = {
      mr: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
      bt: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
      rontgen: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
      nukleer: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
      onkoloji: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
      supervizor: { active: 0, idle: 0, maintenance: 0, critical: 0, occupancyRate: 0 },
    };

    for (const unit of ['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji', 'supervizor'] as UnitType[]) {
      const unitDevices = devices.filter((d) => d.unit === unit && d.isActive);
      const todayAssignments = assignments.filter(
        (a) => a.date === today && unitDevices.some((d) => d.id === a.deviceId),
      );

      const occupiedDevices = new Set(todayAssignments.map((a) => a.deviceId));
      const criticalCount =
        todayAssignments.length < unitDevices.length ? Math.ceil(unitDevices.length * 0.2) : 0;

      const totalOccupancy = todayAssignments.length;
      const maxOccupancy = unitDevices.length * 2;
      const occupancyRate =
        maxOccupancy > 0 ? Math.round((totalOccupancy / maxOccupancy) * 100) : 0;

      result[unit] = {
        active: Math.max(0, unitDevices.length - criticalCount),
        idle: Math.max(0, unitDevices.length - occupiedDevices.size),
        maintenance: 0,
        critical: criticalCount,
        occupancyRate,
      };
    }

    return result;
  });

  readonly currentHeatmapMetrics = computed(() => {
    return this.heatmapMetrics()[this._selectedHeatmapUnit()];
  });

  updateMetrics(updates: Partial<DashboardMetrics>): void {
    this._metrics.update((m) => ({ ...m, ...updates }));
  }

  setMetrics(metrics: DashboardMetrics): void {
    this._metrics.set(metrics);
  }

  setPendingSwaps(count: number): void {
    this._pendingSwaps.set(count);
  }

  setCriticalAlerts(alerts: Conflict[]): void {
    this._criticalAlerts.set(alerts);
  }

  setSelectedHeatmapUnit(unit: UnitType): void {
    this._selectedHeatmapUnit.set(unit);
  }

  setDevices(devices: Device[]): void {
    this._devices.set(devices);
  }

  setAssignments(assignments: ShiftAssignment[]): void {
    this._assignments.set(assignments);
  }

  setLoading(loading: boolean): void {
    this._isLoading.set(loading);
  }

  addAssignment(assignment: ShiftAssignment): void {
    this._assignments.update((a) => [...a, assignment]);
  }

  removeAssignment(assignmentId: string): void {
    this._assignments.update((a) => a.filter((assign) => assign.id !== assignmentId));
  }

  updateAssignment(assignment: ShiftAssignment): void {
    this._assignments.update((a) =>
      a.map((existing) => (existing.id === assignment.id ? assignment : existing)),
    );
  }

  getDevicesByUnit(unit: UnitType): Device[] {
    return this._devices().filter((d) => d.unit === unit);
  }

  getActiveDevicesByUnit(unit: UnitType): Device[] {
    return this._devices().filter((d) => d.unit === unit && d.isActive);
  }

  getAssignmentsByDevice(deviceId: string): ShiftAssignment[] {
    return this._assignments().filter((a) => a.deviceId === deviceId);
  }

  getAssignmentsByDate(date: string): ShiftAssignment[] {
    return this._assignments().filter((a) => a.date === date);
  }

  calculateOccupancyRate(devices: Device[], assignments: ShiftAssignment[], date: string): number {
    const activeDevices = devices.filter((d) => d.isActive);
    const dayAssignments = assignments.filter((a) => a.date === date);

    if (activeDevices.length === 0) return 0;

    const maxShifts = activeDevices.reduce((sum, d) => sum + (d.mode === 'vardiya' ? 2 : 1), 0);
    const actualShifts = dayAssignments.length;

    return maxShifts > 0 ? Math.round((actualShifts / maxShifts) * 100) : 0;
  }

  calculateRiskScore(metrics: DashboardMetrics): number {
    let score = 0;

    if (metrics.occupancyRate > 90) score += 30;
    else if (metrics.occupancyRate > 75) score += 15;

    if (metrics.pendingRequests > 5) score += 25;
    else if (metrics.pendingRequests > 2) score += 10;

    if (metrics.onDutyPersonnel < 10) score += 20;
    else if (metrics.onDutyPersonnel < 15) score += 10;

    return Math.min(100, score);
  }

  clearMetrics(): void {
    this._metrics.set({
      activeMRDevices: 0,
      activeBTDevices: 0,
      activeRontgenDevices: 0,
      activeNukleerTipDevices: 0,
      activeOnkolojiDevices: 0,
      onDutyPersonnel: 0,
      pendingRequests: 0,
      occupancyRate: 0,
      riskScore: 0,
    });
    this._criticalAlerts.set([]);
    this._pendingSwaps.set(0);
  }
}
