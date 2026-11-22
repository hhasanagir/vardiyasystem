import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScheduleService, ScheduleResponse, VersionHistoryResponse } from '../schedule.service';
import type { ApiError } from '../../core/api/api.service';
import { NotificationService } from '../notification.service';
import { ApiService } from '../../core/api/api.service';

describe('ScheduleService Integration Tests', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const mockSchedule: ScheduleResponse = {
    id: 'schedule-1',
    unit: 'mr',
    month: 5,
    year: 2026,
    status: 'draft',
    version: 1,
    devices: [],
    assignments: [],
    createdBy: { id: 'user-1', name: 'Admin', email: 'admin@vardiya.local' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ScheduleService,
        ApiService,
        NotificationService,
      ]
    });

    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
    notificationService = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('loadSchedule', () => {
    it('should load schedule from API and update state', () => {
      let received: ScheduleResponse | null = null;
      service.loadSchedule('schedule-1').subscribe(schedule => { received = schedule; });

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockSchedule);

      expect(received?.id).toBe('schedule-1');
      expect(received?.unit).toBe('mr');
      expect(service.currentSchedule()).toBeDefined();
    });

    it('should set error and notify on API failure', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let errored = false;
      let failure: unknown = null;

      service.loadSchedule('invalid-id').subscribe({
        next: () => {},
        error: (err) => {
          errored = true;
          failure = err;
        }
      });

      httpMock.expectOne('/api/v1/schedules/invalid-id').flush(
        { message: 'Not found' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(errored).toBe(true);
      const apiError = failure as ApiError;
      expect(apiError.statusCode).toBe(404);
      expect(apiError.code).toBe('SERVER_ERROR');
      expect(service.error()).toBeTruthy();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should set loading state during request', () => {
      expect(service.isLoading()).toBe(false);

      service.loadSchedule('schedule-1').subscribe();

      expect(service.isLoading()).toBe(true);

      httpMock.expectOne('/api/v1/schedules/schedule-1').flush(mockSchedule);

      expect(service.isLoading()).toBe(false);
    });
  });

  describe('loadScheduleByUnit', () => {
    it('should load schedule by unit, month, and year', () => {
      let received: ScheduleResponse | null = null;
      service.loadScheduleByUnit('mr', 5, 2026).subscribe(schedule => { received = schedule; });

      const req = httpMock.expectOne(
        r => r.urlWithParams === '/api/v1/schedules/unit/mr?month=5&year=2026'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ ...mockSchedule, id: 'schedule-mr-2026-5' });

      expect(received?.unit).toBe('mr');
      expect(received?.month).toBe(5);
      expect(received?.year).toBe(2026);
    });

    it('should surface an error (rather than null) when the API fails', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let errored = false;
      let failure: unknown = null;

      service.loadScheduleByUnit('mr', 1, 2025).subscribe({
        next: () => {},
        error: (err) => {
          errored = true;
          failure = err;
        }
      });

      httpMock.expectOne(
        r => r.urlWithParams === '/api/v1/schedules/unit/mr?month=1&year=2025'
      ).flush(
        { message: 'Not found' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(errored).toBe(true);
      expect((failure as ApiError).statusCode).toBe(404);
      expect(service.error()).toBeTruthy();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('createSchedule', () => {
    it('should create schedule and update state', () => {
      const newSchedule = { ...mockSchedule, id: 'schedule-new', month: 6 };
      let received: ScheduleResponse | null = null;
      service.createSchedule({ unit: 'mr', month: 6, year: 2026 }).subscribe(schedule => { received = schedule; });

      const req = httpMock.expectOne('/api/v1/schedules');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ unit: 'mr', month: 6, year: 2026 });
      req.flush(newSchedule);

      expect(received?.id).toBe('schedule-new');
    });
  });

  describe('loadVersionHistory', () => {
    it('should throw an ApiError on API failure (no silent fallback)', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let failure: unknown = null;

      service.loadVersionHistory('schedule-1').subscribe({
        next: () => {},
        error: (err) => { failure = err; }
      });

      httpMock.expectOne('/api/v1/schedules/schedule-1/versions').flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect((failure as ApiError).code).toBe('SERVER_ERROR');
      expect(service.hasVersionHistoryError()).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should load version history on success', () => {
      const mockHistory: VersionHistoryResponse[] = [
        { version: 3, createdAt: '2026-05-05T00:00:00Z', createdBy: 'user-1' },
        { version: 2, createdAt: '2026-05-03T00:00:00Z', createdBy: 'user-1' },
        { version: 1, createdAt: '2026-05-01T00:00:00Z', createdBy: 'user-1' }
      ];

      let received: VersionHistoryResponse[] | null = null;
      service.loadVersionHistory('schedule-1').subscribe(history => { received = history; });

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/versions');
      req.flush(mockHistory);

      expect(received?.length).toBe(3);
      expect(service.versionHistory().length).toBe(3);
    });
  });

  describe('loadAuditLog', () => {
    it('should throw an ApiError on API failure (no silent fallback)', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let failure: unknown = null;

      service.loadAuditLog('schedule-1').subscribe({
        next: () => {},
        error: (err) => { failure = err; }
      });

      httpMock.expectOne('/api/v1/schedules/schedule-1/audit').flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect((failure as ApiError).code).toBe('SERVER_ERROR');
      expect(service.hasAuditLogError()).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('loadPendingApprovals', () => {
    it('should throw an ApiError on API failure (no silent fallback)', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let failure: unknown = null;

      service.loadPendingApprovals().subscribe({
        next: () => {},
        error: (err) => { failure = err; }
      });

      httpMock.expectOne('/api/v1/schedules/pending-approvals').flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect((failure as ApiError).code).toBe('SERVER_ERROR');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('assignPersonnel', () => {
    it('should assign personnel and update the current schedule', () => {
      const assignedSchedule: ScheduleResponse = {
        ...mockSchedule,
        version: 2,
        assignments: [{
          id: 'assignment-1',
          scheduleId: 'schedule-1',
          deviceId: 'mr-1',
          personnelId: 'personnel-1',
          shiftType: 'day',
          date: '2026-05-06',
          isConfirmed: false
        }],
      };

      let received: ScheduleResponse | null = null;
      service.assignPersonnel('schedule-1', {
        deviceId: 'mr-1',
        date: '2026-05-06',
        shiftType: 'day',
        personnelId: 'personnel-1'
      }, 'Test assignment').subscribe(schedule => { received = schedule; });

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/assignments');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        deviceId: 'mr-1',
        date: '2026-05-06',
        shiftType: 'day',
        personnelId: 'personnel-1',
        reason: 'Test assignment'
      });
      req.flush(assignedSchedule);

      expect(received?.assignments.length).toBe(1);
    });
  });
});