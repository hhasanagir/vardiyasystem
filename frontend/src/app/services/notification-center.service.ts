import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import {
  NotificationsApiService,
  NotificationRecipientInfo,
  NotificationPreferences,
  UnreadCountByType,
} from './notifications-api.service';
import { WebSocketService, WsNotification } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class NotificationCenterService implements OnDestroy {
  private api = inject(NotificationsApiService);
  private ws = inject(WebSocketService);

  private wsSub: Subscription;
  private destroy$ = new Subject<void>();

  readonly notifications = signal<NotificationRecipientInfo[]>([]);
  readonly unreadCount = signal(0);
  readonly unreadByType = signal<UnreadCountByType[]>([]);
  readonly preferences = signal<NotificationPreferences | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly totalPages = signal(0);
  readonly filterType = signal<string | undefined>(undefined);
  readonly filterRead = signal<boolean | undefined>(undefined);

  readonly hasMore = computed(() => this.page() < this.totalPages());

  constructor() {
    this.wsSub = this.ws.notification$.subscribe((n: WsNotification) => {
      if (n.id) {
        this.unreadCount.update((c) => c + 1);
        this.loadNotifications();
      }
    });
    this.loadUnreadCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.wsSub) this.wsSub.unsubscribe();
  }

  loadNotifications(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .getMyNotifications({
        page: this.page(),
        limit: this.limit(),
        type: this.filterType(),
        isRead: this.filterRead(),
      })
      .subscribe({
        next: (res) => {
          this.notifications.set(res.data ?? []);
          this.total.set(res.meta?.total ?? 0);
          this.totalPages.set(res.meta?.totalPages ?? 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Bildirimler yüklenemedi');
          this.loading.set(false);
        },
      });
  }

  loadUnreadCount(): void {
    this.api.getUnreadCount().subscribe({
      next: (res) => {
        this.unreadCount.set(res.count);
      },
    });
    this.api.getUnreadByType().subscribe({
      next: (res) => {
        this.unreadByType.set(res);
      },
    });
  }

  setPage(p: number): void {
    this.page.set(p);
    this.loadNotifications();
  }

  setFilterType(type?: string): void {
    this.filterType.set(type);
    this.page.set(1);
    this.loadNotifications();
  }

  setFilterRead(isRead?: boolean): void {
    this.filterRead.set(isRead);
    this.page.set(1);
    this.loadNotifications();
  }

  markRead(id: string): void {
    this.api.markRead(id).subscribe({
      next: () => {
        this.notifications.update((items) =>
          items.map((n) =>
            n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
          ),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAllRead(): void {
    this.api.markAllRead().subscribe({
      next: () => {
        this.notifications.update((items) =>
          items.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })),
        );
        this.unreadCount.set(0);
      },
    });
  }

  delete(id: string): void {
    this.api.delete(id).subscribe({
      next: () => {
        const deleted = this.notifications().find((n) => n.id === id);
        this.notifications.update((items) => items.filter((n) => n.id !== id));
        this.total.update((t) => t - 1);
        if (deleted && !deleted.isRead) {
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }
      },
    });
  }

  loadPreferences(): void {
    this.api.getPreferences().subscribe({
      next: (prefs) => this.preferences.set(prefs),
    });
  }

  updatePreferences(prefs: Partial<NotificationPreferences>): void {
    this.api.updatePreferences(prefs).subscribe({
      next: (updated) => this.preferences.set(updated),
    });
  }
}
