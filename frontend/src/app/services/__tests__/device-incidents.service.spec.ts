import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceIncidentsService, DeviceIncidentsResponse, DeviceIncident } from '../device-incidents.service';

describe('DeviceIncidentsService', () => {
  let service: DeviceIncidentsService;
  let httpMock: HttpTestingController;

  const mockIncident: DeviceIncident = {
    id: 'incident-1',
    userId: 'user-1',
    unitId: 'unit-1',
    deviceId: 'device-1',
    issueType: 'arıza',
    severity: 'high',
    description: 'Cihaz çalışmıyor',
    imageUrl: null,
    status: 'open',
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: { id: 'user-1', name: 'Tekniker', role: 'technician' },
    unit: { id: 'unit-1', name: 'MR', organizationId: 'org-1' },
    device: { id: 'device-1', name: 'MR Cihazı', code: 'MR-01' },
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
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

  describe('getIncidents', () => {
    it('should fetch incidents with default params', () => {
      let received: DeviceIncidentsResponse | null = null;
      service.getIncidents().subscribe((res) => { received = res; });

      const req = httpMock.expectOne('/api/v1/device-incidents');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockIncident], total: 1 });

      expect(received?.data.length).toBe(1);
    });

    it('should pass filter params through as query params', () => {
      let received: DeviceIncidentsResponse | null = null;
      service.getIncidents({ status: 'open', severity: 'critical' }).subscribe((res) => { received = res; });

      const req = httpMock.expectOne(
        (r) => r.urlWithParams === '/api/v1/device-incidents?status=open&severity=critical'
      );
      expect(req.request.urlWithParams).toContain('status=open');
      expect(req.request.urlWithParams).toContain('severity=critical');
      req.flush({ data: [], total: 0 });

      expect(received?.total).toBe(0);
    });
  });

  describe('getIncident', () => {
    it('should fetch a single incident by id', () => {
      let receivedId: string | null = null;
      service.getIncident('incident-1').subscribe((incident) => { receivedId = incident.id; });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockIncident);

      expect(receivedId).toBe('incident-1');
    });
  });

  describe('createIncident', () => {
    it('should create a device incident', () => {
      const payload = {
        unitId: 'unit-1',
        issueType: 'arıza',
        severity: 'high' as const,
        description: 'Cihaz çalışmıyor',
      };

      let received: DeviceIncident | null = null;
      service.createIncident(payload).subscribe((incident) => { received = incident; });

      const req = httpMock.expectOne('/api/v1/device-incidents');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockIncident);

      expect(received?.id).toBe('incident-1');
      expect(received?.issueType).toBe('arıza');
    });

    it('should forward optional deviceId and imageUrl', () => {
      const payload = {
        unitId: 'unit-1',
        deviceId: 'device-1',
        issueType: 'bakım',
        severity: 'low' as const,
        description: 'Periyodik bakım',
        imageUrl: 'https://example.com/photo.jpg',
      };

      service.createIncident(payload).subscribe();

      const req = httpMock.expectOne('/api/v1/device-incidents');
      expect(req.request.body.imageUrl).toBe('https://example.com/photo.jpg');
      expect(req.request.body.deviceId).toBe('device-1');
      req.flush(mockIncident);
    });
  });

  describe('updateIncident', () => {
    it('should patch incident fields', () => {
      const updates = { description: 'Güncellendi' };

      let received: DeviceIncident | null = null;
      service.updateIncident('incident-1', updates).subscribe((incident) => { received = incident; });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(updates);
      req.flush({ ...mockIncident, ...updates });

      expect(received).toBeDefined();
    });
  });

  describe('updateStatus', () => {
    it('should patch the incident status', () => {
      let receivedStatus: string | null = null;
      service.updateStatus('incident-1', 'resolved').subscribe((incident) => { receivedStatus = incident.status; });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1/status');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'resolved' });
      req.flush({ ...mockIncident, status: 'resolved' });

      expect(receivedStatus).toBe('resolved');
    });
  });
});