import { Injectable, inject, signal, NgZone } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private swPush = inject(SwPush);
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  readonly installPrompt = signal<Event | null>(null);
  readonly isInstallable = signal(false);
  readonly isInstalled = signal(false);
  readonly isOnline = signal(navigator.onLine);
  readonly subscription = signal<PushSubscription | null>(null);

  private deferredPrompt: any = null;

  private readonly VAPID_PUBLIC_KEY =
    'BJmBEUlEpzbxsHEWjAAFuI-iKEJ171-JUZYmtVYBc-V84pBMyvqLDGtCeW__3I3OjaKYQ7TLpqOTQKuzCHLKNOc';

  constructor() {
    this.listenForInstallPrompt();
    this.listenForAppInstalled();
    this.listenForOnlineStatus();
    this.checkStandalone();
    this.subscribeToPush();
  }

  private listenForInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.zone.run(() => {
        this.installPrompt.set(e);
        this.isInstallable.set(true);
      });
    });
  }

  private listenForAppInstalled() {
    window.addEventListener('appinstalled', () => {
      this.zone.run(() => {
        this.isInstalled.set(true);
        this.isInstallable.set(false);
        this.deferredPrompt = null;
      });
    });
  }

  private listenForOnlineStatus() {
    window.addEventListener('online', () => this.zone.run(() => this.isOnline.set(true)));
    window.addEventListener('offline', () => this.zone.run(() => this.isOnline.set(false)));
  }

  private checkStandalone() {
    if (
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    ) {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
    }
  }

  promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return Promise.resolve(false);
    this.deferredPrompt.prompt();
    return this.deferredPrompt.userChoice.then((choice: { outcome: string }) => {
      this.deferredPrompt = null;
      this.isInstallable.set(false);
      return choice.outcome === 'accepted';
    });
  }

  dismissInstallPrompt() {
    this.isInstallable.set(false);
  }

  requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then((p) => p === 'granted');
  }

  private subscribeToPush() {
    if (!this.swPush.isEnabled) return;
    this.swPush.notificationClicks.subscribe(({ action, notification }) => {
      if (action === 'view-shifts') {
        window.location.href = '/app/my-shifts';
      }
    });
  }

  subscribeToNotifications(): Promise<boolean> {
    if (!this.swPush.isEnabled) return Promise.resolve(false);
    return this.requestNotificationPermission().then((granted) => {
      if (!granted) return false;
      return this.swPush
        .requestSubscription({ serverPublicKey: this.VAPID_PUBLIC_KEY })
        .then((sub) => {
          this.subscription.set(sub);
          return this.http
            .post('/api/v1/push-subscriptions', sub)
            .toPromise()
            .then(() => true);
        })
        .catch(() => false);
    });
  }

  unsubscribeFromNotifications(): Promise<boolean> {
    if (!this.swPush.isEnabled) return Promise.resolve(false);
    return this.swPush
      .unsubscribe()
      .then(() => {
        this.subscription.set(null);
        return true;
      })
      .catch(() => false);
  }

  sendNotification(title: string, options?: NotificationOptions) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    const n = new Notification(title, {
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-72.svg',
      ...options,
    });
    n.onclick = () => {
      n.close();
      window.focus();
    };
  }
}
