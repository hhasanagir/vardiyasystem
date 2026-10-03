// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { PwaService } from '../pwa.service';
import { SwPush } from '@angular/service-worker';

const FAKE_NOTIFICATION = class {
  static permission: NotificationPermission = 'default';
  static requestPermission(): Promise<NotificationPermission> {
    return Promise.resolve('granted');
  }
} as unknown as typeof Notification;

describe('PwaService', () => {
  let service: PwaService;

  beforeAll(() => {
    (globalThis as Record<string, unknown>)['Notification'] = FAKE_NOTIFICATION;
  });

  afterAll(() => {
    if ('Notification' in globalThis) {
      delete (globalThis as Record<string, unknown>)['Notification'];
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PwaService,
        {
          provide: SwPush,
          useValue: {
            isEnabled: false,
            notificationClicks: { subscribe: vi.fn() },
            requestSubscription: vi.fn(),
            unsubscribe: vi.fn(),
          },
        },
      ],
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
      if ('Notification' in globalThis) {
        delete (globalThis as Record<string, unknown>)['Notification'];
      }
      const result = await service.requestNotificationPermission();
      expect(result).toBe(false);
      (globalThis as Record<string, unknown>)['Notification'] = FAKE_NOTIFICATION;
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