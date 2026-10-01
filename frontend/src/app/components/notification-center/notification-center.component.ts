import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationCenterService } from '../../services/notification-center.service';
import { NotificationRecipientInfo } from '../../services/notifications-api.service';
import { AuthService } from '../../services/auth.service';

type FilterTab = 'all' | 'unread' | string;

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notif-page">
      <div class="notif-header">
        <h1>Bildirimler</h1>
        <div class="notif-header-actions">
          <span class="notif-total">{{ service.total() }} bildirim</span>
          @if (service.unreadCount() > 0) {
            <button class="btn-text" (click)="service.markAllRead()">Tümünü Okundu İşaretle</button>
          }
        </div>
      </div>

      <div class="notif-filters">
        <div class="filter-tabs">
          @for (tab of filterTabs; track tab.key) {
            <button
              class="filter-tab"
              [class.active]="activeTab() === tab.key"
              (click)="setFilter(tab.key)"
            >
              {{ tab.label }}
              @if (tab.key === 'unread' && service.unreadCount() > 0) {
                <span class="tab-badge">{{ service.unreadCount() }}</span>
              }
              @if (tab.key === 'all' && service.total() > 0) {
                <span class="tab-badge muted">{{ service.total() }}</span>
              }
            </button>
          }
        </div>
        <div class="filter-type">
          <select
            [ngModel]="selectedType()"
            (ngModelChange)="filterByType($event)"
            class="type-select"
          >
            <option value="">Tüm Türler</option>
            @for (t of notifTypes; track t.value) {
              <option [value]="t.value">{{ t.label }}</option>
            }
          </select>
        </div>
      </div>

      @if (service.loading()) {
        <div class="notif-loading">
          <div class="spinner"></div>
          <span>Bildirimler yükleniyor...</span>
        </div>
      } @else if (service.error(); as err) {
        <div class="notif-error">{{ err }}</div>
      } @else if (service.notifications().length === 0) {
        <div class="notif-empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <h3>Bildirim bulunamadı</h3>
          <p>Henüz size gönderilmiş bir bildirim yok.</p>
        </div>
      } @else {
        <div class="notif-list">
          @for (item of service.notifications(); track item.id) {
            <div
              class="notif-item"
              [class.unread]="!item.isRead"
              [class]="'priority-' + item.notification.priority.toLowerCase()"
            >
              <div class="notif-indicator" [class.read]="item.isRead"></div>
              <div class="notif-content">
                <div class="notif-head">
                  <span class="notif-type-badge" [class]="'type-' + item.notification.type">{{
                    typeLabel(item.notification.type)
                  }}</span>
                  <span
                    class="notif-priority"
                    [class]="'prio-' + item.notification.priority.toLowerCase()"
                  >
                    {{ priorityLabel(item.notification.priority) }}
                  </span>
                  <span class="notif-time">{{ timeAgo(item.notification.createdAt) }}</span>
                </div>
                <h4 class="notif-title">{{ item.notification.title }}</h4>
                <p class="notif-msg">{{ item.notification.message }}</p>
              </div>
              <div class="notif-actions">
                @if (!item.isRead) {
                  <button
                    class="btn-icon"
                    (click)="service.markRead(item.id)"
                    title="Okundu işaretle"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                }
                <button class="btn-icon danger" (click)="confirmDelete(item)" title="Sil">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                  </svg>
                </button>
              </div>
            </div>
          }
        </div>

        @if (service.totalPages() > 1) {
          <div class="notif-pagination">
            <button
              class="btn-page"
              [disabled]="service.page() <= 1"
              (click)="service.setPage(service.page() - 1)"
            >
              Önceki
            </button>
            <span class="page-info">Sayfa {{ service.page() }} / {{ service.totalPages() }}</span>
            <button
              class="btn-page"
              [disabled]="!service.hasMore()"
              (click)="service.setPage(service.page() + 1)"
            >
              Sonraki
            </button>
          </div>
        }

        @if (deletingId()) {
          <div class="delete-confirm-overlay" (click)="cancelDelete()">
            <div class="delete-confirm" (click)="$event.stopPropagation()">
              <p>Bu bildirimi silmek istediğinize emin misiniz?</p>
              <div class="delete-actions">
                <button class="btn-secondary" (click)="cancelDelete()">İptal</button>
                <button class="btn-danger" (click)="doDelete()">Sil</button>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .notif-page {
        max-width: 800px;
        margin: 0 auto;
        padding: 24px;
      }
      .notif-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .notif-header h1 {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }
      .notif-header-actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .notif-total {
        font-size: 13px;
        color: var(--text-muted);
      }
      .btn-text {
        background: none;
        border: none;
        color: var(--accent-mr);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
      }
      .btn-text:hover {
        background: var(--bg-hover);
      }
      .notif-filters {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        gap: 12px;
      }
      .filter-tabs {
        display: flex;
        gap: 4px;
      }
      .filter-tab {
        padding: 6px 14px;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-subtle);
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .filter-tab.active {
        background: var(--accent-mr);
        color: white;
        border-color: var(--accent-mr);
      }
      .tab-badge {
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.2);
      }
      .tab-badge.muted {
        background: var(--bg-hover);
        color: var(--text-muted);
      }
      .type-select {
        padding: 6px 12px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 12px;
      }
      .notif-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 60px 0;
        color: var(--text-muted);
      }
      .spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--border-subtle);
        border-top-color: var(--accent-mr);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .notif-error {
        padding: 20px;
        text-align: center;
        color: var(--status-error);
        background: var(--status-error-bg);
        border-radius: var(--radius-lg);
      }
      .notif-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 60px 0;
        color: var(--text-muted);
        svg {
          opacity: 0.4;
          margin-bottom: 12px;
        }
        h3 {
          margin: 0 0 6px;
          color: var(--text-secondary);
        }
        p {
          margin: 0;
          font-size: 13px;
        }
      }
      .notif-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .notif-item {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        transition: all var(--transition-fast);
      }
      .notif-item.unread {
        background: rgba(59, 130, 246, 0.05);
        border-color: rgba(59, 130, 246, 0.15);
      }
      .notif-item.priority-critical {
        border-left: 3px solid var(--status-error);
      }
      .notif-item.priority-high {
        border-left: 3px solid #f59e0b;
      }
      .notif-indicator {
        width: 8px;
        min-width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-mr);
        margin-top: 6px;
      }
      .notif-indicator.read {
        background: transparent;
      }
      .notif-content {
        flex: 1;
        min-width: 0;
      }
      .notif-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        flex-wrap: wrap;
      }
      .notif-type-badge {
        padding: 2px 8px;
        border-radius: var(--radius-full);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        background: var(--bg-hover);
        color: var(--text-muted);
      }
      .notif-priority {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .prio-critical {
        color: var(--status-error);
      }
      .prio-high {
        color: #f59e0b;
      }
      .prio-normal {
        color: var(--text-muted);
      }
      .prio-low {
        color: var(--text-muted);
      }
      .notif-time {
        margin-left: auto;
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
      }
      .notif-title {
        margin: 0 0 2px;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .notif-msg {
        margin: 0;
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .notif-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
        justify-content: flex-start;
      }
      .btn-icon {
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px;
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        display: flex;
      }
      .btn-icon:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .btn-icon.danger:hover {
        background: var(--status-error-bg);
        color: var(--status-error);
      }
      .notif-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 20px 0;
      }
      .btn-page {
        padding: 8px 16px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
      }
      .btn-page:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .btn-page:hover:not(:disabled) {
        background: var(--bg-hover);
      }
      .page-info {
        font-size: 13px;
        color: var(--text-muted);
      }
      .delete-confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .delete-confirm {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        padding: 24px;
        max-width: 360px;
        width: 90%;
        p {
          margin: 0 0 16px;
          color: var(--text-primary);
          font-size: 14px;
        }
      }
      .delete-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .btn-secondary {
        padding: 8px 16px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
      }
      .btn-danger {
        padding: 8px 16px;
        border-radius: var(--radius-md);
        border: none;
        background: var(--status-error);
        color: white;
        cursor: pointer;
      }
      @media (max-width: 768px) {
        .notif-page {
          padding: 12px;
        }
        .notif-filters {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
})
export class NotificationCenterComponent implements OnInit {
  service = inject(NotificationCenterService);
  private auth = inject(AuthService);

  activeTab = signal<FilterTab>('all');
  selectedType = signal('');
  deletingId = signal<string | null>(null);

  readonly filterTabs = [
    { key: 'all' as FilterTab, label: 'Tümü' },
    { key: 'unread' as FilterTab, label: 'Okunmamış' },
  ];

  readonly notifTypes = [
    { value: 'SCHEDULE_CHANGED', label: 'Vardiya Değişikliği' },
    { value: 'SCHEDULE_APPROVED', label: 'Vardiya Onayı' },
    { value: 'SCHEDULE_REJECTED', label: 'Vardiya Reddi' },
    { value: 'SHIFT_SWAP_REQUESTED', label: 'Değişim Talebi' },
    { value: 'SHIFT_SWAP_APPROVED', label: 'Değişim Onayı' },
    { value: 'SHIFT_SWAP_REJECTED', label: 'Değişim Reddi' },
    { value: 'TRAINING_ASSIGNED', label: 'Eğitim Ataması' },
    { value: 'TRAINING_EXPIRING', label: 'Eğitim Süresi Doluyor' },
    { value: 'TRAINING_EXPIRED', label: 'Eğitim Süresi Doldu' },
    { value: 'CERTIFICATION_EXPIRING', label: 'Sertifika Süresi Doluyor' },
    { value: 'CERTIFICATION_EXPIRED', label: 'Sertifika Süresi Doldu' },
    { value: 'DEVICE_INCIDENT', label: 'Cihaz Arızası' },
    { value: 'DEVICE_INCIDENT_CRITICAL', label: 'Kritik Arıza' },
    { value: 'SYSTEM_ANNOUNCEMENT', label: 'Duyuru' },
    { value: 'ROLE_ASSIGNED', label: 'Rol Ataması' },
    { value: 'PERMISSION_CHANGED', label: 'Yetki Değişikliği' },
    { value: 'ATTENDANCE_ALERT', label: 'Devamsızlık Uyarısı' },
    { value: 'EMERGENCY_ALERT', label: 'Acil Durum' },
    { value: 'CLOCK_IN_REMINDER', label: 'Giriş Hatırlatıcısı' },
    { value: 'SCHEDULE_REMINDER', label: 'Vardiya Hatırlatıcısı' },
  ];

  ngOnInit(): void {
    this.service.loadNotifications();
    this.service.loadPreferences();
  }

  setFilter(key: FilterTab): void {
    this.activeTab.set(key);
    if (key === 'all') this.service.setFilterRead(undefined);
    else if (key === 'unread') this.service.setFilterRead(false);
    else this.service.setFilterType(key);
  }

  filterByType(type: string): void {
    this.selectedType.set(type);
    this.service.setFilterType(type || undefined);
  }

  typeLabel(type: string): string {
    return this.notifTypes.find((t) => t.value === type)?.label || type;
  }

  priorityLabel(p: string): string {
    const labels: Record<string, string> = {
      LOW: 'Düşük',
      NORMAL: 'Normal',
      HIGH: 'Yüksek',
      CRITICAL: 'Kritik',
    };
    return labels[p] || p;
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'şimdi';
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} gün önce`;
    return new Date(dateStr).toLocaleDateString('tr-TR');
  }

  confirmDelete(item: NotificationRecipientInfo): void {
    this.deletingId.set(item.id);
  }

  cancelDelete(): void {
    this.deletingId.set(null);
  }

  doDelete(): void {
    const id = this.deletingId();
    if (id) {
      this.service.delete(id);
      this.deletingId.set(null);
    }
  }
}
