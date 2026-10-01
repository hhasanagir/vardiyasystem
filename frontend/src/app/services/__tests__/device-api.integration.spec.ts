import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DeviceApiService } from '../../core/api/device-api.service';
import { NotificationService } from '../../services/notification.service';
import { ApiService } from '../../core/api/api.service';

describe('DeviceApiService Integration Tests', () => {
  let service: DeviceApiService;
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
        DeviceApiService,
        ApiService,
        NotificationService,
      ]
    });

    service = TestBed.inject(DeviceApiService);
    httpMock = TestBed.inject(HttpTestingController);
    notificationService = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('loadDevices', () => {
    it('should load devices from API and update state', (done) => {
      const mockDevices = [
        { id: 'mr-1', code: 'A-FUJ-MR', name: 'A BLOK MR', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const },
        { id: 'mr-2', code: 'B-PHI-MR', name: 'B BLOK MR', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const }
      ];

      service.loadDevices({ unit: 'mr' }).subscribe(response => {
        expect(response.devices.length).toBe(2);
        expect(service.devices().length).toBe(2);
        done();
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/devices'));
      expect(req.request.method).toBe('GET');
      req.flush(mockApiResponse({ devices: mockDevices, total: 2 }));
    });

    it('should return empty on API failure', (done) => {
      spyOn(notificationService, 'error');

      service.loadDevices().subscribe(response => {
        expect(response.devices).toEqual([]);
        expect(response.total).toBe(0);
        expect(notificationService.error).toHaveBeenCalled();
        done();
      });

      const req = httpMock.expectOne('/api/devices');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });

    it('should set loading state during request', (done) => {
      expect(service.isLoading()).toBe(false);

      service.loadDevices().subscribe();

      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne('/api/devices');
      req.flush(mockApiResponse({ devices: [], total: 0 }));

      setTimeout(() => {
        expect(service.isLoading()).toBe(false);
        done();
      });
    });
  });

  describe('getDevicesForUnit', () => {
    it('should fetch and cache devices for a unit', (done) => {
      const mockDevices = [
        { id: 'mr-1', code: 'A-FUJ-MR', name: 'A BLOK MR', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const },
        { id: 'mr-2', code: 'B-PHI-MR', name: 'B BLOK MR', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const }
      ];

      service.getDevicesForUnit('mr').subscribe(devices => {
        expect(devices.length).toBe(2);
        expect(devices[0].unit).toBe('mr');
        done();
      });

      const req = httpMock.expectOne('/api/devices/unit/mr');
      expect(req.request.method).toBe('GET');
      req.flush(mockApiResponse({ devices: mockDevices, total: 2 }));
    });

    it('should return cached result on second call without re-fetching', (done) => {
      const mockDevices = [
        { id: 'mr-1', code: 'A-FUJ-MR', name: 'A BLOK MR', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const }
      ];

      // First call — triggers fetch
      service.getDevicesForUnit('mr').subscribe(() => {
        // Second call — should use cache, not trigger a new HTTP request
        service.getDevicesForUnit('mr').subscribe(devices => {
          expect(devices.length).toBe(1);
          done();
        });
      });

      const req = httpMock.expectOne('/api/devices/unit/mr');
      req.flush(mockApiResponse({ devices: mockDevices, total: 1 }));
    });

    it('should return empty array on API failure and cache the fallback', (done) => {
      spyOn(notificationService, 'error');

      service.getDevicesForUnit('mr').subscribe(devices => {
        expect(devices).toEqual([]);
        expect(notificationService.error).toHaveBeenCalled();
        done();
      });

      const req = httpMock.expectOne('/api/devices/unit/mr');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });

    it('should set loading state during request', () => {
      expect(service.isLoading()).toBe(false);

      service.getDevicesForUnit('mr').subscribe();

      expect(service.isLoading()).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached devices', (done) => {
      service.loadDevices().subscribe(() => {
        expect(service.devices().length).toBe(2);
        
        service.clearCache();
        expect(service.devices().length).toBe(0);
        done();
      });

      const req = httpMock.expectOne('/api/devices');
      req.flush(mockApiResponse({
        devices: [
          { id: 'mr-1', code: 'A', name: 'A', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const },
          { id: 'mr-2', code: 'B', name: 'B', mode: 'vardiya' as const, tripleShift: false, isActive: true, unit: 'mr' as const }
        ],
        total: 2
      }));
    });
  });
});
