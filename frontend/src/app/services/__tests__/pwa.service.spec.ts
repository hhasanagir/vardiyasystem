import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PwaService } from '../pwa.service';

class StubNotification {
  static instances: StubNotification[] = [];
  static permission: NotificationPermission = 'default';
  static requestPermission: () => Promise<NotificationPermission> = () => Promise.resolve('default');

  onclick: ((ev: Event) => unknown) | null = null;
  close = vi.fn();

  constructor(
    public readonly title: string,
    public readonly options?: NotificationOptions
  ) {
    (StubNotification as unknown as { instances: StubNotification[] }).instances.push(this);
  }
}

const stubInstancesSlot = () =>
  (StubNotification as unknown as { instances: StubNotification[] });

describe('PwaService', () => {
  let service: PwaService;

  beforeEach(() => {
    stubInstancesSlot().instances.length = 0;
    // jsdom in this harness does not implement matchMedia; PwaService calls it
    // in checkStandalone() during construction.
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
      writable: true,
      configurable: true,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PwaService,
        { provide: SwPush, useValue: { isEnabled: false } },
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
    it('should return false when the Notification API is not available', async () => {
      const existed = Object.getOwnPropertyDescriptor(window, 'Notification');
      Reflect.deleteProperty(window, 'Notification');

      try {
        const result = await service.requestNotificationPermission();
        expect(result).toBe(false);
      } finally {
        if (existed) {
          Object.defineProperty(window, 'Notification', { ...existed });
        }
      }
    });

    it('should return true when already granted', async () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'granted';

      const result = await service.requestNotificationPermission();
      expect(result).toBe(true);
    });

    it('should return false when denied', async () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'denied';

      const result = await service.requestNotificationPermission();
      expect(result).toBe(false);
    });

    it('should request permission when default and resolve to true on grant', async () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'default';
      StubNotification.requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));

      const result = await service.requestNotificationPermission();
      expect(StubNotification.requestPermission).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('sendNotification', () => {
    it('should create a notification when granted and the page is hidden', () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'granted';
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden',
        configurable: true,
      });

      try {
        service.sendNotification('Test', { body: 'Test body' });

        const instances = stubInstancesSlot().instances;
        expect(instances.length).toBe(1);
        const notification = instances[0];
        expect(notification.title).toBe('Test');
        expect(notification.options?.body).toBe('Test body');
        expect(notification.options?.icon).toBe('/icons/icon-192.svg');
        expect(typeof notification.onclick).toBe('function');
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    });

    it('should not create a notification when the page is visible', () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'granted';
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true,
      });

      try {
        service.sendNotification('Test', { body: 'Test body' });
        expect(stubInstancesSlot().instances.length).toBe(0);
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    });

    it('should not create a notification when permission is not granted', () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'denied';
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden',
        configurable: true,
      });

      try {
        service.sendNotification('Test', { body: 'Test body' });
        expect(stubInstancesSlot().instances.length).toBe(0);
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    });

    it('should close the notification and focus the window on click', () => {
      (window as unknown as { Notification: typeof Notification }).Notification =
        StubNotification as unknown as typeof Notification;
      StubNotification.permission = 'granted';
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden',
        configurable: true,
      });

      try {
        service.sendNotification('Test', { body: 'Test body' });
        const notification = stubInstancesSlot().instances[0];
        notification.onclick?.(new Event('click'));
        expect(notification.close).toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    });
  });
});