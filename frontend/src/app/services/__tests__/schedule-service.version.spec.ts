import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScheduleService } from '../schedule.service';
import { NotificationService } from '../../services/notification.service';
import { ApiService } from '../../core/api/api.service';

/**
 * Phase 5C.18 — FE-01: legacy ScheduleService mirrors the optimistic-concurrency
 * contract of the DDD scheduler.
 *
 * All six legacy assignment mutations must send the server-known
 * `expectedVersion` (taken ONLY from loaded schedule state, never manufactured
 * client-side) and must surface a backend 409 SCHEDULE_VERSION_CONFLICT through
 * the existing shared ConflictDialog contract (ConflictDetails) instead of
 * silently overwriting a concurrent edit.
 *
 * The outgoing HTTP request itself (via HttpTestingController) is inspected, so
 * the ScheduleService -> ApiService -> HttpClient chain is verified end to end.
 * Responses use the real direct ScheduleResponse contract (NO {success,data}
 * envelope) to mirror what the actual backend returns.
 */
describe('Phase 5C.18 — FE-01 legacy schedule expectedVersion', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;

  const scheduleOf = (id: string, version: number, overrides: any = {}) => ({
    id,
    unit: 'mr' as const,
    month: 5,
    year: 2026,
    status: 'draft' as const,
    version,
    assignments: [],
    createdBy: 'user-1',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  });

  const assignmentPayload = {
    deviceId: 'd-1',
    date: '2026-05-10',
    shiftType: 'day',
    personnelId: 'p-1',
    startTime: '08:00',
    endTime: '16:00',
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ScheduleService, ApiService, NotificationService],
    });

    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function loadSchedule(id: string, version: number): void {
    service.loadSchedule(id).subscribe();
    httpMock.expectOne(`/api/v1/schedules/${id}`).flush(scheduleOf(id, version));
  }

  function queryOf(req: import('@angular/common/http/testing').TestRequest): URLSearchParams {
    return new URL(req.request.urlWithParams, 'http://localhost').searchParams;
  }

  it('assignPersonnel sends expectedVersion from the loaded schedule version', () => {
    loadSchedule('schedule-1', 3);

    service.assignPersonnel('schedule-1', assignmentPayload, 'x').subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments?expectedVersion=3');
    expect(req.request.method).toBe('POST');
    expect(queryOf(req).get('expectedVersion')).toBe('3');
    req.flush(scheduleOf('schedule-1', 4));
  });

  it('directAssign sends expectedVersion for the matching unit/month/year', () => {
    loadSchedule('schedule-1', 7);

    service.directAssign('mr', 5, 2026, { ...assignmentPayload }).subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/direct-assign?expectedVersion=7');
    expect(req.request.method).toBe('POST');
    expect(queryOf(req).get('expectedVersion')).toBe('7');
    req.flush(scheduleOf('schedule-1', 8));
  });

  it('removeAssignment sends expectedVersion together with reason', () => {
    loadSchedule('schedule-1', 2);

    service.removeAssignment('schedule-1', 'a-1', 'silme').subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments/a-1?reason=silme&expectedVersion=2');
    expect(req.request.method).toBe('DELETE');
    expect(queryOf(req).get('expectedVersion')).toBe('2');
    expect(queryOf(req).get('reason')).toBe('silme');
    req.flush(scheduleOf('schedule-1', 3));
  });

  it('updateAssignment sends expectedVersion', () => {
    loadSchedule('schedule-1', 5);

    service.updateAssignment('schedule-1', 'a-1', assignmentPayload, 'güncelle').subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments/a-1?expectedVersion=5');
    expect(req.request.method).toBe('PUT');
    expect(queryOf(req).get('expectedVersion')).toBe('5');
    req.flush(scheduleOf('schedule-1', 6));
  });

  it('assignPersonShift sends expectedVersion', () => {
    loadSchedule('schedule-1', 4);

    service.assignPersonShift('schedule-1', {
      personnelId: 'p-2',
      personnelGroupId: 'g-1',
      shiftTemplateId: 't-1',
      unitId: 'u-1',
      date: '2026-05-11',
      shiftType: 'night',
      startTime: '20:00',
      endTime: '08:00',
    }, 'nöbet').subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments?expectedVersion=4');
    expect(req.request.method).toBe('POST');
    expect(queryOf(req).get('expectedVersion')).toBe('4');
    req.flush(scheduleOf('schedule-1', 5));
  });

  it('overridePersonShift sends expectedVersion', () => {
    loadSchedule('schedule-1', 9);

    service.overridePersonShift('schedule-1', {
      personnelId: 'p-2',
      personnelGroupId: 'g-1',
      shiftTemplateId: 't-1',
      unitId: 'u-1',
      date: '2026-05-11',
      shiftType: 'night',
      startTime: '20:00',
      endTime: '08:00',
    }, 'acil', ['augmenting']).subscribe();
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments/override?expectedVersion=9');
    expect(req.request.method).toBe('POST');
    expect(queryOf(req).get('expectedVersion')).toBe('9');
    req.flush(scheduleOf('schedule-1', 10));
  });

  it('sends NO expectedVersion when no matching schedule is loaded (no client-manufactured version)', () => {
    service.assignPersonnel('unknown-schedule', assignmentPayload, 'x').subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/unknown-schedule/assignments');
    expect(queryOf(req).get('expectedVersion')).toBeNull();
    req.flush(scheduleOf('unknown-schedule', 1));
  });

  it('surfaces a 409 via ConflictDetails (shared dialog) without overwriting local state', () => {
    loadSchedule('schedule-1', 3);

    service.assignPersonnel('schedule-1', assignmentPayload, 'x').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments?expectedVersion=3');
    req.flush(
      {
        message: 'Optimistic locking conflict: expected version 3, actual version changed',
        error: 'SCHEDULE_VERSION_CONFLICT',
        statusCode: 409,
        localVersion: 3,
        scheduleId: 'schedule-1',
      },
      { status: 409, statusText: 'Conflict' },
    );

    expect(service.conflictVisible()).toBe(true);
    expect(service.conflictDetails()?.localVersion).toBe(3);
    expect(service.conflictDetails()?.scheduleId).toBe('schedule-1');
    expect(service.conflictDetails()?.serverVersion).toBeUndefined();
    // Local schedule must NOT be silently updated by the failed mutation.
    expect(service.currentSchedule()?.version).toBe(3);
  });

  it('concurrent mutations always send the freshest server-known version (no stale expectedVersion)', () => {
    loadSchedule('schedule-1', 1);

    // First mutation succeeds and the server response carries version 2.
    service.assignPersonnel('schedule-1', assignmentPayload, 'x').subscribe();
    const first = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments?expectedVersion=1');
    first.flush(scheduleOf('schedule-1', 2));

    // Second mutation must use version 2, not the original 1.
    service.removeAssignment('schedule-1', 'a-1', 'sonra').subscribe();
    const second = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments/a-1?reason=sonra&expectedVersion=2');
    expect(queryOf(second).get('expectedVersion')).toBe('2');
    second.flush(scheduleOf('schedule-1', 3));
  });

  it('clearConflict resets the shared dialog state', () => {
    loadSchedule('schedule-1', 3);
    service.assignPersonnel('schedule-1', assignmentPayload, 'x').subscribe({ error: () => {} });
    const req = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/schedule-1/assignments?expectedVersion=3');
    req.flush({ error: 'SCHEDULE_VERSION_CONFLICT', statusCode: 409, localVersion: 3, scheduleId: 'schedule-1' }, { status: 409, statusText: 'Conflict' });

    expect(service.conflictVisible()).toBe(true);
    service.clearConflict();
    expect(service.conflictVisible()).toBe(false);
    expect(service.conflictDetails()).toBeNull();
  });
});