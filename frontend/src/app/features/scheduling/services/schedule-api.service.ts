import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map } from 'rxjs';
import { ApiService, type ApiError } from '../../../core/api/api.service';
import type {
  Schedule,
  AssignmentDTO,
  VersionSnapshot,
  ValidationResult,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ScheduleApiService {
  private readonly api = inject(ApiService);
  private readonly _loading = signal(false);
  private readonly _error = signal<ApiError | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private static readonly BASE = '/schedules-ddd';

  list(params?: { unitId?: string; month?: number; year?: number; status?: string }): Observable<Schedule[]> {
    const queryParams: Record<string, string> = {};
    if (params?.unitId) queryParams['unitId'] = params.unitId;
    if (params?.month) queryParams['month'] = String(params.month);
    if (params?.year) queryParams['year'] = String(params.year);
    if (params?.status) queryParams['status'] = params.status;

    return this.api.get<Schedule[]>(ScheduleApiService.BASE, { params: queryParams });
  }

  getById(id: string): Observable<Schedule> {
    return this.api.get<Schedule>(`${ScheduleApiService.BASE}/${id}`);
  }

  create(body: { unitId: string; month: number; year: number }): Observable<Schedule> {
    return this.api.post<Schedule>(ScheduleApiService.BASE, body);
  }

  addAssignment(
    scheduleId: string,
    dto: Omit<AssignmentDTO, 'id' | 'scheduleId'>,
    expectedVersion?: number,
  ): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/assignments`,
      dto,
      { params },
    );
  }

  overrideAssignment(
    scheduleId: string,
    body: {
      assignmentParams: Omit<AssignmentDTO, 'id' | 'scheduleId'>;
      overrideReason: string;
      violatedRules: string[];
    },
    expectedVersion?: number,
  ): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/assignments/override`,
      body,
      { params },
    );
  }

  updateAssignment(
    scheduleId: string,
    assignmentId: string,
    changes: Partial<Pick<AssignmentDTO, 'deviceId' | 'shiftType' | 'startTime' | 'endTime' | 'kind' | 'personnelGroupId' | 'shiftTemplateId'>>,
    expectedVersion?: number,
  ): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.put<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/assignments/${assignmentId}`,
      changes,
      { params },
    );
  }

  removeAssignment(
    scheduleId: string,
    assignmentId: string,
    expectedVersion?: number,
  ): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.delete<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/assignments/${assignmentId}`,
      { params },
    );
  }

  submitForReview(scheduleId: string, comment?: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/submit-for-review`,
      { comment },
      { params },
    );
  }

  approve(scheduleId: string, comment?: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/approve`,
      { comment },
      { params },
    );
  }

  reject(scheduleId: string, reason: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/reject`,
      { reason },
      { params },
    );
  }

  publish(scheduleId: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/publish`,
      {},
      { params },
    );
  }

  archive(scheduleId: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/archive`,
      {},
      { params },
    );
  }

  revertToDraft(scheduleId: string, expectedVersion?: number): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/revert-to-draft`,
      {},
      { params },
    );
  }

  rollback(
    scheduleId: string,
    targetVersion: number,
    reason: string,
    expectedVersion?: number,
  ): Observable<Schedule> {
    const params = this.buildVersionParams(expectedVersion);
    return this.api.post<Schedule>(
      `${ScheduleApiService.BASE}/${scheduleId}/rollback`,
      { targetVersion, reason },
      { params },
    );
  }

  getVersion(scheduleId: string, version: number): Observable<VersionSnapshot | null> {
    return this.api.get<VersionSnapshot | null>(
      `${ScheduleApiService.BASE}/${scheduleId}/versions/${version}`,
    );
  }

  validate(scheduleId: string): Observable<ValidationResult> {
    return this.api.post<ValidationResult>(
      `${ScheduleApiService.BASE}/${scheduleId}/validate`,
      {},
    );
  }

  private buildVersionParams(expectedVersion?: number): Record<string, string> | undefined {
    if (expectedVersion !== undefined) {
      return { expectedVersion: String(expectedVersion) };
    }
    return undefined;
  }
}
