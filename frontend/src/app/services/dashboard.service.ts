import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError, tap, finalize } from 'rxjs/operators';
import { environment } from '../environments';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

export interface DashboardMetrics {
  activeShifts: number;
  missingAssignments: number;
  pendingRequests: number;
  monthlyHours: number;
  totalEmployees: number;
  mrDevices: number;
  btDevices: number;
  todayShifts: number;
  weeklyHours: number;
  nightShifts: number;
  overtimeHours: number;
  fairnessScore: number;
}

export interface RecentActivity {
  id: string;
  type:
    | 'shift_assigned'
    | 'swap_request'
    | 'leave_created'
    | 'schedule_updated'
    | 'approval_accepted'
    | 'approval_rejected';
  message: string;
  timestamp: Date;
  employeeName?: string;
}

export interface DepartmentStatus {
  name: 'MR' | 'BT';
  totalDevices: number;
  assignedToday: number;
  assignedPercent: number;
  missingCount: number;
}

export interface DeviceStatus {
  id: string;
  name: string;
  department: 'MR' | 'BT';
  todayShifts: number;
  assigned: number;
  remaining: number;
  status: 'assigned' | 'missing' | 'partial';
}

export interface LiveMetrics {
  online: boolean;
  activeConnections?: number;
  lastUpdate?: Date;
  errorRate?: number;
}

export interface DashboardAlert {
  type: 'danger' | 'warning' | 'info' | 'success';
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  time: string;
  action?: { label: string; route: string };
}

export interface DashboardKpiSet {
  activeDevices: number;
  totalPersonnel: number;
  onDutyPersonnel: number;
  pendingShifts: number;
  activeIncidents: number;
  trainingExpiries: number;
  trainingExpired: number;
  trainingDue30: number;
  trainingDue60: number;
  pendingSwaps: number;
  todayAssignments: number;
  totalMissing: number;
}

export interface UnitSummaryItem {
  unitId: string;
  code: string;
  name: string;
  type: string;
  activeDevices: number;
  staffCount: number;
  expectedSlots: number;
  occupancy: number;
  todayAssignments: number;
  missingAssignments: number;
  incidents: number;
}

export interface UpcomingShiftItem {
  id: string;
  date: string;
  day: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  status: string;
  personnelName: string;
  personnelRole: string;
  deviceName: string;
  unitName: string;
  unitType: string;
}

export interface DashboardData {
  period: { month: number; year: number };
  lastUpdated?: string;
  kpis: DashboardKpiSet;
  unitSummary: UnitSummaryItem[];
  upcomingShifts: UpcomingShiftItem[];
  alerts: DashboardAlert[];
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly apiUrl = environment.apiUrl;
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly notification = inject(NotificationService);

  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _metrics = signal<DashboardMetrics | null>(null);
  private readonly _dashboard = signal<DashboardData | null>(null);
  private readonly _lastUpdated = signal<string | null>(null);
  private readonly _lastSuccessfulLoad = signal<Date | null>(null);
  private readonly _departmentStatus = signal<DepartmentStatus[]>([]);
  private readonly _activities = signal<RecentActivity[]>([]);
  private readonly _deviceStatus = signal<Map<string, DeviceStatus[]>>(new Map());
  private readonly _liveMetrics = signal<LiveMetrics | null>(null);

  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly metrics = computed(() => this._metrics());
  readonly dashboard = computed(() => this._dashboard());
  readonly lastUpdated = computed(() => this._lastUpdated());
  readonly lastSuccessfulLoad = computed(() => this._lastSuccessfulLoad());
  readonly departmentStatus = computed(() => this._departmentStatus());
  readonly activities = computed(() => this._activities());
  readonly liveMetrics = computed(() => this._liveMetrics());

  getDeviceStatus(department: 'MR' | 'BT'): DeviceStatus[] {
    return this._deviceStatus().get(department) || [];
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  private getOrganizationId(): string {
    const user = this.authService.user();
    if (user?.organizationId) return user.organizationId;
    try {
      const token = this.authService.getToken();
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.organizationId) return payload.organizationId;
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  private getUnitId(): string {
    const user = this.authService.user();
    if (user?.unitId) return user.unitId;
    return '';
  }

  private handleError(error: HttpErrorResponse, operation: string): Observable<never> {
    let errorMessage: string;

    if (error.error instanceof ErrorEvent) {
      errorMessage = `İstemci hatası: ${error.error.message}`;
    } else {
      errorMessage = error.error?.message || `Sunucu hatası: ${error.status}`;
    }

    console.error(`DashboardService ${operation} error:`, error);
    this._error.set(errorMessage);

    return throwError(() => ({
      code: error.error?.code || 'DASHBOARD_ERROR',
      message: errorMessage,
      operation,
      originalError: error,
    }));
  }

  loadDashboard(): Observable<DashboardData | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http
      .get<DashboardData>(`${this.apiUrl}/analytics/dashboard`, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap((data) => {
          this._dashboard.set(data);
          this._lastUpdated.set(data.lastUpdated || new Date().toISOString());
          this._lastSuccessfulLoad.set(new Date());
          this._error.set(null);
        }),
        map((data) => data),
        catchError((err) => {
          const message = 'Kontrol paneli verileri yüklenemedi';
          console.error(`[Dashboard] GET /analytics/dashboard failed:`, err);
          this._error.set(message);
          return throwError(() => ({ code: 'DASHBOARD_DATA_ERROR', message, err }));
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  loadDashboardMetrics(): Observable<DashboardMetrics | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http
      .get<DashboardMetrics>(`${this.apiUrl}/schedules/dashboard/stats`, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap((metrics) => {
          this._metrics.set(metrics);
        }),
        map((metrics) => metrics),
        catchError((err) => {
          if (err.status === 404) {
            console.warn('[Dashboard] /schedules/dashboard/stats endpoint not available yet');
            this._isLoading.set(false);
            return [null];
          }
          const message = 'Dashboard metrikleri yüklenemedi';
          console.error(`[Dashboard] GET /schedules/dashboard/stats failed:`, err);
          this._error.set(message);
          return throwError(() => ({ code: 'DASHBOARD_METRICS_ERROR', message, err }));
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  loadDepartmentStatus(): Observable<DepartmentStatus[] | null> {
    const orgId = this.getOrganizationId();

    return this.http
      .get<any[]>(`${this.apiUrl}/devices?organizationId=${orgId}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((devices) => {
          const mrDevices = devices.filter(
            (d: any) => d.department?.code === 'MR' || d.departmentId?.includes('MR'),
          );
          const btDevices = devices.filter(
            (d: any) => d.department?.code === 'BT' || d.departmentId?.includes('BT'),
          );

          return [
            {
              name: 'MR' as const,
              totalDevices: mrDevices.length,
              assignedToday: mrDevices.filter((d: any) => d.isActive).length,
              assignedPercent:
                mrDevices.length > 0
                  ? Math.round(
                      (mrDevices.filter((d: any) => d.isActive).length / mrDevices.length) * 100,
                    )
                  : 0,
              missingCount: Math.max(
                0,
                mrDevices.length - mrDevices.filter((d: any) => d.isActive).length,
              ),
            },
            {
              name: 'BT' as const,
              totalDevices: btDevices.length,
              assignedToday: btDevices.filter((d: any) => d.isActive).length,
              assignedPercent:
                btDevices.length > 0
                  ? Math.round(
                      (btDevices.filter((d: any) => d.isActive).length / btDevices.length) * 100,
                    )
                  : 0,
              missingCount: Math.max(
                0,
                btDevices.length - btDevices.filter((d: any) => d.isActive).length,
              ),
            },
          ];
        }),
        tap((status) => {
          this._departmentStatus.set(status);
        }),
        catchError((err) => {
          const message = 'Birim durumu yüklenemedi';
          console.error(`[Dashboard] GET /devices failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => ({ code: 'DEPARTMENT_STATUS_ERROR', message, err }));
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  loadRecentActivities(): Observable<RecentActivity[] | null> {
    const orgId = this.getOrganizationId();

    return this.http
      .get<any[]>(`${this.apiUrl}/schedules/activities?organizationId=${orgId}&limit=10`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((activities) =>
          activities.map((a: any) => ({
            id: a.id,
            type: a.type,
            message: a.message,
            timestamp: new Date(a.timestamp || a.createdAt),
            employeeName: a.employeeName,
          })),
        ),
        tap((activities) => {
          this._activities.set(activities);
        }),
        catchError((err) => {
          const message = 'Son aktiviteler yüklenemedi';
          console.error(`[Dashboard] GET /schedules/activities failed:`, err);
          this._error.set(message);
          this.notification.warning(
            'Kısmi Yükleme',
            'Son aktiviteler yüklenemedi, diğer veriler yüklendi',
          );
          return throwError(() => ({ code: 'RECENT_ACTIVITIES_ERROR', message, err }));
        }),
      );
  }

  loadDeviceStatus(department: 'MR' | 'BT'): Observable<DeviceStatus[] | null> {
    const orgId = this.getOrganizationId();

    return this.http
      .get<any[]>(`${this.apiUrl}/devices?organizationId=${orgId}&department=${department}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((devices) =>
          devices.map((d: any) => ({
            id: d.id,
            name: d.name,
            department: department,
            todayShifts: d.todayShifts || 0,
            assigned: d.assignedShifts || 0,
            remaining: Math.max(0, (d.totalShifts || 0) - (d.assignedShifts || 0)),
            status: d.isActive ? ('assigned' as const) : ('missing' as const),
          })),
        ),
        tap((devices) => {
          const current = this._deviceStatus();
          current.set(department, devices);
          this._deviceStatus.set(new Map(current));
        }),
        catchError((err) => {
          const message = `${department} cihaz durumu yüklenemedi`;
          console.error(`[Dashboard] GET /devices?department=${department} failed:`, err);
          this._error.set(message);
          this.notification.error('Yükleme Hatası', message);
          return throwError(() => ({ code: 'DEVICE_STATUS_ERROR', message, err }));
        }),
      );
  }

  loadLiveMetrics(): Observable<LiveMetrics | null> {
    const orgId = this.getOrganizationId();

    return this.http
      .get<LiveMetrics>(`${this.apiUrl}/schedules/live-metrics?organizationId=${orgId}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap((metrics) => {
          this._liveMetrics.set({ ...metrics, online: true });
        }),
        map((metrics) => ({ ...metrics, online: true })),
        catchError((err) => {
          console.error(`[Dashboard] GET /schedules/live-metrics failed:`, err);
          this._liveMetrics.set(null);
          return throwError(() => ({
            code: 'LIVE_METRICS_ERROR',
            message: 'Canlı metrikler yüklenemedi',
            err,
          }));
        }),
      );
  }

  refreshDashboard(): void {
    this.loadDashboard().subscribe();
    this.loadDashboardMetrics().subscribe();
    this.loadDepartmentStatus().subscribe();
    this.loadRecentActivities().subscribe();
  }

  clearError(): void {
    this._error.set(null);
  }

  clearAll(): void {
    this._metrics.set(null);
    this._dashboard.set(null);
    this._lastUpdated.set(null);
    this._lastSuccessfulLoad.set(null);
    this._departmentStatus.set([]);
    this._activities.set([]);
    this._deviceStatus.set(new Map());
    this._liveMetrics.set(null);
    this._error.set(null);
  }
}
