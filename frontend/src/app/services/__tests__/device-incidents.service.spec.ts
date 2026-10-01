import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceIncidentsService } from '../device-incidents.service';

describe('DeviceIncidentsService', () => {
  let service: DeviceIncidentsService;
  let httpMock: HttpTestingController;

  const mockIncident = {
    id: 'incident-1',
    unitId: 'unit-1',
    deviceId: 'device-1',
    issueType: 'arıza',
    severity: 'high',
    description: 'Cihaz çalışmıyor',
    imageUrl: null,
    status: 'open',
    user: { id: 'user-1', name: 'Tekniker' },
    unit: { id: 'unit-1', name: 'MR' },
    device: { id: 'device-1', name: 'MR Cihazı', code: 'MR-01' },
    reportedAt: new Date().toISOString(),
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

  describe('create', () => {
    it('should create a device incident', (done) => {
      const payload = {
        unitId: 'unit-1',
        issueType: 'arıza' as const,
        severity: 'high' as const,
        description: 'Cihaz çalışmıyor',
      };

      service.create(payload).subscribe((incident) => {
        expect(incident).toBeDefined();
        expect(incident.id).toBe('incident-1');
        expect(incident.issueType).toBe('arıza');
        done();
      });

      const req = httpMock.expectOne('/api/v1/device-incidents');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockIncident);
    });

    it('should send optional deviceId and imageUrl', (done) => {
      const payload = {
        unitId: 'unit-1',
        deviceId: 'device-1',
        issueType: 'bakım' as const,
        severity: 'low' as const,
        description: 'Periyodik bakım',
        imageUrl: 'https://example.com/photo.jpg',
      };

      service.create(payload).subscribe(() => done());

      const req = httpMock.expectOne('/api/v1/device-incidents');
      expect(req.request.body.imageUrl).toBe('https://example.com/photo.jpg');
      expect(req.request.body.deviceId).toBe('device-1');
      req.flush({ ...mockIncident, ...payload });
    });
  });

  describe('getAll', () => {
    it('should fetch incidents with default params', (done) => {
      service.getAll({}).subscribe((res) => {
        expect(res.data).toBeDefined();
        expect(res.data.length).toBe(1);
        done();
      });

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/device-incidents'));
      expect(req.request.method).toBe('GET');
      req.flush({ data: [mockIncident], total: 1 });
    });

    it('should pass filter params', (done) => {
      service.getAll({ status: 'open', severity: 'critical' }).subscribe(() => done());

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/device-incidents') &&
        r.params.get('status') === 'open'
      );
      expect(req.request.params.get('status')).toBe('open');
      expect(req.request.params.get('severity')).toBe('critical');
      req.flush({ data: [], total: 0 });
    });
  });

  describe('getById', () => {
    it('should fetch single incident by id', (done) => {
      service.getById('incident-1').subscribe((incident) => {
        expect(incident.id).toBe('incident-1');
        done();
      });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockIncident);
    });
  });

  describe('update', () => {
    it('should update incident fields', (done) => {
      const updates = { description: 'Güncellendi' };

      service.update('incident-1', updates).subscribe((incident) => {
        expect(incident).toBeDefined();
        done();
      });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(updates);
      req.flush({ ...mockIncident, ...updates });
    });
  });

  describe('updateStatus', () => {
    it('should update incident status', (done) => {
      service.updateStatus('incident-1', 'resolved').subscribe((incident) => {
        expect(incident.status).toBe('resolved');
        done();
      });

      const req = httpMock.expectOne('/api/v1/device-incidents/incident-1/status');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'resolved' });
      req.flush({ ...mockIncident, status: 'resolved' });
    });
  });

  describe('getIssueTypes', () => {
    it('should return predefined issue types', () => {
      const types = service.getIssueTypes();
      expect(types).toContain('arıza');
      expect(types).toContain('bakım ihtiyacı');
      expect(types).toContain('cihaz offline');
      expect(types.length).toBe(6);
    });
  });

  describe('getSeverityLevels', () => {
    it('should return severity levels', () => {
      const levels = service.getSeverityLevels();
      expect(levels).toContain('low');
      expect(levels).toContain('critical');
    });
  });

  describe('getStatusLevels', () => {
    it('should return status levels', () => {
      const statuses = service.getStatusLevels();
      expect(statuses).toContain('open');
      expect(statuses).toContain('resolved');
    });
  });
});
