// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScheduleService } from '../schedule.service';
import { NotificationService } from '../../services/notification.service';
import { ApiService } from '../../core/api/api.service';

describe('ScheduleService Integration Tests', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const mockSchedule = {
    id: 'schedule-1',
    unit: 'mr' as const,
    month: 5,
    year: 2026,
    status: 'draft' as const,
    version: 1,
    assignments: [],
    createdBy: { id: 'user-1', name: 'User 1', email: 'u@x.com' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  };

  beforeEach(() => {
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
    it('should load schedule from API and update state', async () => {
      const promise = firstValueFrom(service.loadSchedule('schedule-1'));

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockSchedule);

      const schedule = await promise;
      expect(schedule?.id).toBe('schedule-1');
      expect(schedule?.unit).toBe('mr');
      expect(service.currentSchedule()).toBeDefined();
    });

    it('should set error and notify on API failure', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadSchedule('invalid-id')).catch((e) => e);

      const req = httpMock.expectOne('/api/v1/schedules/invalid-id');
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });

      const err = await promise;
      expect(err).toBeDefined();
      expect(service.error()).toBeTruthy();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should set loading state during request', async () => {
      const promise = firstValueFrom(service.loadSchedule('schedule-1'));

      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1');
      req.flush(mockSchedule);

      await promise;
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('loadScheduleByUnit', () => {
    it('should load schedule by unit, month, and year', async () => {
      const promise = firstValueFrom(service.loadScheduleByUnit('mr', 5, 2026));

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/schedules/unit/mr'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('month=5');
      expect(req.request.url).toContain('year=2026');
      req.flush(mockSchedule);

      const schedule = await promise;
      expect(schedule?.unit).toBe('mr');
      expect(schedule?.month).toBe(5);
      expect(schedule?.year).toBe(2026);
    });

    it('should surface an error when no schedule exists', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadScheduleByUnit('mr', 1, 2025)).catch((e) => e);

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/schedules/unit/mr'));
      expect(req.request.url).toContain('month=1');
      expect(req.request.url).toContain('year=2025');
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });

      const err = await promise;
      expect(err).toBeDefined();
      expect(err.statusCode).toBe(404);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('createSchedule', () => {
    it('should create schedule and update state', async () => {
      const promise = firstValueFrom(service.createSchedule({ unit: 'mr', month: 6, year: 2026 }));

      const req = httpMock.expectOne('/api/v1/schedules');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ unit: 'mr', month: 6, year: 2026 });
      req.flush({ ...mockSchedule, month: 6, year: 2026 });

      const schedule = await promise;
      expect(schedule?.id).toBe('schedule-1');
    });
  });

  describe('loadVersionHistory', () => {
    it('should load version history on success', async () => {
      const mockHistory = [
        { version: 3, createdAt: '2026-05-05T00:00:00Z', createdBy: 'user-1' },
        { version: 2, createdAt: '2026-05-03T00:00:00Z', createdBy: 'user-1' },
        { version: 1, createdAt: '2026-05-01T00:00:00Z', createdBy: 'user-1' },
      ];

      const promise = firstValueFrom(service.loadVersionHistory('schedule-1'));

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/versions');
      req.flush(mockHistory);

      const history = await promise;
      expect(history.length).toBe(3);
      expect(service.versionHistory().length).toBe(3);
    });

    it('should surface an error on API failure (no silent fallback)', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadVersionHistory('schedule-1')).catch((e) => e);

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/versions');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      const err = await promise;
      expect(err).toBeDefined();
      expect(service.hasVersionHistoryError()).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('loadAuditLog', () => {
    it('should surface an error on API failure (no silent fallback)', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadAuditLog('schedule-1')).catch((e) => e);

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/audit');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      const err = await promise;
      expect(err).toBeDefined();
      expect(service.hasAuditLogError()).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('loadPendingApprovals', () => {
    it('should surface an error on API failure (no silent fallback)', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadPendingApprovals()).catch((e) => e);

      const req = httpMock.expectOne('/api/v1/schedules/pending-approvals');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      const err = await promise;
      expect(err).toBeDefined();
      expect(service.error()).toBeTruthy();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('assignPersonnel', () => {
    it('should assign personnel and update current schedule', async () => {
      const assignment = {
        deviceId: 'mr-1',
        date: '2026-05-06',
        shiftType: 'day',
        personnelId: 'personnel-1',
      };
      const withAssignment = {
        ...mockSchedule,
        version: 2,
        assignments: [{
          id: 'assignment-1',
          scheduleId: 'schedule-1',
          deviceId: 'mr-1',
          personnelId: 'personnel-1',
          shiftType: 'day',
          date: '2026-05-06',
          isConfirmed: false,
        }],
      };

      const promise = firstValueFrom(service.assignPersonnel('schedule-1', assignment, 'Test assignment'));

      const req = httpMock.expectOne('/api/v1/schedules/schedule-1/assignments');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ...assignment, reason: 'Test assignment' });
      req.flush(withAssignment);

      const schedule = await promise;
      expect(schedule?.assignments.length).toBe(1);
    });
  });
});