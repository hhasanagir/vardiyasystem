import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map, catchError, of, finalize, throwError, EMPTY } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import { NotificationService } from './notification.service';
import { LoggerService } from '../core/logger.service';
import type { UnitType, ScheduleStatus } from '../domain/enums';
import type {
  Schedule,
  ShiftAssignment,
  PersonnelGroup,
  PersonShiftTemplate,
  PersonShiftAssignment,
  PersonShiftConfigGroup,
  PersonShiftsResponse,
  PersonShiftReportResponse,
} from '../domain/models';
import type { AuditQueryFilters, AuditTimelineResponse } from '../domain/models/audit-log';
import { translateAssignmentError } from '../core/utils/assignment-errors';

export interface ScheduledShift {
  id: string;
  date: string;
  shiftId: string;
  shift?: {
    id: string;
    name: string;
    type: 'day' | 'night' | 'evening';
    startTime: string;
    endTime: string;
    durationHours: number;
  };
  employeeId: string;
  employee?: {
    id: string;
    name: string;
    role: string;
  };
  organizationId: string;
  status?: string;
}

export interface DeviceShiftConfig {
  deviceId: string;
  shifts: Array<{
    id: string;
    type: string;
    startTime: string;
    endTime: string;
    name: string;
    personnelType: string | null;
    blockId: string | null;
    optionalOnWeekends: boolean;
    optionalOnHolidays: boolean;
    isMaster: boolean;
  }>;
}

export interface ShiftDateOverride {
  id: string;
  shiftId: string;
  date: string;
  isEnabled: boolean;
  shiftName?: string;
  deviceId?: string | null;
}

export interface ScheduleResponse {
  id: string | null;
  unit: UnitType;
  month: number;
  year: number;
  status: ScheduleStatus;
  version: number;
  devices: Array<{
    id: string;
    code: string;
    name: string;
    mode: string;
    blockCode?: string | null;
    isMaster?: boolean;
    workDays?: number[];
  }>;
  deviceShiftConfig?: DeviceShiftConfig[];
  personShiftConfig?: PersonShiftConfigGroup[];
  dateOverrides?: ShiftDateOverride[];
  assignments: ShiftAssignment[];
  personAssignments?: PersonShiftAssignment[];
  createdBy: { id: string; name: string; email: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
  workflow?: {
    submittedBy?: string;
    submittedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    publishedBy?: string;
    publishedAt?: string;
    rejectedBy?: string;
    rejectedAt?: string;
    rejectionReason?: string;
  } | null;
}

export interface ScheduleListResponse {
  schedules: ScheduleResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MyShift {
  id: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  deviceId: string;
  deviceName: string;
  deviceCode: string;
  isConfirmed: boolean;
}

export interface MyShiftsResponse {
  shifts: MyShift[];
  personnel: { id: string; name: string; role: string; unitId: string } | null;
  scheduleId?: string;
  unit?: string;
  unitName?: string;
  month: number;
  year: number;
  status: string;
}

export interface MySummaryResponse {
  today: MyShift | null;
  week: MyShift[];
  upcoming: MyShift[];
  summary: {
    totalShifts: number;
    totalHours: number;
    nightShifts: number;
    weekendShifts: number;
    overtimeHours: number;
  };
}

export interface MyDayTask {
  id: string;
  taskType: string;
  label: string;
  status: 'pending' | 'completed' | 'skipped';
  completedAt: string | null;
}

export interface MyDayIncident {
  id: string;
  issueType: string;
  severity: string;
  status: string;
  deviceName: string | null;
  deviceCode: string | null;
  unitName: string;
  reportedAt: string;
}

export interface MyDaySwapRequest {
  id: string;
  reason: string | null;
  createdAt: string;
}

export interface MyDayAttendance {
  status: string;
  clockIn: string | null;
  clockOut: string | null;
}

export interface MyDayDashboardResponse {
  hasShift: boolean;
  shift: {
    id: string;
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    shiftLabel: string;
    deviceName: string;
    deviceCode: string;
    isConfirmed: boolean;
  } | null;
  attendance: MyDayAttendance | null;
  tasks: MyDayTask[];
  taskProgress: { completed: number; total: number; percentage: number };
  activeIncidents: MyDayIncident[];
  pendingSwapRequests: MyDaySwapRequest[];
  nextShift: {
    id: string;
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    shiftLabel: string;
    deviceName: string;
    deviceCode: string;
    isConfirmed: boolean;
  } | null;
  remainingHours: number;
  unitName: string;
  unitType: string;
  personnel: { id: string; name: string; role: string } | null;
}

export interface MyTodayResponse {
  hasShift: boolean;
  shift: {
    id: string;
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    shiftLabel: string;
    deviceName: string;
    deviceCode: string;
    isConfirmed: boolean;
  } | null;
  personnel: { id: string; name: string; role: string } | null;
  unitName: string;
  unitType: string;
}

export interface MyWeekResponse {
  weekStart: string;
  weekEnd: string;
  days: MyWeekDay[];
}

export interface MyWeekDay {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isToday: boolean;
  isPast: boolean;
  hasShift: boolean;
  shift?: {
    id: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    shiftLabel: string;
    deviceName: string;
    deviceCode: string;
    isConfirmed: boolean;
  };
}

export interface ScheduleAlert {
  type:
    | 'missing_staff'
    | 'understaffed'
    | 'double_booking'
    | 'overtime'
    | 'consecutive_night'
    | 'unassigned_critical'
    | 'workload_imbalance'
    | 'shift_threshold';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  unit: string;
  date?: string;
  personnelId?: string;
  personnelName?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface ScheduleAnalytics {
  totalShifts: number;
  nightShifts: number;
  weekendShifts: number;
  emptyShifts: number;
  averageHoursPerEmployee: number;
  fairnessScore: number;
  coveragePercent: number;
}

export interface DetailedEmployeeWorkload {
  employeeId: string;
  employeeName: string;
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  weekendShifts: number;
  totalHours: number;
  averageFatigue: number;
}

export interface VersionHistoryResponse {
  version: number;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  comment?: string;
  changeReason?: string;
}

export interface AuditLogResponse {
  id: string;
  scheduleId: string;
  shiftId?: string;
  assignmentId?: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  changedBy: string;
  changedByName?: string;
  userRole: string;
  reason?: string;
  timestamp: string;
}

export interface WorkflowTransitionRequest {
  comment?: string;
  reason?: string;
}

export interface VersionCompareResult {
  fromVersion: {
    version: number;
    createdAt: string;
    assignments: ShiftAssignment[];
  };
  toVersion: {
    version: number;
    createdAt: string;
    assignments: ShiftAssignment[];
  };
  diff: {
    added: ShiftAssignment[];
    removed: ShiftAssignment[];
    modified: ShiftAssignment[];
    totalChanges: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  private readonly api = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly logger = inject(LoggerService);

  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _currentSchedule = signal<ScheduleResponse | null>(null);
  private readonly _schedules = signal<ScheduleResponse[]>([]);
  private readonly _versionHistory = signal<VersionHistoryResponse[]>([]);
  private readonly _auditLog = signal<AuditLogResponse[]>([]);
  private readonly _pendingApprovals = signal<ScheduleResponse[]>([]);
  private readonly _hasVersionHistoryError = signal(false);
  private readonly _hasAuditLogError = signal(false);

  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly currentSchedule = computed(() => this._currentSchedule());
  readonly schedules = computed(() => this._schedules());
  readonly versionHistory = computed(() => this._versionHistory());
  readonly auditLog = computed(() => this._auditLog());
  readonly pendingApprovals = computed(() => this._pendingApprovals());
  readonly hasVersionHistoryError = computed(() => this._hasVersionHistoryError());
  readonly hasAuditLogError = computed(() => this._hasAuditLogError());

  // ---- Schedule CRUD ----

  getAll(startDate?: string, endDate?: string): Observable<ScheduledShift[]> {
    const params: Record<string, string> = {};
    if (startDate) params['startDate'] = startDate;
    if (endDate) params['endDate'] = endDate;

    return this.api.get<ScheduledShift[]>('/schedules', { params }).pipe(
      catchError((err) => {
        const message = err.message || 'Programlar yüklenemedi';
        this.logger.error('GET /schedules failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  loadSchedules(params?: {
    unit?: UnitType;
    status?: ScheduleStatus;
    month?: number;
    year?: number;
    page?: number;
    pageSize?: number;
  }): Observable<ScheduleListResponse> {
    this._isLoading.set(true);
    this._error.set(null);

    const queryParams: Record<string, string> = {};
    if (params?.unit) queryParams['unit'] = params.unit;
    if (params?.status) queryParams['status'] = params.status;
    if (params?.month) queryParams['month'] = String(params.month);
    if (params?.year) queryParams['year'] = String(params.year);
    if (params?.page) queryParams['page'] = String(params.page);
    if (params?.pageSize) queryParams['pageSize'] = String(params.pageSize);

    return this.api.get<ScheduleListResponse>('/schedules', { params: queryParams }).pipe(
      tap((response) => {
        if (response) {
          this._schedules.set(response.schedules);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Programlar yüklenemedi';
        this.logger.error(`GET /schedules failed`, 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  loadSchedule(scheduleId: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.get<ScheduleResponse | null>(`/schedules/${scheduleId}`).pipe(
      tap((response) => {
        if (response) {
          this._currentSchedule.set(response);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Program yüklenemedi';
        this.logger.error(`GET /schedules/${scheduleId} failed`, 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  loadScheduleByUnit(
    unit: UnitType,
    month: number,
    year: number,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .get<ScheduleResponse | null>(`/schedules/unit/${unit}`, {
        params: { month: String(month), year: String(year) },
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Program yüklenemedi';
          const endpointPath = `/schedules/unit/${unit}`;
          console.error(`[ScheduleService] GET ${endpointPath} failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => ({ ...err, path: err.path || endpointPath }));
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  createSchedule(data: {
    unit: UnitType;
    month: number;
    year: number;
  }): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.post<ScheduleResponse | null>('/schedules', data).pipe(
      tap((response) => {
        if (response) {
          this._currentSchedule.set(response);
          this._schedules.update((schedules) => [response, ...schedules]);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Program oluşturulamadı';
        this.logger.error('POST /schedules failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Oluşturma Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  updateSchedule(
    scheduleId: string,
    data: Partial<ScheduleResponse>,
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .put<ScheduleResponse | null>(`/schedules/${scheduleId}`, {
        ...data,
        changeReason: reason,
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
            this._schedules.update((schedules) =>
              schedules.map((s) => (s.id === scheduleId ? response : s)),
            );
          }
        }),
        catchError((err) => {
          const message = err.message || 'Program güncellenemedi';
          console.error(`[ScheduleService] PUT /schedules/${scheduleId} failed:`, err);
          this._error.set(message);
          this.notification.error('Güncelleme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  // ---- Assignments ----

  assignPersonnel(
    scheduleId: string,
    assignment: {
      deviceId: string;
      date: string;
      shiftType: string;
      personnelId: string;
      personnelType?: string;
      startTime?: string;
      endTime?: string;
    },
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/assignments`, {
        ...assignment,
        reason,
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const raw = err.message || err?.error?.message || 'Atama yapılamadı';
          const translated = translateAssignmentError(raw);
          console.error(`[ScheduleService] POST /schedules/${scheduleId}/assignments failed:`, err);
          this._error.set(translated?.message || raw);
          this.notification.error(translated?.title || 'Atama Hatası', translated?.message || raw);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  directAssign(
    unitType: string,
    month: number,
    year: number,
    assignment: {
      personnelId: string;
      deviceId: string;
      date: string;
      shiftType: string;
      personnelType?: string;
      startTime: string;
      endTime: string;
    },
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<ScheduleResponse | null>('/schedules/direct-assign', {
        unitType,
        month,
        year,
        ...assignment,
        reason: 'Dogrudan atama',
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const raw = err.message || err?.error?.message || 'Atama yapılamadı';
          const translated = translateAssignmentError(raw);
          console.error(`[ScheduleService] POST /schedules/direct-assign failed:`, err);
          this._error.set(translated?.message || raw);
          this.notification.error(translated?.title || 'Atama Hatası', translated?.message || raw);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  removeAssignment(
    scheduleId: string,
    assignmentId: string,
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .delete<ScheduleResponse | null>(`/schedules/${scheduleId}/assignments/${assignmentId}`, {
        params: { reason },
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Atama kaldırılamadı';
          console.error(
            `[ScheduleService] DELETE /schedules/${scheduleId}/assignments/${assignmentId} failed:`,
            err,
          );
          this._error.set(message);
          this.notification.error('Atama Kaldırma Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  updateAssignment(
    scheduleId: string,
    assignmentId: string,
    assignmentData: {
      deviceId: string;
      date: string;
      shiftType: string;
      personnelId: string;
      personnelType?: string;
      startTime?: string;
      endTime?: string;
    },
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .put<ScheduleResponse | null>(`/schedules/${scheduleId}/assignments/${assignmentId}`, {
        ...assignmentData,
        reason,
      })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const raw = err.message || err?.error?.message || 'Atama güncellenemedi';
          const translated = translateAssignmentError(raw);
          const message = translated?.message || raw;
          console.error(
            `[ScheduleService] PUT /schedules/${scheduleId}/assignments/${assignmentId} failed:`,
            err,
          );
          this._error.set(translated?.message || raw);
          this.notification.error(translated?.title || 'Güncelleme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  // ---- Person (cihaz dışı) Shifts ----

  loadPersonShifts(unit: string, month: number, year: number): Observable<PersonShiftsResponse> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api
      .get<PersonShiftsResponse>(`/schedules/unit/${unit}/person-shifts`, {
        params: { month: String(month), year: String(year) },
      })
      .pipe(
        tap(() => {}),
        catchError((err) => {
          const message = err.message || 'Personel nöbetleri yüklenemedi';
          console.error(`[ScheduleService] GET /schedules/unit/${unit}/person-shifts failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  loadPersonShiftReport(
    unit: string,
    month: number,
    year: number,
    filters?: { groupId?: string; personnelId?: string },
  ): Observable<PersonShiftReportResponse> {
    const params: Record<string, string> = { month: String(month), year: String(year) };
    if (filters?.groupId) params['groupId'] = filters.groupId;
    if (filters?.personnelId) params['personnelId'] = filters.personnelId;
    return this.api
      .get<PersonShiftReportResponse>(`/schedules/unit/${unit}/person-shift-report`, { params })
      .pipe(
        catchError((err) => {
          const message = err.message || 'Nöbet raporu yüklenemedi';
          console.error(`[ScheduleService] GET person-shift-report failed:`, err);
          this._error.set(message);
          this.notification.error('Rapor Hatası', message);
          return throwError(() => err);
        }),
      );
  }

  assignPersonShift(
    scheduleId: string,
    assignment: {
      personnelId: string;
      personnelGroupId: string;
      shiftTemplateId: string;
      unitId: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/assignments`, {
        ...assignment,
        kind: 'person',
        reason,
      })
      .pipe(
        tap((response) => {
          if (response) this._currentSchedule.set(response);
        }),
        catchError((err) => {
          const raw = err.message || err?.error?.message || 'Nöbet ataması yapılamadı';
          console.error(`[ScheduleService] POST person assignment failed:`, err);
          this._error.set(raw);
          this.notification.error('Atama Hatası', raw);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  overridePersonShift(
    scheduleId: string,
    assignment: {
      personnelId: string;
      personnelGroupId: string;
      shiftTemplateId: string;
      unitId: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    overrideReason: string,
    violatedRules: string[],
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/assignments/override`, {
        ...assignment,
        kind: 'person',
        overrideReason,
        violatedRules,
        confirmedByUser: true,
      })
      .pipe(
        tap((response) => {
          if (response) this._currentSchedule.set(response);
        }),
        catchError((err) => {
          const raw = err.message || err?.error?.message || 'İstisna ataması yapılamadı';
          console.error(`[ScheduleService] POST override assignment failed:`, err);
          this._error.set(raw);
          this.notification.error('İstisna Hatası', raw);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  removePersonShift(
    scheduleId: string,
    assignmentId: string,
    reason: string,
  ): Observable<ScheduleResponse | null> {
    return this.removeAssignment(scheduleId, assignmentId, reason);
  }

  // ---- Personnel Groups (nöbet grupları) ----

  loadPersonnelGroups(unitId?: string): Observable<PersonnelGroup[]> {
    const params: Record<string, string> = {};
    if (unitId) params['unitId'] = unitId;
    return this.api.get<PersonnelGroup[]>('/personnel-groups', { params }).pipe(
      catchError((err) => {
        const message = err.message || 'Nöbet grupları yüklenemedi';
        console.error(`[ScheduleService] GET /personnel-groups failed:`, err);
        this._error.set(message);
        return throwError(() => err);
      }),
    );
  }

  createPersonnelGroup(data: {
    code: string;
    name: string;
    description?: string;
    unitId?: string;
  }): Observable<PersonnelGroup> {
    return this.api.post<PersonnelGroup>('/personnel-groups', data).pipe(
      catchError((err) => {
        const message = err.message || 'Grup oluşturulamadı';
        this.notification.error('Grup Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  updatePersonnelGroup(
    id: string,
    data: Partial<{ code: string; name: string; description: string; isActive: boolean }>,
  ): Observable<PersonnelGroup> {
    return this.api.patch<PersonnelGroup>(`/personnel-groups/${id}`, data).pipe(
      catchError((err) => {
        const message = err.message || 'Grup güncellenemedi';
        this.notification.error('Grup Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  deletePersonnelGroup(id: string): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/personnel-groups/${id}`).pipe(
      catchError((err) => {
        const message = err.message || 'Grup silinemedi';
        this.notification.error('Grup Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  loadGroupTemplates(groupId: string): Observable<PersonShiftTemplate[]> {
    return this.api.get<PersonShiftTemplate[]>(`/personnel-groups/${groupId}/templates`).pipe(
      catchError((err) => {
        const message = err.message || 'Şablonlar yüklenemedi';
        this._error.set(message);
        return throwError(() => err);
      }),
    );
  }

  createShiftTemplate(
    groupId: string,
    data: { name: string; shiftType: string; startTime: string; endTime: string },
  ): Observable<PersonShiftTemplate> {
    return this.api.post<PersonShiftTemplate>(`/personnel-groups/${groupId}/templates`, data).pipe(
      catchError((err) => {
        const message = err.message || 'Şablon oluşturulamadı';
        this.notification.error('Şablon Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  updateShiftTemplate(
    groupId: string,
    templateId: string,
    data: Partial<{
      name: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }>,
  ): Observable<PersonShiftTemplate> {
    return this.api
      .patch<PersonShiftTemplate>(`/personnel-groups/${groupId}/templates/${templateId}`, data)
      .pipe(
        catchError((err) => {
          const message = err.message || 'Şablon güncellenemedi';
          this.notification.error('Şablon Hatası', message);
          return throwError(() => err);
        }),
      );
  }

  deleteShiftTemplate(groupId: string, templateId: string): Observable<{ success: boolean }> {
    return this.api
      .delete<{ success: boolean }>(`/personnel-groups/${groupId}/templates/${templateId}`)
      .pipe(
        catchError((err) => {
          const message = err.message || 'Şablon silinemedi';
          this.notification.error('Şablon Hatası', message);
          return throwError(() => err);
        }),
      );
  }

  // ---- Publish ----

  publishUnitSchedule(
    unit: UnitType,
    month: number,
    year: number,
    assignments?: ShiftAssignment[],
  ): Observable<any> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<any>(`/schedules/unit/${unit}/publish`, {
        month,
        year,
        assignments: assignments?.map((a) => ({
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          personnelType: a.personnelType,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      })
      .pipe(
        tap((response) => {
          if (response?.schedule) {
            this._currentSchedule.set(response.schedule);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Yayınlanamadı';
          console.error(`[ScheduleService] POST /schedules/unit/${unit}/publish failed:`, err);
          this._error.set(message);
          this.notification.error('Yayınlama Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  // ---- Auto Generate ----

  generateSchedule(params: {
    unitType: string;
    month: number;
    year: number;
    fairnessMode?: string;
    maxOvertime?: number;
    includeWeekends?: boolean;
    includeNightShifts?: boolean;
    minRestHours?: number;
    maxConsecutiveDays?: number;
    maxConsecutiveNights?: number;
  }): Observable<any> {
    return this.api.post<any>('/schedules/generate', params).pipe(
      catchError((err) => {
        const message = err.message || 'Program oluşturulamadı';
        this.logger.error('POST /schedules/generate failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Oluşturma Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  previewSchedule(params: {
    unitType: string;
    month: number;
    year: number;
    fairnessMode?: string;
    maxOvertime?: number;
    includeWeekends?: boolean;
    includeNightShifts?: boolean;
    minRestHours?: number;
    maxConsecutiveDays?: number;
    maxConsecutiveNights?: number;
  }): Observable<any> {
    return this.api.post<any>('/schedules/generate/preview', params).pipe(
      catchError((err) => {
        const message = err.message || 'Önizleme alınamadı';
        this.logger.error('POST /schedules/generate/preview failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Önizleme Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  applyGeneratedSchedule(scheduleId: string, assignments: any[]): Observable<any> {
    return this.api.post<any>('/schedules/generate/apply', { scheduleId, assignments }).pipe(
      catchError((err) => {
        const message = err.message || 'Program uygulanamadı';
        this.logger.error('POST /schedules/generate/apply failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Uygulama Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  // ---- Workflow ----

  submitForReview(scheduleId: string, comment?: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/submit`, { comment })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'İncelemeye gönderilemedi';
          console.error(`[ScheduleService] POST /schedules/${scheduleId}/submit failed:`, err);
          this._error.set(message);
          this.notification.error('İşlem Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  approveSchedule(scheduleId: string, comment?: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/approve`, { comment })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Onaylanamadı';
          console.error(`[ScheduleService] POST /schedules/${scheduleId}/approve failed:`, err);
          this._error.set(message);
          this.notification.error('Onay Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  rejectSchedule(scheduleId: string, reason: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    if (!reason || reason.trim().length === 0) {
      this._error.set('Reddetme sebebi zorunludur');
      return throwError(() => ({
        code: 'VALIDATION_ERROR',
        message: 'Reddetme sebebi zorunludur',
      }));
    }

    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/reject`, { reason })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Reddedilemedi';
          console.error(`[ScheduleService] POST /schedules/${scheduleId}/reject failed:`, err);
          this._error.set(message);
          this.notification.error('Reddetme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  publishSchedule(scheduleId: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.post<ScheduleResponse | null>(`/schedules/${scheduleId}/publish`, {}).pipe(
      tap((response) => {
        if (response) {
          this._currentSchedule.set(response);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Yayınlanamadı';
        console.error(`[ScheduleService] POST /schedules/${scheduleId}/publish failed:`, err);
        this._error.set(message);
        this.notification.error('Yayınlama Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  archiveSchedule(scheduleId: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.post<ScheduleResponse | null>(`/schedules/${scheduleId}/archive`, {}).pipe(
      tap((response) => {
        if (response) {
          this._currentSchedule.set(response);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Arşivlenemedi';
        console.error(`[ScheduleService] POST /schedules/${scheduleId}/archive failed:`, err);
        this._error.set(message);
        this.notification.error('Arşivleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  // ---- Versioning ----

  createRevision(scheduleId: string): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.post<ScheduleResponse | null>(`/schedules/${scheduleId}/revision`, {}).pipe(
      tap((response) => {
        if (response) {
          this._currentSchedule.set(response);
        }
      }),
      catchError((err) => {
        const message = err.message || 'Revizyon oluşturulamadı';
        console.error(`[ScheduleService] POST /schedules/${scheduleId}/revision failed:`, err);
        this._error.set(message);
        this.notification.error('Revizyon Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  loadVersionHistory(scheduleId: string): Observable<VersionHistoryResponse[]> {
    this._isLoading.set(true);
    this._hasVersionHistoryError.set(false);
    this._error.set(null);

    return this.api.get<VersionHistoryResponse[]>(`/schedules/${scheduleId}/versions`).pipe(
      tap((response) => {
        if (response) {
          this._versionHistory.set(response);
        }
      }),
      catchError((err) => {
        this._hasVersionHistoryError.set(true);
        const message = 'Sürüm geçmişi yüklenemedi';
        console.error(`[ScheduleService] GET /schedules/${scheduleId}/versions failed:`, err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  rollbackToVersion(
    scheduleId: string,
    version: number,
    reason: string,
  ): Observable<ScheduleResponse | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .post<ScheduleResponse | null>(`/schedules/${scheduleId}/rollback/${version}`, { reason })
      .pipe(
        tap((response) => {
          if (response) {
            this._currentSchedule.set(response);
          }
        }),
        catchError((err) => {
          const message = err.message || 'Geri alınamadı';
          console.error(`[ScheduleService] POST /schedules/${scheduleId}/rollback failed:`, err);
          this._error.set(message);
          this.notification.error('Geri Alma Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  compareVersions(
    scheduleId: string,
    fromVersion: number,
    toVersion: number,
  ): Observable<VersionCompareResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api
      .get<VersionCompareResult>(`/schedules/${scheduleId}/compare`, {
        params: { from: String(fromVersion), to: String(toVersion) },
      })
      .pipe(
        catchError((err) => {
          const message = 'Versiyon karşılaştırması yüklenemedi';
          console.error(`[ScheduleService] GET /schedules/${scheduleId}/compare failed:`, err);
          this._error.set(message);
          this.notification.error('Karşılaştırma Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  // ---- Audit ----

  loadAuditLog(scheduleId: string): Observable<AuditLogResponse[]> {
    this._isLoading.set(true);
    this._hasAuditLogError.set(false);
    this._error.set(null);

    return this.api.get<AuditLogResponse[]>(`/schedules/${scheduleId}/audit`).pipe(
      tap((response) => {
        if (response) {
          this._auditLog.set(response);
        }
      }),
      catchError((err) => {
        this._hasAuditLogError.set(true);
        const message = 'Denetim günlüğü yüklenemedi';
        console.error(`[ScheduleService] GET /schedules/${scheduleId}/audit failed:`, err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  loadAuditLogs(params?: {
    scheduleId?: string;
    userId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{ logs: AuditLogResponse[]; total: number }> {
    this._isLoading.set(true);
    this._hasAuditLogError.set(false);
    this._error.set(null);

    const queryParams: Record<string, string> = {};
    if (params?.scheduleId) queryParams['scheduleId'] = params.scheduleId;
    if (params?.userId) queryParams['userId'] = params.userId;
    if (params?.action) queryParams['action'] = params.action;
    if (params?.fromDate) queryParams['fromDate'] = params.fromDate;
    if (params?.toDate) queryParams['toDate'] = params.toDate;
    if (params?.page) queryParams['page'] = String(params.page);
    if (params?.pageSize) queryParams['pageSize'] = String(params.pageSize);

    return this.api
      .get<{ logs: AuditLogResponse[]; total: number }>('/audit-logs', { params: queryParams })
      .pipe(
        tap((response) => {
          if (response) {
            this._auditLog.set(response.logs);
          }
        }),
        catchError((err) => {
          this._hasAuditLogError.set(true);
          const message = 'Denetim günlükleri yüklenemedi';
          console.error(`[ScheduleService] GET /audit-logs failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  loadAuditTimeline(filters?: AuditQueryFilters): Observable<AuditTimelineResponse> {
    this._isLoading.set(true);
    this._hasAuditLogError.set(false);
    this._error.set(null);

    const queryParams: Record<string, string> = {};
    if (filters?.userId) queryParams['userId'] = filters.userId;
    if (filters?.unitId) queryParams['unitId'] = filters.unitId;
    if (filters?.deviceId) queryParams['deviceId'] = filters.deviceId;
    if (filters?.startDate) queryParams['startDate'] = filters.startDate;
    if (filters?.endDate) queryParams['endDate'] = filters.endDate;
    if (filters?.limit) queryParams['limit'] = String(filters.limit);

    return this.api
      .get<AuditTimelineResponse>('/audit-logs/timeline', { params: queryParams })
      .pipe(
        catchError((err) => {
          this._hasAuditLogError.set(true);
          const message = 'Denetim zaman çizelgesi yüklenemedi';
          console.error(`[ScheduleService] GET /audit-logs/timeline failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => err);
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  // ---- Approvals & Insights ----

  loadPendingApprovals(): Observable<ScheduleResponse[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.get<ScheduleResponse[]>('/schedules/pending-approvals').pipe(
      tap((response) => {
        if (response) {
          this._pendingApprovals.set(response);
          this._schedules.set(response);
        }
      }),
      catchError((err) => {
        const message = 'Bekleyen onaylar yüklenemedi';
        console.error(`[ScheduleService] GET /approvals/pending failed:`, err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  getDashboardInsights(): Observable<any> {
    return this.api.get('/insights/dashboard').pipe(
      catchError((err) => {
        console.warn(`[ScheduleService] GET /insights/dashboard failed (non-critical):`, err);
        return EMPTY;
      }),
    );
  }

  // ---- Analytics ----

  getAnalytics(startDate?: string, endDate?: string): Observable<ScheduleAnalytics> {
    const { month, year } = this.resolveAnalyticsPeriod(startDate);

    return this.api
      .get<any>('/analytics/overview', { params: { month: String(month), year: String(year) } })
      .pipe(
        map((res) => this.mapAnalyticsOverview(res)),
        catchError((err) => {
          const message = err.message || 'Analitik verileri yüklenemedi';
          this.logger.error('GET /analytics/overview failed', 'ScheduleService', err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => err);
        }),
      );
  }

  // ---- Management Analytics ----

  getAnalyticsOverview(params?: {
    month?: number;
    year?: number;
    unitType?: string;
  }): Observable<any> {
    return this.api.get<any>('/analytics/overview', { params: params as any }).pipe(
      catchError((err) => {
        this.logger.error('GET /analytics/overview failed', 'ScheduleService', err);
        return of(null);
      }),
    );
  }

  getAnalyticsWorkload(params?: {
    month?: number;
    year?: number;
    unitType?: string;
  }): Observable<any[]> {
    return this.api.get<any[]>('/analytics/workload', { params: params as any }).pipe(
      catchError((err) => {
        this.logger.error('GET /analytics/workload failed', 'ScheduleService', err);
        return of([]);
      }),
    );
  }

  getAnalyticsOvertime(params?: {
    month?: number;
    year?: number;
    unitType?: string;
  }): Observable<any[]> {
    return this.api.get<any[]>('/analytics/overtime', { params: params as any }).pipe(
      catchError((err) => {
        this.logger.error('GET /analytics/overtime failed', 'ScheduleService', err);
        return of([]);
      }),
    );
  }

  getAnalyticsDeviceUtilization(params?: {
    month?: number;
    year?: number;
    unitType?: string;
  }): Observable<any[]> {
    return this.api.get<any[]>('/analytics/device-utilization', { params: params as any }).pipe(
      catchError((err) => {
        this.logger.error('GET /analytics/device-utilization failed', 'ScheduleService', err);
        return of([]);
      }),
    );
  }

  getWorkingHours(params?: { month?: number; year?: number; unitType?: string }): Observable<any> {
    return this.api.get<any>('/analytics/working-hours', { params: params as any }).pipe(
      catchError((err) => {
        this.logger.error('GET /analytics/working-hours failed', 'ScheduleService', err);
        return of(null);
      }),
    );
  }

  getEmployeeWorkload(
    startDate?: string,
    endDate?: string,
  ): Observable<DetailedEmployeeWorkload[]> {
    const { month, year } = this.resolveAnalyticsPeriod(startDate);

    return this.api
      .get<any[]>('/analytics/workload', { params: { month: String(month), year: String(year) } })
      .pipe(
        map((rows) => this.mapWorkload(rows)),
        catchError(() => of([])),
      );
  }

  private resolveAnalyticsPeriod(startDate?: string): { month: number; year: number } {
    if (startDate && /^\d{4}-\d{2}/.test(startDate)) {
      return { year: Number(startDate.slice(0, 4)), month: Number(startDate.slice(5, 7)) };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private mapAnalyticsOverview(res: any): ScheduleAnalytics {
    const totalShifts = res?.totalShifts || 0;
    const emptyShifts = res?.missingShifts || 0;
    const nightShiftRatio = res?.nightShiftRatio || 0;
    const totalPersonnel = res?.totalPersonnel || 0;
    const occupancy = (res?.unitOccupancy || []) as Array<{ rate: number }>;
    const avgCoverage = occupancy.length
      ? Math.round(occupancy.reduce((sum, u) => sum + (u.rate || 0), 0) / occupancy.length)
      : 0;
    const coveragePercent =
      totalShifts + emptyShifts > 0
        ? Math.round((totalShifts / (totalShifts + emptyShifts)) * 100)
        : 0;

    return {
      totalShifts,
      nightShifts: Math.round((nightShiftRatio / 100) * totalShifts),
      weekendShifts: 0,
      emptyShifts,
      averageHoursPerEmployee:
        totalPersonnel > 0 ? Math.round((totalShifts * 8) / totalPersonnel) : 0,
      fairnessScore: Math.round((avgCoverage + (100 - nightShiftRatio)) / 2),
      coveragePercent,
    };
  }

  private mapWorkload(rows: any[]): DetailedEmployeeWorkload[] {
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      employeeId: r.personnelId,
      employeeName: r.personnelName || r.personnelId,
      totalShifts: r.totalShifts || 0,
      dayShifts: r.dayShifts || 0,
      nightShifts: r.nightShifts || 0,
      weekendShifts: 0,
      totalHours: r.totalHours || 0,
      averageFatigue: 0,
    }));
  }

  // ---- Employees ----

  getAllEmployees(): Observable<any[]> {
    return this.api.get<any[]>('/personnel').pipe(
      catchError((err) => {
        const message = err.message || 'Personel listesi yüklenemedi';
        this.logger.error('GET /personnel failed', 'ScheduleService', err);
        this._error.set(message);
        this.notification.error('Yükleme Hatası', message);
        return throwError(() => err);
      }),
    );
  }

  // ---- Field Supervisor Overrides ----

  getShiftOverrides(unit: UnitType, month: number, year: number): Observable<ShiftDateOverride[]> {
    return this.api
      .get<ShiftDateOverride[]>('/schedules/unit/' + unit + '/overrides', {
        params: { month: String(month), year: String(year) },
      })
      .pipe(
        catchError((err) => {
          const message = err.message || 'Opsiyonel vardiya ayarları yüklenemedi';
          console.error(`[ScheduleService] GET /schedules/unit/${unit}/overrides failed:`, err);
          this._error.set(message);
          return throwError(() => err);
        }),
      );
  }

  setShiftOverride(
    unit: UnitType,
    shiftId: string,
    date: string,
    isEnabled: boolean,
  ): Observable<any> {
    return this.api
      .put<any>('/schedules/unit/' + unit + '/overrides/' + shiftId + '/' + date, {
        isEnabled,
      })
      .pipe(
        catchError((err) => {
          const message = err.message || 'Opsiyonel vardiya ayarı güncellenemedi';
          console.error(`[ScheduleService] PUT overrides failed:`, err);
          this._error.set(message);
          this.notification.error('Güncelleme Hatası', message);
          return throwError(() => err);
        }),
      );
  }

  // ---- State Management ----

  clearError(): void {
    this._error.set(null);
  }

  loadMyShifts(month: number, year: number): Observable<MyShiftsResponse> {
    return this.api
      .get<MyShiftsResponse>('/me/shifts', {
        params: { month: String(month), year: String(year) },
      })
      .pipe(
        catchError((err) => {
          const message = err.message || 'Vardiyalar yüklenemedi';
          this.logger.error('[ScheduleService] loadMyShifts failed', err);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => ({ ...err, path: err.path || '/me/shifts' }));
        }),
      );
  }

  getMySummary(): Observable<MySummaryResponse> {
    return this.api.get<MySummaryResponse>('/me/summary').pipe(
      catchError((err) => {
        const message = err.message || 'Özet yüklenemedi';
        this.logger.error('[ScheduleService] getMySummary failed', err);
        return throwError(() => ({ ...err, path: err.path || '/me/summary' }));
      }),
    );
  }

  getMyDayDashboard(): Observable<MyDayDashboardResponse> {
    return this.api.get<MyDayDashboardResponse>('/me/my-day').pipe(
      catchError((err) => {
        this.logger.error('[ScheduleService] getMyDayDashboard failed', err);
        return throwError(() => ({ ...err, path: err.path || '/me/my-day' }));
      }),
    );
  }

  getMyToday(): Observable<MyTodayResponse> {
    return this.api.get<MyTodayResponse>('/me/today').pipe(
      catchError((err) => {
        this.logger.error('[ScheduleService] getMyToday failed', err);
        return throwError(() => ({ ...err, path: err.path || '/me/today' }));
      }),
    );
  }

  getMyWeek(): Observable<MyWeekResponse> {
    return this.api.get<MyWeekResponse>('/me/week').pipe(
      catchError((err) => {
        this.logger.error('[ScheduleService] getMyWeek failed', err);
        return throwError(() => ({ ...err, path: err.path || '/me/week' }));
      }),
    );
  }

  getScheduleAlerts(scheduleId: string): Observable<ScheduleAlert[]> {
    return this.api.get<ScheduleAlert[]>(`/schedules/${scheduleId}/alerts`).pipe(
      catchError((err) => {
        this.logger.error('[ScheduleService] getScheduleAlerts failed', err);
        return throwError(() => err);
      }),
    );
  }

  getExportExcelUrl(unit: string, month: number, year: number): string {
    const env: any = (window as any).__env?.apiUrl || 'http://localhost:3000/api/v1';
    return `${env}/schedules/export/excel?unit=${unit}&month=${month}&year=${year}`;
  }

  getExportPdfUrl(unit: string, month: number, year: number): string {
    const env: any = (window as any).__env?.apiUrl || 'http://localhost:3000/api/v1';
    return `${env}/schedules/export/pdf?unit=${unit}&month=${month}&year=${year}`;
  }

  clearCurrentSchedule(): void {
    this._currentSchedule.set(null);
  }

  clearSchedules(): void {
    this._schedules.set([]);
    this._currentSchedule.set(null);
  }

  clearPendingApprovals(): void {
    this._pendingApprovals.set([]);
  }

  clearVersionHistory(): void {
    this._versionHistory.set([]);
    this._hasVersionHistoryError.set(false);
  }

  clearAuditLog(): void {
    this._auditLog.set([]);
    this._hasAuditLogError.set(false);
  }

  clearAll(): void {
    this._error.set(null);
    this._currentSchedule.set(null);
    this._schedules.set([]);
    this._versionHistory.set([]);
    this._auditLog.set([]);
    this._pendingApprovals.set([]);
    this._hasVersionHistoryError.set(false);
    this._hasAuditLogError.set(false);
  }
}
