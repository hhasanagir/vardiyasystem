import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';

/**
 * Phase 5C.18 — FE-01: ApiService transport regression guard.
 *
 * Previously the get/post/put/delete wrappers accepted no request options and
 * silently dropped them, so ScheduleService could never get `expectedVersion`
 * into the outgoing request. These tests assert the REAL outgoing HTTP request
 * (via HttpTestingController) carries forwarded params for every wrapper, while
 * default headers are still applied for existing callers.
 */
describe('Phase 5C.18 — FE-01 ApiService forwards request options', () => {
  let api: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: { getToken: () => null } }],
    });

    api = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('get forwards params into the outgoing request', () => {
    api.get<any>('/schedules/s-1', { params: { expectedVersion: '3' } }).subscribe();

    const req: TestRequest = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/s-1?expectedVersion=3');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('expectedVersion')).toBe('3');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush({});
  });

  it('post forwards params into the outgoing request', () => {
    api.post<any>('/schedules/s-1/assignments', { deviceId: 'd-1' }, { params: { expectedVersion: '3' } }).subscribe();

    const req: TestRequest = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/s-1/assignments?expectedVersion=3');
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('expectedVersion')).toBe('3');
    expect(req.request.body).toEqual({ deviceId: 'd-1' });
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush({});
  });

  it('put forwards params into the outgoing request', () => {
    api.put<any>('/schedules/s-1/assignments/a-1', { reason: 'güncelle' }, { params: { expectedVersion: '5' } }).subscribe();

    const req: TestRequest = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/s-1/assignments/a-1?expectedVersion=5');
    expect(req.request.method).toBe('PUT');
    expect(req.request.params.get('expectedVersion')).toBe('5');
    expect(req.request.body).toEqual({ reason: 'güncelle' });
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush({});
  });

  it('delete forwards params into the outgoing request', () => {
    api.delete<any>('/schedules/s-1/assignments/a-1', { params: { expectedVersion: '2', reason: 'silme' } }).subscribe();

    const req: TestRequest = httpMock.expectOne((r) => r.urlWithParams === '/api/v1/schedules/s-1/assignments/a-1?expectedVersion=2&reason=silme');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('expectedVersion')).toBe('2');
    expect(req.request.params.get('reason')).toBe('silme');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush({});
  });

  it('existing callers keep identical behavior when NO options are passed (default headers applied)', () => {
    api.post<any>('/schedules/s-1/assignments', { deviceId: 'd-1' }).subscribe();

    const req: TestRequest = httpMock.expectOne('/api/v1/schedules/s-1/assignments');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    expect(req.request.params.get('expectedVersion')).toBeNull();
    req.flush({});
  });
});