import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PwaService } from '../pwa.service';

describe('PwaService', () => {
  let service: PwaService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PwaService],
    });
    service = TestBed.inject(PwaService);
  });

  it('should be created', () => {
    expect(service).toBeDefined();
  });

  it('should start with navigator online status', () => {
    expect(service.isOnline()).toBe(navigator.onLine);
  });

  it('should have installable initially false', () => {
    expect(service.isInstallable()).toBe(false);
  });

  it('should have isInstalled initially false', () => {
    expect(service.isInstalled()).toBe(false);
  });

  it('should dismiss install prompt', () => {
    service.dismissInstallPrompt();
    expect(service.isInstallable()).toBe(false);
  });

  describe('requestNotificationPermission', () => {
    it('should return false when Notification API is not available', async () => {
      const originalNotification = (window as any).Notification;
      (window as any).Notification = undefined;

      const result = await service.requestNotificationPermission();
      expect(result).toBe(false);

      (window as any).Notification = originalNotification;
    });

    it('should return true when already granted', async () => {
      const originalPermission = Notification.permission;
      Object.defineProperty(Notification, 'permission', {
        get: () => 'granted',
        configurable: true,
      });

      const result = await service.requestNotificationPermission();
      expect(result).toBe(true);

      Object.defineProperty(Notification, 'permission', {
        get: () => originalPermission,
        configurable: true,
      });
    });
  });

  describe('sendNotification', () => {
    it('should not throw when called', () => {
      expect(() => service.sendNotification('Test', { body: 'Test body' })).not.toThrow();
    });
  });
});
