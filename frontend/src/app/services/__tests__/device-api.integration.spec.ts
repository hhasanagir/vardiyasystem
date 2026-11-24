import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceApiService } from '../../core/api/device-api.service';
import type { Device, DeviceListResponse, DeviceApiError } from '../../core/api/device-api.service';
import { NotificationService } from '../notification.service';
import { ApiService } from '../../core/api/api.service';

describe('DeviceApiService Integration Tests', () => {
  let service: DeviceApiService;
  let httpMock: HttpTestingController;
  let notificationService: NotificationService;

  const mockDevices: Device[] = [
    { id: 'mr-1', code: 'A-FUJ-MR', name: 'A BLOK MR', mode: 'vardiya', tripleShift: false, isActive: true, unit: 'mr' },
    { id: 'mr-2', code: 'B-PHI-MR', name: 'B BLOK MR', mode: 'vardiya', tripleShift: false, isActive: true, unit: 'mr' }
  ];

  beforeEach(() => {
    TestBed.resetTestingModule();
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
    it('should load devices from API and update state', () => {
      let received: DeviceListResponse | null = null;
      service.loadDevices({ unit: 'mr' }).subscribe(response => { received = response; });

      const req = httpMock.expectOne(r => r.urlWithParams === '/api/v1/devices?unit=mr');
      expect(req.request.method).toBe('GET');
      req.flush({ devices: mockDevices, total: 2 } satisfies DeviceListResponse);

      expect(received?.devices.length).toBe(2);
      expect(service.devices().length).toBe(2);
    });

    it('should rethrow the empty fallback on API failure', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let errored = false;
      let failure: unknown = null;

      service.loadDevices().subscribe({
        next: () => {},
        error: (err) => {
          errored = true;
          failure = err;
        }
      });

      httpMock.expectOne(r => r.url.startsWith('/api/v1/devices')).flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(errored).toBe(true);
      const fallback = failure as { devices: unknown[]; total: number };
      expect(fallback.devices).toEqual([]);
      expect(fallback.total).toBe(0);
      expect(errorSpy).toHaveBeenCalled();
      expect(service.loadError()).toBeTruthy();
    });

    it('should set loading state during request', () => {
      expect(service.isLoading()).toBe(false);

      service.loadDevices().subscribe();

      expect(service.isLoading()).toBe(true);

      httpMock.expectOne(r => r.url.startsWith('/api/v1/devices')).flush({
        devices: [],
        total: 0,
      } satisfies DeviceListResponse);

      expect(service.isLoading()).toBe(false);
    });
  });

  describe('getDevicesForUnit', () => {
    it('should fetch and cache devices for a unit', () => {
      let received: Device[] | null = null;
      service.getDevicesForUnit('mr').subscribe(devices => { received = devices; });

      const req = httpMock.expectOne('/api/v1/devices/unit/mr');
      expect(req.request.method).toBe('GET');
      req.flush({ devices: mockDevices, total: 2 } satisfies DeviceListResponse);

      expect(received?.length).toBe(2);
      expect(received?.[0].unit).toBe('mr');
    });

    it('should return cached result on second call without re-fetching', () => {
      const singleDevice = [mockDevices[0]];

      let first: Device[] | null = null;
      service.getDevicesForUnit('mr').subscribe(devices => { first = devices; });

      httpMock.expectOne('/api/v1/devices/unit/mr').flush({
        devices: singleDevice,
        total: 1,
      } satisfies DeviceListResponse);

      expect(first?.length).toBe(1);

      let second: Device[] | null = null;
      service.getDevicesForUnit('mr').subscribe(devices => { second = devices; });

      expect(second?.length).toBe(1);

      // afterEach httpMock.verify() confirms NO second request was issued.
    });

    it('should throw a DeviceApiError on API failure and retry the next call', () => {
      const errorSpy = vi.spyOn(notificationService, 'error');
      let firstError: DeviceApiError | null = null;

      service.getDevicesForUnit('mr').subscribe({
        next: () => {},
        error: (err) => { firstError = err as DeviceApiError; }
      });

      httpMock.expectOne('/api/v1/devices/unit/mr').flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(firstError?.code).toBe('DEVICE_LOAD_ERROR');
      expect(firstError?.unit).toBe('mr');
      expect(errorSpy).toHaveBeenCalled();
      expect(service.loadError()).toBeTruthy();

      // The shared replay resets on error, so a later call re-fetches (retry).
      let secondError: DeviceApiError | null = null;
      service.getDevicesForUnit('mr').subscribe({
        next: () => {},
        error: (err) => { secondError = err as DeviceApiError; }
      });

      httpMock.expectOne('/api/v1/devices/unit/mr').flush(
        { message: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(secondError?.code).toBe('DEVICE_LOAD_ERROR');
    });

    it('should set loading state during request', () => {
      expect(service.isLoading()).toBe(false);

      service.getDevicesForUnit('mr').subscribe();

      expect(service.isLoading()).toBe(true);

      httpMock.expectOne('/api/v1/devices/unit/mr').flush({
        devices: [],
        total: 0,
      } satisfies DeviceListResponse);

      expect(service.isLoading()).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached devices', () => {
      let received: DeviceListResponse | null = null;
      service.loadDevices().subscribe(response => { received = response; });

      httpMock.expectOne(r => r.url.startsWith('/api/v1/devices')).flush({
        devices: mockDevices,
        total: 2,
      } satisfies DeviceListResponse);

      expect(received?.devices.length).toBe(2);
      expect(service.devices().length).toBe(2);

      service.clearCache();
      expect(service.devices().length).toBe(0);
    });
  });
});