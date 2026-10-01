import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { WebSocketService, WsNotification } from '../../services/websocket.service';
import { Subscription } from 'rxjs';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notifications-page">
      <header class="page-header">
        <div class="header-left">
          <h1>Bildirimler</h1>
          @if (unreadCount() > 0) {
            <span class="unread-badge">{{ unreadCount() }} okunmamış</span>
          }
        </div>
        <div class="header-right">
          @if (loading()) {
            <span class="loading-text">Yükleniyor...</span>
          }
          @if (unreadCount() > 0) {
            <button class="btn-text" (click)="markAllRead()">Tümünü Okundu İşaretle</button>
          }
          <button class="btn-text danger" (click)="clearAll()">Tümünü Temizle</button>
        </div>
      </header>

      <div class="filter-tabs">
        <button [class.active]="filter() === 'all'" (click)="filter.set('all')">Tümü</button>
        <button [class.active]="filter() === 'unread'" (click)="filter.set('unread')">
          Okunmamış
        </button>
        <button [class.active]="filter() === 'shift'" (click)="filter.set('shift')">Vardiya</button>
        <button [class.active]="filter() === 'swap'" (click)="filter.set('swap')">Değişim</button>
        <button [class.active]="filter() === 'leave'" (click)="filter.set('leave')">İzin</button>
      </div>

      @if (error()) {
        <div class="error-banner">
          <span>{{ error() }}</span>
          <button class="btn-text" (click)="loadNotifications()">Tekrar dene</button>
        </div>
      }

      @if (loading()) {
        <div class="notifications-list">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="skeleton-row">
              <div
                class="skeleton-shimmer"
                style="height:72px;border-radius:var(--radius-lg)"
              ></div>
            </div>
          }
        </div>
      } @else {
        <div class="notifications-list">
          @for (notification of filteredNotifications(); track notification.id) {
            <div
              class="notification-item"
              [class.unread]="!notification.isRead"
              (click)="markAsRead(notification)"
            >
              <div class="notification-icon" [class]="notification.type">
                @switch (notification.type) {
                  @case ('shift') {
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  }
                  @case ('swap') {
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                    </svg>
                  }
                  @case ('leave') {
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  }
                  @default {
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  }
                }
              </div>
              <div class="notification-content">
                <div class="notification-header">
                  <span class="notification-title">{{ notification.title }}</span>
                  <span class="notification-time">{{ getTimeAgo(notification.createdAt) }}</span>
                </div>
                <p class="notification-message">{{ notification.message }}</p>
                @if (notification.data) {
                  <div class="notification-data">
                    @for (key of objectKeys(notification.data); track key) {
                      <span class="data-item">
                        <span class="data-key">{{ key }}:</span>
                        <span class="data-value">{{ notification.data[key] }}</span>
                      </span>
                    }
                  </div>
                }
              </div>
              <button class="dismiss-btn" (click)="dismissNotification($event, notification.id)">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          } @empty {
            <div class="empty-state">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <h3>Bildirim yok</h3>
              <p>Yeni bildirimler burada görünecek</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .notifications-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .page-header h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
      }

      .unread-badge {
        padding: 4px 10px;
        background: rgba(239, 68, 68, 0.15);
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #f87171;
      }

      .header-right {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .loading-text {
        font-size: 0.75rem;
        color: #64748b;
      }

      .error-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        font-size: 0.8125rem;
        color: #f87171;
      }

      .btn-text {
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #94a3b8;
        font-size: 0.8125rem;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-text:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #e2e8f0;
      }

      .btn-text.danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
      }

      .filter-tabs {
        display: flex;
        gap: 0.5rem;
        padding: 4px;
        background: rgba(30, 41, 59, 0.4);
        border-radius: 10px;
        width: fit-content;
      }

      .filter-tabs button {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: #94a3b8;
        font-size: 0.8125rem;
        cursor: pointer;
        transition: all 0.2s;
      }

      .filter-tabs button:hover {
        color: #e2e8f0;
      }

      .filter-tabs button.active {
        background: rgba(99, 102, 241, 0.2);
        color: #a5b4fc;
      }

      .notifications-list {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow-y: auto;
      }

      .notification-item {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
      }

      .notification-item:hover {
        background: rgba(30, 41, 59, 0.6);
      }

      .notification-item.unread {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.2);
      }

      .notification-item.unread::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 3px;
        height: 60%;
        background: #6366f1;
        border-radius: 0 2px 2px 0;
      }

      .notification-icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .notification-icon.shift {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      .notification-icon.swap {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
      }

      .notification-icon.leave {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .notification-icon.info {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
      }

      .notification-content {
        flex: 1;
        min-width: 0;
      }

      .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 4px;
      }

      .notification-title {
        font-size: 0.9375rem;
        font-weight: 600;
        color: #e2e8f0;
      }

      .notification-time {
        font-size: 0.75rem;
        color: #64748b;
        white-space: nowrap;
      }

      .notification-message {
        font-size: 0.8125rem;
        color: #94a3b8;
        margin: 0;
        line-height: 1.5;
      }

      .notification-data {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }

      .data-item {
        padding: 4px 8px;
        background: rgba(15, 23, 42, 0.4);
        border-radius: 4px;
        font-size: 0.6875rem;
      }

      .data-key {
        color: #64748b;
        margin-right: 4px;
      }

      .data-value {
        color: #a5b4fc;
        font-weight: 500;
      }

      .dismiss-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #64748b;
        cursor: pointer;
        opacity: 0;
        transition: all 0.2s;
      }

      .notification-item:hover .dismiss-btn {
        opacity: 1;
      }

      .dismiss-btn:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
      }

      .skeleton-row {
        width: 100%;
      }
      .skeleton-row .skeleton-shimmer {
        width: 100%;
      }

      .empty-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: #64748b;
      }

      .empty-state svg {
        margin-bottom: 1rem;
        opacity: 0.5;
      }

      .empty-state h3 {
        font-size: 1.125rem;
        font-weight: 600;
        color: #94a3b8;
        margin: 0 0 0.5rem;
      }

      .empty-state p {
        font-size: 0.875rem;
        margin: 0;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private ws = inject(WebSocketService);

  notifications = signal<Notification[]>([]);
  filter = signal<'all' | 'unread' | 'shift' | 'swap' | 'leave'>('all');
  loading = signal(false);
  error = signal<string | null>(null);
  private wsSub: Subscription | null = null;

  filteredNotifications = computed(() => {
    const f = this.filter();
    const all = this.notifications();
    if (f === 'all') return all;
    if (f === 'unread') return all.filter((n) => !n.isRead);
    return all.filter((n) => n.type === f);
  });

  unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);

  objectKeys = Object.keys;

  ngOnInit() {
    this.loadNotifications();
    this.wsSub = this.ws.notification$.subscribe((n: WsNotification) => {
      this.notifications.update((list) => [
        {
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          data: n.data,
          isRead: false,
          createdAt: n.createdAt,
        },
        ...list,
      ]);
    });
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }

  loadNotifications() {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<{ data: Notification[]; total: number }>('/notifications').subscribe({
      next: (res) => {
        this.notifications.set(res.data || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Bildirimler yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  markAsRead(notification: Notification) {
    if (notification.isRead) return;
    this.api.post(`/notifications/${notification.id}/read`, {}).subscribe({
      error: () => {},
    });
    this.notifications.update((list) =>
      list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
    );
  }

  markAllRead() {
    this.api.post('/notifications/read-all', {}).subscribe({
      error: () => {},
    });
    this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
  }

  dismissNotification(event: Event, id: string) {
    event.stopPropagation();
    this.notifications.update((list) => list.filter((n) => n.id !== id));
  }

  clearAll() {
    this.api.post('/notifications/read-all', {}).subscribe({
      error: () => {},
    });
    this.notifications.set([]);
  }

  getTimeAgo(date: string): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} sa önce`;
    if (days < 7) return `${days} gün önce`;
    return new Date(date).toLocaleDateString('tr-TR');
  }
}
