import { Injectable, inject, signal } from '@angular/core';
import { Observable, switchMap, tap, of, catchError, throwError } from 'rxjs';
import { ScheduleApiService } from './schedule-api.service';
import { ScheduleStore } from '../store/schedule.store';
import type {
  Schedule,
  AssignmentDTO,
  ScheduleStatus,
  ValidationResult,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ScheduleCommandService {
  private readonly api = inject(ScheduleApiService);
  private readonly store = inject(ScheduleStore);
  private readonly _executing = signal(false);

  readonly executing = this._executing.asReadonly();

  createSchedule(unitId: string, month: number, year: number): Observable<Schedule> {
    this._executing.set(true);
    return this.api.create({ unitId, month, year }).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  loadSchedule(scheduleId: string): Observable<Schedule> {
    this._executing.set(true);
    return this.api.getById(scheduleId).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  loadSchedules(params?: { unitId?: string; month?: number; year?: number }): Observable<Schedule[]> {
    this._executing.set(true);
    return this.api.list(params).pipe(
      tap(schedules => this.store.loadSchedules(schedules)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  addAssignment(scheduleId: string, dto: Omit<AssignmentDTO, 'id' | 'scheduleId'>): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.addAssignment(scheduleId, dto, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  overrideAssignment(
    scheduleId: string,
    dto: Omit<AssignmentDTO, 'id' | 'scheduleId'>,
    reason: string,
    violatedRules: string[],
  ): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.overrideAssignment(scheduleId, { assignmentParams: dto, overrideReason: reason, violatedRules }, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  updateAssignment(
    scheduleId: string,
    assignmentId: string,
    changes: Partial<Pick<AssignmentDTO, 'deviceId' | 'shiftType' | 'startTime' | 'endTime' | 'kind'>>,
  ): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.updateAssignment(scheduleId, assignmentId, changes, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  removeAssignment(scheduleId: string, assignmentId: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.removeAssignment(scheduleId, assignmentId, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  submitForReview(scheduleId: string, comment?: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.submitForReview(scheduleId, comment, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  approve(scheduleId: string, comment?: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.approve(scheduleId, comment, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  reject(scheduleId: string, reason: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.reject(scheduleId, reason, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  publish(scheduleId: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.publish(scheduleId, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  archive(scheduleId: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.archive(scheduleId, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  revertToDraft(scheduleId: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.revertToDraft(scheduleId, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  rollback(scheduleId: string, targetVersion: number, reason: string): Observable<Schedule> {
    const current = this.store.schedule();
    const version = current?.version;
    this._executing.set(true);
    return this.api.rollback(scheduleId, targetVersion, reason, version).pipe(
      tap(schedule => this.store.loadSchedule(schedule)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }

  validate(scheduleId: string): Observable<ValidationResult> {
    this._executing.set(true);
    return this.api.validate(scheduleId).pipe(
      tap(result => this.store.setValidation(result)),
      tap(() => this._executing.set(false)),
      catchError(err => { this._executing.set(false); return throwError(() => err); }),
    );
  }
}
