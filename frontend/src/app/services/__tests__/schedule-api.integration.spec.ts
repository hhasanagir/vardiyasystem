import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScheduleService } from '../schedule.service';
import { NotificationService } from '../../services/notification.service';
import { ApiService } from '../../core/api/api.service';

describe('ScheduleService Integration Tests', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const mockApiResponse = <T>(data: T) => ({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });

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
    it('should load schedule from API and update state', (done) => {
      const mockSchedule = {
        id: 'schedule-1',
        unit: 'mr' as const,
        month: 5,
        year: 2026,
        status: 'draft' as const,
        version: 1,
        assignments: [],
        createdBy: 'user-1',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z'
      };

      service.loadSchedule('schedule-1').subscribe(schedule => {
        expect(schedule).toBeDefined();
        expect(schedule?.id).toBe('schedule-1');
        expect(schedule?.unit).toBe('mr');
        expect(service.currentSchedule()).toBeDefined();
        done();
      });

      const req = httpMock.expectOne('/api/schedules/schedule-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockApiResponse(mockSchedule));
    });

    it('should set error and notify on API failure', (done) => {
      spyOn(notificationService, 'error');

      service.loadSchedule('invalid-id').subscribe({
        next: () => done(new Error('Should have errored')),
        error: (err) => {
          expect(err).toBeDefined();
          expect(service.error()).toBeTruthy();
          expect(notificationService.error).toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/schedules/invalid-id');
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    });

    it('should set loading state during request', (done) => {
      expect(service.isLoading()).toBe(false);

      service.loadSchedule('schedule-1').subscribe();

      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne('/api/schedules/schedule-1');
      req.flush(mockApiResponse({ id: 'schedule-1', unit: 'mr', month: 5, year: 2026, status: 'draft', version: 1, assignments: [], createdBy: '', createdAt: '', updatedAt: '' }));

      setTimeout(() => {
        expect(service.isLoading()).toBe(false);
        done();
      });
    });
  });

  describe('loadScheduleByUnit', () => {
    it('should load schedule by unit, month, and year', (done) => {
      const mockSchedule = {
        id: 'schedule-mr-2026-5',
        unit: 'mr' as const,
        month: 5,
        year: 2026,
        status: 'draft' as const,
        version: 1,
        assignments: [],
        createdBy: 'user-1',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z'
      };

      service.loadScheduleByUnit('mr', 5, 2026).subscribe(schedule => {
        expect(schedule).toBeDefined();
        expect(schedule?.unit).toBe('mr');
        expect(schedule?.month).toBe(5);
        expect(schedule?.year).toBe(2026);
        done();
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/schedules/unit/mr'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('month')).toBe('5');
      expect(req.request.params.get('year')).toBe('2026');
      req.flush(mockApiResponse(mockSchedule));
    });

    it('should handle 404 as null (no schedule exists)', (done) => {
      service.loadScheduleByUnit('mr', 1, 2025).subscribe(schedule => {
        expect(schedule).toBeNull();
        done();
      });

      const req = httpMock.expectOne('/api/schedules/unit/mr');
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    });
  });

  describe('createSchedule', () => {
    it('should create schedule and update state', (done) => {
      const newSchedule = {
        id: 'schedule-new',
        unit: 'mr' as const,
        month: 6,
        year: 2026,
        status: 'draft' as const,
        version: 1,
        assignments: [],
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      service.createSchedule({ unit: 'mr', month: 6, year: 2026 }).subscribe(schedule => {
        expect(schedule).toBeDefined();
        expect(schedule?.id).toBe('schedule-new');
        done();
      });

      const req = httpMock.expectOne('/api/schedules');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ unit: 'mr', month: 6, year: 2026 });
      req.flush(mockApiResponse(newSchedule));
    });
  });

  describe('loadVersionHistory', () => {
    it('should throw error on API failure (no silent fallback)', (done) => {
      spyOn(notificationService, 'error');

      service.loadVersionHistory('schedule-1').subscribe({
        next: () => done(new Error('Should have errored')),
        error: (err) => {
          expect(err).toBeDefined();
          expect(err.code).toBe('VERSION_HISTORY_ERROR');
          expect(notificationService.error).toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/schedules/schedule-1/versions');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });

    it('should load version history on success', (done) => {
      const mockHistory = [
        { version: 3, createdAt: '2026-05-05T00:00:00Z', createdBy: 'user-1' },
        { version: 2, createdAt: '2026-05-03T00:00:00Z', createdBy: 'user-1' },
        { version: 1, createdAt: '2026-05-01T00:00:00Z', createdBy: 'user-1' }
      ];

      service.loadVersionHistory('schedule-1').subscribe(history => {
        expect(history.length).toBe(3);
        expect(service.versionHistory().length).toBe(3);
        done();
      });

      const req = httpMock.expectOne('/api/schedules/schedule-1/versions');
      req.flush(mockApiResponse(mockHistory));
    });
  });

  describe('loadAuditLog', () => {
    it('should throw error on API failure (no silent fallback)', (done) => {
      spyOn(notificationService, 'error');

      service.loadAuditLog('schedule-1').subscribe({
        next: () => done(new Error('Should have errored')),
        error: (err) => {
          expect(err).toBeDefined();
          expect(err.code).toBe('AUDIT_LOG_ERROR');
          expect(notificationService.error).toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/schedules/schedule-1/audit');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });
  });

  describe('loadPendingApprovals', () => {
    it('should throw error on API failure (no silent fallback)', (done) => {
      spyOn(notificationService, 'error');

      service.loadPendingApprovals().subscribe({
        next: () => done(new Error('Should have errored')),
        error: (err) => {
          expect(err).toBeDefined();
          expect(err.code).toBe('PENDING_APPROVALS_ERROR');
          expect(notificationService.error).toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/approvals/pending');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });
  });

  describe('assignPersonnel', () => {
    it('should assign personnel and update current schedule', (done) => {
      const mockSchedule = {
        id: 'schedule-1',
        unit: 'mr' as const,
        month: 5,
        year: 2026,
        status: 'draft' as const,
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
        createdBy: 'user-1',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: new Date().toISOString()
      };

      service.assignPersonnel('schedule-1', {
        deviceId: 'mr-1',
        date: '2026-05-06',
        shiftType: 'day',
        personnelId: 'personnel-1'
      }, 'Test assignment').subscribe(schedule => {
        expect(schedule).toBeDefined();
        expect(schedule?.assignments.length).toBe(1);
        done();
      });

      const req = httpMock.expectOne('/api/schedules/schedule-1/assignments');
      expect(req.request.method).toBe('POST');
      req.flush(mockApiResponse(mockSchedule));
    });
  });
});
