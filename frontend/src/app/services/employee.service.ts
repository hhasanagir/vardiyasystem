import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Subscription } from 'rxjs';
import { map, catchError, tap, finalize } from 'rxjs/operators';
import { environment } from '../environments';
import { Employee } from '../domain/models';
import { AuthService } from './auth.service';
import { WebSocketService } from './websocket.service';

export interface EmployeeWorkload {
  employeeId: string;
  employeeName: string;
  totalShifts: number;
  nightShifts: number;
  weekendShifts: number;
  totalHours: number;
  weeklyHours: number;
  workloadPercentage: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  critical: boolean;
}

export interface EmployeeApiError {
  code: string;
  message: string;
  operation: string;
}

@Injectable({
  providedIn: 'root',
})
export class EmployeeService implements OnDestroy {
  private readonly apiUrl = environment.apiUrl;
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly wsService = inject(WebSocketService);
  private wsSub: Subscription;

  constructor() {
    this.wsSub = this.wsService.on<any>('personnel:update').subscribe(() => {
      this._isLoading.set(true);
      this.getAll().subscribe({ complete: () => this._isLoading.set(false) });
    });
  }

  ngOnDestroy(): void {
    if (this.wsSub) this.wsSub.unsubscribe();
  }

  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _employees = signal<Employee[]>([]);

  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly employees = computed(() => this._employees());

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private getOrganizationId(): string {
    const user = this.authService.user();
    if (user?.organizationId) return user.organizationId;
    const token = this.authService.getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.organizationId) return payload.organizationId;
      } catch {
        /* ignore */
      }
    }
    return '';
  }

  private getUnitId(): string {
    const user = this.authService.user();
    if (user?.unitId) return user.unitId;
    const token = this.authService.getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.unitId) return payload.unitId;
      } catch {
        /* ignore */
      }
    }
    return '';
  }

  private handleError(error: HttpErrorResponse, operation: string): Observable<never> {
    const errorMessage =
      error.error instanceof ErrorEvent
        ? `İstemci hatası: ${error.error.message}`
        : error.error?.message || `${operation} sırasında sunucu hatası oluştu`;
    console.error(`EmployeeService ${operation} error:`, error);
    this._error.set(errorMessage);
    return throwError(() => ({
      code: error.error?.code || 'EMPLOYEE_SERVICE_ERROR',
      message: errorMessage,
      operation,
      originalError: error,
    }));
  }

  getAll(month?: number, year?: number): Observable<Employee[]> {
    this._isLoading.set(true);
    this._error.set(null);
    const orgId = this.getOrganizationId();
    const unitId = this.getUnitId();
    const params: Record<string, string> = { organizationId: orgId, unitId };
    if (month) params['month'] = String(month);
    if (year) params['year'] = String(year);
    return this.http
      .get<Employee[]>(`${this.apiUrl}/personnel`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        tap((employees) => this._employees.set(employees)),
        catchError((err) => {
          const message = 'Çalışanlar yüklenemedi';
          this._error.set(message);
          return this.handleError(err, 'getAll');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  getByUnit(unitId: string): Observable<Employee[]> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.http
      .get<Employee[]>(`${this.apiUrl}/personnel`, {
        headers: this.getHeaders(),
        params: { unitId },
      })
      .pipe(
        tap((employees) => this._employees.set(employees)),
        catchError((err) => {
          const message = 'Birim çalışanları yüklenemedi';
          this._error.set(message);
          return this.handleError(err, 'getByUnit');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  getById(id: string): Observable<Employee | null> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.http
      .get<Employee>(`${this.apiUrl}/personnel/${id}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        catchError((err) => {
          const message = 'Çalışan bilgileri yüklenemedi';
          this._error.set(message);
          return this.handleError(err, 'getById');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  create(data: {
    name: string;
    role: string;
    employeeNo?: string;
    email?: string;
    phone?: string;
    specialization?: string;
    experienceYears?: number;
    deviceSkills?: string[];
    nightShiftEligible?: boolean;
    employmentStatus?: string;
    startDate?: string;
    notes?: string;
    offDays?: number[];
    maxWeeklyHours?: number;
    isActive?: boolean;
    unitId?: string;
  }): Observable<Employee | null> {
    this._isLoading.set(true);
    this._error.set(null);
    const orgId = this.getOrganizationId();
    return this.http
      .post<Employee>(
        `${this.apiUrl}/personnel`,
        {
          ...data,
          organizationId: orgId,
          unitId: data.unitId || this.getUnitId(),
        },
        { headers: this.getHeaders() },
      )
      .pipe(
        tap((employee) => this._employees.update((list) => [...list, employee])),
        catchError((err) => {
          this._error.set(err?.message || 'Çalışan eklenemedi');
          return this.handleError(err, 'create');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  update(id: string, data: Partial<Employee>): Observable<Employee | null> {
    this._isLoading.set(true);
    this._error.set(null);
    const orgId = data.organizationId || this.getOrganizationId();
    const uid = data.unitId || this.getUnitId();
    const payload: Record<string, any> = { ...data };
    if (orgId) payload['organizationId'] = orgId;
    if (uid) payload['unitId'] = uid;
    return this.http
      .put<Employee>(`${this.apiUrl}/personnel/${id}`, payload, { headers: this.getHeaders() })
      .pipe(
        tap((employee) =>
          this._employees.update((list) => list.map((e) => (e.id === id ? employee : e))),
        ),
        catchError((err) => {
          const message = 'Çalışan güncellenemedi';
          this._error.set(message);
          return this.handleError(err, 'update');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  delete(id: string): Observable<boolean> {
    this._isLoading.set(true);
    this._error.set(null);
    return this.http
      .delete<void>(`${this.apiUrl}/personnel/${id}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap(() => this._employees.update((list) => list.filter((e) => e.id !== id))),
        map(() => true),
        catchError((err) => {
          const message = 'Çalışan silinemedi';
          this._error.set(message);
          return this.handleError(err, 'delete');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  getWorkload(id: string, month?: number, year?: number): Observable<EmployeeWorkload | null> {
    this._isLoading.set(true);
    this._error.set(null);
    const params: Record<string, string> = {};
    if (month) params['month'] = String(month);
    if (year) params['year'] = String(year);
    return this.http
      .get<any>(`${this.apiUrl}/personnel/${id}/workload`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        map((workload) => ({
          employeeId: workload.personnelId || id,
          employeeName: workload.name || '',
          totalShifts: workload.totalShifts ?? workload.totalAssignments ?? 0,
          nightShifts: workload.nightShifts || 0,
          weekendShifts: workload.weekendShifts || 0,
          totalHours: workload.totalHours || 0,
          weeklyHours: workload.weeklyHours || 0,
          workloadPercentage: workload.workloadPercentage || 0,
          riskLevel: workload.riskLevel || 'low',
          critical: workload.critical || false,
        })),
        catchError((err) => {
          const message = 'İş yükü bilgisi yüklenemedi';
          this._error.set(message);
          return this.handleError(err, 'getWorkload');
        }),
        finalize(() => this._isLoading.set(false)),
      );
  }

  getAvailableForShift(date: string, shiftType: string): Observable<Employee[]> {
    const orgId = this.getOrganizationId();
    return this.http
      .get<Employee[]>(`${this.apiUrl}/personnel/available`, {
        headers: this.getHeaders(),
        params: { date, shiftType, organizationId: orgId },
      })
      .pipe(catchError((err) => this.handleError(err, 'getAvailableForShift')));
  }

  clearError(): void {
    this._error.set(null);
  }
  clearEmployees(): void {
    this._employees.set([]);
  }
}
