import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import type {
  UnitType,
  Schedule,
  ShiftAssignment,
  Conflict,
  ValidationResult,
  FairnessMetrics,
  GenerationStatus,
  HeatmapMetrics,
  Personnel,
  ScheduleStatus,
} from '../../domain';
import { ShiftTypeEnum, type ShiftType } from '../../domain/enums';
import { DeviceApiService, type Device } from '../api/device-api.service';

interface ScheduleState {
  selectedMonth: number;
  selectedYear: number;
  selectedUnit: UnitType;
  schedules: Map<string, Schedule>;
  conflicts: Conflict[];
  validation: ValidationResult | null;
  fairness: FairnessMetrics | null;
  status: GenerationStatus;
  lastError: string | null;
  lastUpdated: Date | null;
}

export interface PublishedSchedule {
  unit: UnitType;
  month: number;
  year: number;
  assignments: ShiftAssignment[];
  publishedAt: Date;
  publishedBy: string;
}

@Injectable({
  providedIn: 'root',
})
export class ScheduleStore {
  // The month/year a user navigated to is part of their working context; the
  // store already serialised it (toJSON) but nothing ever restored it, so a
  // reload always snapped back to the current month.
  private static readonly UI_MONTH_KEY = 'vardiyasystem.ui.month';

  private readonly deviceApi = inject(DeviceApiService);
  private readonly state = signal<ScheduleState>({
    selectedMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
    selectedUnit: 'mr',
    schedules: new Map(),
    conflicts: [],
    validation: null,
    fairness: null,
    status: 'idle',
    lastError: null,
    lastUpdated: null,
  });

  constructor() {
    const stored = ScheduleStore.readUiMonth();
    if (stored) {
      this.state.update((s) => ({ ...s, ...stored }));
    }
  }

  private static readUiMonth(): { selectedMonth: number; selectedYear: number } | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(ScheduleStore.UI_MONTH_KEY);
      if (!raw) return null;
      const ui = JSON.parse(raw) as { selectedMonth?: number; selectedYear?: number };
      if (typeof ui.selectedMonth === 'number' && typeof ui.selectedYear === 'number') {
        return { selectedMonth: ui.selectedMonth, selectedYear: ui.selectedYear };
      }
      return null;
    } catch {
      return null;
    }
  }

  private static writeUiMonth(selectedMonth: number, selectedYear: number): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        ScheduleStore.UI_MONTH_KEY,
        JSON.stringify({ selectedMonth, selectedYear }),
      );
    } catch {
      // best-effort persistence
    }
  }

  readonly selectedMonth = computed(() => this.state().selectedMonth);
  readonly selectedYear = computed(() => this.state().selectedYear);
  readonly selectedUnit = computed(() => this.state().selectedUnit);
  readonly conflicts = computed(() => this.state().conflicts);
  readonly validation = computed(() => this.state().validation);
  readonly fairness = computed(() => this.state().fairness);
  readonly status = computed(() => this.state().status);
  readonly lastError = computed(() => this.state().lastError);
  readonly lastUpdated = computed(() => this.state().lastUpdated);

  readonly currentSchedule = computed(() => {
    const { selectedUnit, selectedMonth, selectedYear, schedules } = this.state();
    const key = this.getScheduleKey(selectedUnit, selectedYear, selectedMonth);
    return schedules.get(key) || null;
  });

  readonly scheduleKey = computed(() => {
    const { selectedUnit, selectedMonth, selectedYear } = this.state();
    return this.getScheduleKey(selectedUnit, selectedYear, selectedMonth);
  });

  readonly assignments = computed(() => {
    return this.currentSchedule()?.assignments || [];
  });

  readonly schedules = computed(() => {
    return Array.from(this.state().schedules.values());
  });

  readonly violationsCount = computed(() => {
    return this.conflicts().filter((c) => c.severity === 'critical' || c.severity === 'high')
      .length;
  });

  readonly criticalConflicts = computed(() => {
    return this.conflicts().filter((c) => c.severity === 'critical');
  });

  readonly isValid = computed(() => {
    return this.validation()?.isValid ?? true;
  });

  readonly validationScore = computed(() => {
    return this.validation()?.score ?? 100;
  });

  readonly fairnessScore = computed(() => {
    return this.fairness()?.overallScore ?? 0;
  });

  readonly isPublished = computed(() => {
    return this.currentSchedule()?.status === 'published';
  });

  private scheduleUpdated = new Subject<{ unit: UnitType; month: number; year: number }>();
  readonly scheduleUpdated$ = this.scheduleUpdated.asObservable();

  private schedulePublished = new Subject<PublishedSchedule>();
  readonly schedulePublished$ = this.schedulePublished.asObservable();

  private getScheduleKey(unit: UnitType, year: number, month: number): string {
    return `${unit}-${year}-${month}`;
  }

  getHeatmapMetrics(devices: Device[], assignments: ShiftAssignment[]): HeatmapMetrics {
    const activeDevices = devices.filter((d) => d.isActive);
    const today = new Date().toISOString().split('T')[0];
    const todayAssignments = assignments.filter((a) => a.date === today);

    const occupiedDevices = new Set(todayAssignments.map((a) => a.deviceId));
    const criticalDevices = activeDevices.filter((d) => {
      const dayAssignments = todayAssignments.filter((a) => a.deviceId === d.id);
      return d.mode === 'vardiya' && dayAssignments.length < 2;
    });

    const totalOccupancy = todayAssignments.length;
    const maxOccupancy = activeDevices.length * 2;
    const occupancyRate = maxOccupancy > 0 ? Math.round((totalOccupancy / maxOccupancy) * 100) : 0;

    return {
      active: activeDevices.length - criticalDevices.length,
      idle: Math.max(0, activeDevices.length - occupiedDevices.size),
      maintenance: activeDevices.length - activeDevices.filter((d) => d.isActive).length,
      critical: criticalDevices.length,
      occupancyRate,
    };
  }

  getAssignmentsForDate(date: string): ShiftAssignment[] {
    return this.assignments().filter((a) => a.date === date);
  }

  getAssignmentsForDevice(deviceId: string): ShiftAssignment[] {
    return this.assignments().filter((a) => a.deviceId === deviceId);
  }

  getAssignmentsForPersonnel(personnelId: string): ShiftAssignment[] {
    return this.assignments().filter((a) => a.personnelId === personnelId);
  }

  getAssignmentByType(deviceId: string, date: string, shiftType: string): ShiftAssignment | null {
    const assignments = this.getAssignmentsForDevice(deviceId);
    const normalizedShiftType = this.normalizeShiftType(shiftType);
    return (
      assignments.find(
        (a) => a.date === date && this.normalizeShiftType(a.shiftType) === normalizedShiftType,
      ) || null
    );
  }

  normalizeShiftType(type: string): ShiftType {
    const lower = type.toLowerCase();
    if (lower.includes('gündüz') || lower.includes('gunduz') || lower === 'day')
      return ShiftTypeEnum.DAY;
    if (lower.includes('akşam') || lower.includes('aksam') || lower === 'evening')
      return ShiftTypeEnum.EVENING;
    if (lower.includes('gece') || lower === 'night') return ShiftTypeEnum.NIGHT;
    return ShiftTypeEnum.DAY;
  }

  getPersonnelWorkload(personnelId: string): { total: number; night: number; weekend: number } {
    const assignments = this.getAssignmentsForPersonnel(personnelId);
    return {
      total: assignments.length,
      night: assignments.filter((a) => this.normalizeShiftType(a.shiftType) === ShiftTypeEnum.NIGHT)
        .length,
      weekend: assignments.filter((a) => {
        const day = new Date(a.date).getDay();
        return day === 0 || day === 6;
      }).length,
    };
  }

  setSelectedUnit(unit: UnitType): void {
    this.state.update((s) => ({ ...s, selectedUnit: unit }));
  }

  setSelectedMonth(month: number, year?: number): void {
    this.state.update((s) => ({
      ...s,
      selectedMonth: month,
      selectedYear: year ?? s.selectedYear,
    }));
    ScheduleStore.writeUiMonth(this.state().selectedMonth, this.state().selectedYear);
  }

  nextMonth(): void {
    let { selectedMonth, selectedYear } = this.state();
    if (selectedMonth === 12) {
      selectedMonth = 1;
      selectedYear++;
    } else {
      selectedMonth++;
    }
    this.setSelectedMonth(selectedMonth, selectedYear);
  }

  previousMonth(): void {
    let { selectedMonth, selectedYear } = this.state();
    if (selectedMonth === 1) {
      selectedMonth = 12;
      selectedYear--;
    } else {
      selectedMonth--;
    }
    this.setSelectedMonth(selectedMonth, selectedYear);
  }

  getMonthLabel(): string {
    const months = [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ];
    const { selectedMonth, selectedYear } = this.state();
    return `${months[selectedMonth - 1]} ${selectedYear}`;
  }

  readonly monthLabel = computed(() => this.getMonthLabel());

  setSchedule(schedule: Schedule): void {
    const key = this.getScheduleKey(schedule.unit, schedule.year, schedule.month);
    this.state.update((s) => {
      const newSchedules = new Map(s.schedules);
      newSchedules.set(key, schedule);
      return { ...s, schedules: newSchedules, lastUpdated: new Date() };
    });
    this.scheduleUpdated.next({ unit: schedule.unit, month: schedule.month, year: schedule.year });
  }

  updateAssignments(assignments: ShiftAssignment[]): void {
    const current = this.currentSchedule();
    const { selectedUnit, selectedMonth, selectedYear } = this.state();

    if (current) {
      this.setSchedule({
        ...current,
        assignments,
        version: current.version + 1,
        updatedAt: new Date(),
      });
    } else {
      const newSchedule: Schedule = {
        id: `schedule-${selectedUnit}-${selectedYear}-${selectedMonth}`,
        unit: selectedUnit,
        month: selectedMonth,
        year: selectedYear,
        assignments,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'draft',
      };
      this.setSchedule(newSchedule);
    }
  }

  addAssignment(assignment: ShiftAssignment): void {
    this.updateAssignments([...this.assignments(), assignment]);
  }

  removeAssignment(assignmentId: string): void {
    this.updateAssignments(this.assignments().filter((a) => a.id !== assignmentId));
  }

  setConflicts(conflicts: Conflict[]): void {
    this.state.update((s) => ({ ...s, conflicts }));
  }

  setValidation(validation: ValidationResult): void {
    this.state.update((s) => ({ ...s, validation }));
  }

  setFairness(fairness: FairnessMetrics): void {
    this.state.update((s) => ({ ...s, fairness }));
  }

  setStatus(status: GenerationStatus, error?: string): void {
    this.state.update((s) => ({
      ...s,
      status,
      lastError: error || null,
    }));
  }

  publish(publishedBy: string = 'system'): void {
    const current = this.currentSchedule();
    if (!current) return;

    const publishedSchedule: PublishedSchedule = {
      unit: current.unit,
      month: current.month,
      year: current.year,
      assignments: [...current.assignments],
      publishedAt: new Date(),
      publishedBy,
    };

    this.setSchedule({
      ...current,
      status: 'published',
      updatedAt: new Date(),
    });

    this.schedulePublished.next(publishedSchedule);
  }

  unpublish(): void {
    const current = this.currentSchedule();
    if (!current) return;

    this.setSchedule({
      ...current,
      status: 'draft',
      updatedAt: new Date(),
    });
  }

  loadFromScheduleStore(other: ScheduleStore): void {
    const schedule = other.currentSchedule();
    if (schedule) {
      this.setSchedule(schedule);
    }
  }

  clearSchedule(): void {
    this.state.update((s) => ({ ...s, schedules: new Map() }));
  }

  clearState(): void {
    this.state.set({
      selectedMonth: new Date().getMonth() + 1,
      selectedYear: new Date().getFullYear(),
      selectedUnit: 'mr',
      schedules: new Map(),
      conflicts: [],
      validation: null,
      fairness: null,
      status: 'idle',
      lastError: null,
      lastUpdated: null,
    });
  }

  toJSON(): Record<string, unknown> {
    const s = this.state();
    const schedulesObj: Record<string, Schedule> = {};
    s.schedules.forEach((v, k) => {
      schedulesObj[k] = v;
    });

    return {
      selectedMonth: s.selectedMonth,
      selectedYear: s.selectedYear,
      selectedUnit: s.selectedUnit,
      schedules: schedulesObj,
      conflicts: s.conflicts,
      validation: s.validation,
      fairness: s.fairness,
      lastUpdated: s.lastUpdated,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    const schedulesMap = new Map<string, Schedule>();
    const schedules = data['schedules'] as Record<string, Schedule>;
    if (schedules) {
      Object.entries(schedules).forEach(([k, v]) => schedulesMap.set(k, v));
    }

    this.state.set({
      selectedMonth: (data['selectedMonth'] as number) || new Date().getMonth() + 1,
      selectedYear: (data['selectedYear'] as number) || new Date().getFullYear(),
      selectedUnit: (data['selectedUnit'] as UnitType) || 'mr',
      schedules: schedulesMap,
      conflicts: (data['conflicts'] as Conflict[]) || [],
      validation: (data['validation'] as ValidationResult) || null,
      fairness: (data['fairness'] as FairnessMetrics) || null,
      status: 'idle',
      lastError: null,
      lastUpdated: (data['lastUpdated'] as Date) || null,
    });
  }

  getDevicesForUnit(unit: UnitType): Observable<Device[]> {
    return this.deviceApi.getDevicesForUnit(unit);
  }
}
