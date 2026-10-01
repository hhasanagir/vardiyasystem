import { Injectable, signal, computed } from '@angular/core';
import type {
  Schedule,
  AssignmentDTO,
  ValidationResult,
  FairnessResult,
  ConflictDTO,
  ScheduleStatus,
  ScheduleError,
} from '../models';

export type ScheduleTab =
  | 'grid'
  | 'conflicts'
  | 'validation'
  | 'fairness'
  | 'coverage'
  | 'versions'
  | 'approval';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface VersionConflictState {
  active: boolean;
  localVersion: number;
  serverVersion: number;
  scheduleId: string;
}

interface ScheduleState {
  schedule: Schedule | null;
  validationResult: ValidationResult | null;
  fairnessResult: FairnessResult | null;
  conflicts: ConflictDTO[];
  loading: boolean;
  error: string | null;
  activeError: ScheduleError | null;
  activeTab: ScheduleTab;
  selectedAssignmentId: string | null;
  selectedCellDate: string | null;
  filterPersonnelId: string | null;
  filterDeviceId: string | null;
  searchTerm: string;
  dirty: boolean;
  generating: boolean;
  generatingProgress: number;
  publishing: boolean;
  connectionState: ConnectionState;
  versionConflict: VersionConflictState;
}

@Injectable({ providedIn: 'root' })
export class ScheduleStore {
  private readonly state = signal<ScheduleState>({
    schedule: null,
    validationResult: null,
    fairnessResult: null,
    conflicts: [],
    loading: false,
    error: null,
    activeError: null,
    activeTab: 'grid',
    selectedAssignmentId: null,
    selectedCellDate: null,
    filterPersonnelId: null,
    filterDeviceId: null,
    searchTerm: '',
    dirty: false,
    generating: false,
    generatingProgress: 0,
    publishing: false,
    connectionState: 'disconnected',
    versionConflict: { active: false, localVersion: 0, serverVersion: 0, scheduleId: '' },
  });

  readonly schedule = computed(() => this.state().schedule);
  readonly validationResult = computed(() => this.state().validationResult);
  readonly fairnessResult = computed(() => this.state().fairnessResult);
  readonly conflicts = computed(() => this.state().conflicts);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly activeError = computed(() => this.state().activeError);
  readonly activeTab = computed(() => this.state().activeTab);
  readonly selectedAssignmentId = computed(() => this.state().selectedAssignmentId);
  readonly selectedCellDate = computed(() => this.state().selectedCellDate);
  readonly filterPersonnelId = computed(() => this.state().filterPersonnelId);
  readonly filterDeviceId = computed(() => this.state().filterDeviceId);
  readonly searchTerm = computed(() => this.state().searchTerm);
  readonly dirty = computed(() => this.state().dirty);
  readonly generating = computed(() => this.state().generating);
  readonly generatingProgress = computed(() => this.state().generatingProgress);
  readonly publishing = computed(() => this.state().publishing);
  readonly connectionState = computed(() => this.state().connectionState);
  readonly versionConflict = computed(() => this.state().versionConflict);

  readonly scheduleId = computed(() => this.state().schedule?.id ?? null);
  readonly status = computed(() => this.state().schedule?.status ?? null);
  readonly version = computed(() => this.state().schedule?.version ?? 0);
  readonly assignments = computed(() => this.state().schedule?.assignments ?? []);
  readonly isEditable = computed(() => {
    const s = this.state().schedule?.status;
    return s === 'draft' || s === 'rejected' || s === 'generated' || s === 'validated';
  });
  readonly isPublished = computed(() => {
    const s = this.state().schedule?.status;
    return s === 'published' || s === 'archived';
  });
  readonly approvalData = computed(() => this.state().schedule?.approvalData ?? null);

  readonly assignmentCount = computed(() => this.assignments().length);

  readonly hardViolationCount = computed(() => {
    return this.state().validationResult?.hardViolations.total ?? 0;
  });
  readonly softViolationCount = computed(() => {
    return this.state().validationResult?.softViolations.total ?? 0;
  });
  readonly coveragePercent = computed(() => {
    return this.state().validationResult?.coverage.coveragePercent ?? 0;
  });
  readonly fairnessScore = computed(() => {
    return (
      this.state().validationResult?.fairness.overallScore ??
      this.state().fairnessResult?.overallScore ??
      0
    );
  });
  readonly overallScore = computed(() => {
    return this.state().validationResult?.score.overall ?? 0;
  });

  readonly scheduleScore = computed(() => {
    const v = this.state().validationResult;
    if (!v) return null;
    return {
      overall: v.score.overall,
      coverage: v.coverage.coveragePercent,
      fairness: v.fairness.overallScore,
      hardViolations: v.hardViolations.total,
      softViolations: v.softViolations.total,
    };
  });

  readonly filteredAssignments = computed(() => {
    let list = this.assignments();
    const fp = this.state().filterPersonnelId;
    const fd = this.state().filterDeviceId;
    const term = this.state().searchTerm.toLowerCase();
    if (fp) list = list.filter((a) => a.personnelId === fp);
    if (fd) list = list.filter((a) => a.deviceId === fd);
    if (term) {
      list = list.filter(
        (a) =>
          (a.personnelName ?? '').toLowerCase().includes(term) ||
          (a.deviceCode ?? '').toLowerCase().includes(term) ||
          a.shiftType.toLowerCase().includes(term),
      );
    }
    return list;
  });

  readonly uniquePersonnel = computed(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const a of this.assignments()) {
      if (!map.has(a.personnelId)) {
        map.set(a.personnelId, { id: a.personnelId, name: a.personnelName ?? a.personnelId });
      }
    }
    return Array.from(map.values());
  });

  readonly uniqueDevices = computed(() => {
    const map = new Map<string, { id: string; code: string }>();
    for (const a of this.assignments()) {
      if (a.deviceId && !map.has(a.deviceId)) {
        map.set(a.deviceId, { id: a.deviceId, code: a.deviceCode ?? a.deviceId });
      }
    }
    return Array.from(map.values());
  });

  readonly hasVersionConflict = computed(() => this.state().versionConflict.active);
  readonly isBusy = computed(
    () => this.state().generating || this.state().publishing || this.state().loading,
  );

  loadSchedule(schedule: Schedule): void {
    this.state.update((s) => ({
      ...s,
      schedule,
      loading: false,
      error: null,
      activeError: null,
      conflicts: [],
      validationResult: null,
      dirty: false,
    }));
  }

  loadSchedules(schedules: Schedule[]): void {
    if (schedules.length > 0) {
      this.loadSchedule(schedules[0]);
    }
  }

  setValidation(result: ValidationResult): void {
    this.state.update((s) => ({
      ...s,
      validationResult: result,
      conflicts: result.hardViolations.conflicts.concat(result.softViolations.warnings),
    }));
  }

  setFairness(result: FairnessResult): void {
    this.state.update((s) => ({ ...s, fairnessResult: result }));
  }

  setLoading(loading: boolean): void {
    this.state.update((s) => ({ ...s, loading }));
  }

  setError(error: string | null): void {
    this.state.update((s) => ({ ...s, error, activeError: null, loading: false }));
  }

  setActiveError(err: ScheduleError | null): void {
    this.state.update((s) => ({
      ...s,
      activeError: err,
      error: err ? err.userMessage : null,
      loading: false,
    }));
  }

  setActiveTab(tab: ScheduleTab): void {
    this.state.update((s) => ({ ...s, activeTab: tab }));
  }

  selectAssignment(assignmentId: string | null): void {
    this.state.update((s) => ({ ...s, selectedAssignmentId: assignmentId }));
  }

  selectCell(date: string | null): void {
    this.state.update((s) => ({ ...s, selectedCellDate: date }));
  }

  setFilterPersonnel(personnelId: string | null): void {
    this.state.update((s) => ({ ...s, filterPersonnelId: personnelId }));
  }

  setFilterDevice(deviceId: string | null): void {
    this.state.update((s) => ({ ...s, filterDeviceId: deviceId }));
  }

  setSearchTerm(term: string): void {
    this.state.update((s) => ({ ...s, searchTerm: term }));
  }

  clearSelection(): void {
    this.state.update((s) => ({ ...s, selectedAssignmentId: null, selectedCellDate: null }));
  }

  setDirty(dirty: boolean): void {
    this.state.update((s) => ({ ...s, dirty }));
  }

  setGenerating(generating: boolean, progress = 0): void {
    this.state.update((s) => ({ ...s, generating, generatingProgress: progress }));
  }

  setGeneratingProgress(progress: number): void {
    this.state.update((s) => ({ ...s, generatingProgress: progress }));
  }

  setPublishing(publishing: boolean): void {
    this.state.update((s) => ({ ...s, publishing }));
  }

  setConnectionState(conn: ConnectionState): void {
    this.state.update((s) => ({ ...s, connectionState: conn }));
  }

  triggerVersionConflict(localVersion: number, serverVersion: number, scheduleId: string): void {
    this.state.update((s) => ({
      ...s,
      versionConflict: { active: true, localVersion, serverVersion, scheduleId },
    }));
  }

  resolveVersionConflict(): void {
    this.state.update((s) => ({
      ...s,
      versionConflict: { active: false, localVersion: 0, serverVersion: 0, scheduleId: '' },
    }));
  }

  clearAll(): void {
    this.state.set({
      schedule: null,
      validationResult: null,
      fairnessResult: null,
      conflicts: [],
      loading: false,
      error: null,
      activeError: null,
      activeTab: 'grid',
      selectedAssignmentId: null,
      selectedCellDate: null,
      filterPersonnelId: null,
      filterDeviceId: null,
      searchTerm: '',
      dirty: false,
      generating: false,
      generatingProgress: 0,
      publishing: false,
      connectionState: 'disconnected',
      versionConflict: { active: false, localVersion: 0, serverVersion: 0, scheduleId: '' },
    });
  }
}
