// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceApiService } from '../../core/api/device-api.service';
import { NotificationService } from '../../services/notification.service';
import { ApiService } from '../../core/api/api.service';

describe('DeviceApiService Integration Tests', () => {
  let service: DeviceApiService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const mockDevicesResponse = (devices: unknown[]) => ({ devices, total: devices.length });

  const device = (id: string, name: string) => ({
    id,
    code: id,
    name,
    mode: 'vardiya' as const,
    tripleShift: false,
    isActive: true,
    unit: 'mr' as const,
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
    it('should load devices from API and update state', async () => {
      const promise = firstValueFrom(service.loadDevices({ unit: 'mr' }));

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/devices'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('unit=mr');
      req.flush(mockDevicesResponse([device('mr-1', 'A BLOK MR'), device('mr-2', 'B BLOK MR')]));

      const response = await promise;
      expect(response.devices.length).toBe(2);
      expect(service.devices().length).toBe(2);
    });

    it('should return an empty result object on API failure', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.loadDevices()).catch((e) => e);

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/devices'));
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      const errorPayload = await promise;
      expect(errorPayload).toEqual({ devices: [], total: 0 });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should set loading state during request', async () => {
      const promise = firstValueFrom(service.loadDevices());

      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/devices'));
      req.flush(mockDevicesResponse([]));

      await promise;
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('getDevicesForUnit', () => {
    it('should fetch and cache devices for a unit', async () => {
      const promise = firstValueFrom(service.getDevicesForUnit('mr'));

      const req = httpMock.expectOne('/api/v1/devices/unit/mr');
      expect(req.request.method).toBe('GET');
      req.flush(mockDevicesResponse([device('mr-1', 'A BLOK MR'), device('mr-2', 'B BLOK MR')]));

      const devices = await promise;
      expect(devices.length).toBe(2);
      expect(devices[0].unit).toBe('mr');
    });

    it('should return cached result on second call without re-fetching', async () => {
      const first = firstValueFrom(service.getDevicesForUnit('mr'));

      const req = httpMock.expectOne('/api/v1/devices/unit/mr');
      req.flush(mockDevicesResponse([device('mr-1', 'A BLOK MR')]));

      await first;
      const second = await firstValueFrom(service.getDevicesForUnit('mr'));
      expect(second.length).toBe(1);
    });

    it('should surface an error on API failure', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error');

      const promise = firstValueFrom(service.getDevicesForUnit('mr')).catch((e) => e);

      const req = httpMock.expectOne('/api/v1/devices/unit/mr');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      const err = await promise;
      expect(err.code).toBe('DEVICE_LOAD_ERROR');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('should clear all cached devices', async () => {
      const promise = firstValueFrom(service.loadDevices());

      const req = httpMock.expectOne((r) => r.url.startsWith('/api/v1/devices'));
      req.flush(mockDevicesResponse([device('mr-1', 'A BLOK MR'), device('mr-2', 'B BLOK MR')]));

      await promise;
      expect(service.devices().length).toBe(2);

      service.clearCache();
      expect(service.devices().length).toBe(0);
    });
  });
});