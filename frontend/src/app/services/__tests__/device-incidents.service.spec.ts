// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceIncidentsService } from '../device-incidents.service';

describe('DeviceIncidentsService', () => {
  let service: DeviceIncidentsService;
  let httpMock: HttpTestingController;

  const mockIncident = {
    id: 'incident-1',
    userId: 'user-1',
    unitId: 'unit-1',
    deviceId: 'device-1',
    issueType: 'arıza',
    severity: 'high' as const,
    description: 'Cihaz çalışmıyor',
    imageUrl: null,
    status: 'open' as const,
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: { id: 'user-1', name: 'Tekniker', role: 'technician' },
    unit: { id: 'unit-1', name: 'MR', organizationId: 'org-1' },
    device: { id: 'device-1', name: 'MR Cihazı', code: 'MR-01' },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DeviceIncidentsService],
    });
    service = TestBed.inject(DeviceIncidentsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeDefined();
  });

  it('should create an incident with a POST to /api/v1/device-incidents', async () => {
    const payload = {
      unitId: 'unit-1',
      issueType: 'arıza' as const,
      severity: 'high' as const,
      description: 'Cihaz çalışmıyor',
    };

    const promise = firstValueFrom(service.createIncident(payload));

    const req = httpMock.expectOne('/api/v1/device-incidents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(mockIncident);

    const incident = await promise;
    expect(incident.id).toBe('incident-1');
  });

  it('should send optional deviceId and imageUrl on create', async () => {
    const payload = {
      unitId: 'unit-1',
      deviceId: 'device-1',
      issueType: 'bakım ihtiyacı' as const,
      severity: 'low' as const,
      description: 'Periyodik bakım',
      imageUrl: 'https://example.com/photo.jpg',
    };

    const promise = firstValueFrom(service.createIncident(payload));

    const req = httpMock.expectOne('/api/v1/device-incidents');
    expect(req.request.body.deviceId).toBe('device-1');
    expect(req.request.body.imageUrl).toBe('https://example.com/photo.jpg');
    req.flush({ ...mockIncident, ...payload });

    await promise;
  });

  it('should fetch incidents from /api/v1/device-incidents', async () => {
    const promise = firstValueFrom(service.getIncidents({}));

    const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/device-incidents'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: [mockIncident], total: 1 });

    const res = await promise;
    expect(res.data.length).toBe(1);
    expect(res.total).toBe(1);
  });

  it('should serialize filter params into the query string', async () => {
    const promise = firstValueFrom(service.getIncidents({ status: 'open', severity: 'critical' }));

    const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/device-incidents'));
    expect(req.request.url).toContain('status=open');
    expect(req.request.url).toContain('severity=critical');
    req.flush({ data: [], total: 0 });

    await promise;
  });

  it('should fetch a single incident by id', async () => {
    const promise = firstValueFrom(service.getIncident('incident-1'));

    const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
    expect(req.request.method).toBe('GET');
    req.flush(mockIncident);

    const incident = await promise;
    expect(incident.id).toBe('incident-1');
  });

  it('should update incident fields with a PATCH', async () => {
    const updates = { description: 'Güncellendi' };

    const promise = firstValueFrom(service.updateIncident('incident-1', updates));

    const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updates);
    req.flush({ ...mockIncident, ...updates });

    const incident = await promise;
    expect(incident.description).toBe('Güncellendi');
  });

  it('should update incident status via the status endpoint', async () => {
    const promise = firstValueFrom(service.updateStatus('incident-1', 'resolved'));

    const req = httpMock.expectOne('/api/v1/device-incidents/incident-1/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'resolved' });
    req.flush({ ...mockIncident, status: 'resolved' });

    const incident = await promise;
    expect(incident.status).toBe('resolved');
  });
});