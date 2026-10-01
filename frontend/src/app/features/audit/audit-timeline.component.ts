import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ScheduleService } from '../../services/schedule.service';
import type {
  AuditLogEntry,
  AuditTimelineSummary as TimelineSummary,
} from '../../domain/models/audit-log';

interface SuspiciousActivity {
  id: string;
  type:
    | 'multiple_failed_logins'
    | 'off_hours_access'
    | 'bulk_operation'
    | 'unauthorized_attempt'
    | 'data_export';
  label: string;
  description: string;
  risk: 'high' | 'medium' | 'low';
  time: string;
  user: string;
  count: number;
}

@Component({
  selector: 'app-audit-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      @if (errorMessage()) {
        <div class="error-state" style="margin-bottom: 16px;">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>{{ errorMessage() }}</p>
          <button class="btn btn-ghost btn-sm" (click)="errorMessage.set(null)">Kapat</button>
        </div>
      }

      <!-- Suspicious Activity Cards -->
      @if (suspiciousActivities().length > 0) {
        <section class="card" style="margin-bottom: 16px; border-color: rgba(239,68,68,0.2);">
          <div class="card-header">
            <h3>Şüpheli Aktiviteler</h3>
            <span class="badge badge-error">{{ suspiciousActivities().length }}</span>
          </div>
          <div class="grid-auto" style="margin-top: 8px;">
            @for (act of suspiciousActivities(); track act.id) {
              <div class="suspicious-card" [class]="'risk-' + act.risk">
                <div class="suspicious-top">
                  <span class="suspicious-icon" [class]="act.risk">{{
                    getRiskIcon(act.risk)
                  }}</span>
                  <span
                    class="badge"
                    [class.badge-error]="act.risk === 'high'"
                    [class.badge-warning]="act.risk === 'medium'"
                    [class.badge-neutral]="act.risk === 'low'"
                  >
                    {{ act.risk === 'high' ? 'Yüksek' : act.risk === 'medium' ? 'Orta' : 'Düşük' }}
                  </span>
                </div>
                <span class="suspicious-title">{{ act.label }}</span>
                <span class="suspicious-desc">{{ act.description }}</span>
                <div class="suspicious-meta">
                  <span class="suspicious-user">{{ act.user }}</span>
                  <span class="suspicious-time">{{ act.time }}</span>
                  <span class="suspicious-count">{{ act.count }} kez</span>
                </div>
              </div>
            }
          </div>
        </section>
      }

      <!-- Filter Bar -->
      <section class="filter-bar glass">
        <div class="filter-group">
          <label>Başlangıç</label>
          <input
            class="input"
            type="date"
            [(ngModel)]="filters.startDate"
            (change)="applyFilters()"
          />
        </div>
        <div class="filter-group">
          <label>Bitiş</label>
          <input
            class="input"
            type="date"
            [(ngModel)]="filters.endDate"
            (change)="applyFilters()"
          />
        </div>
        <div class="filter-group">
          <label>İşlem Türü</label>
          <select class="select" [(ngModel)]="filters.action" (change)="applyFilters()">
            <option value="">Tümü</option>
            <option value="CREATE">Oluşturma</option>
            <option value="UPDATE">Güncelleme</option>
            <option value="DELETE">Silme</option>
            <option value="SUBMIT_FOR_REVIEW">İncelemeye Sunma</option>
            <option value="APPROVE">Onaylama</option>
            <option value="REJECT">Reddetme</option>
            <option value="PUBLISH">Yayınlama</option>
            <option value="ARCHIVE">Arşivleme</option>
            <option value="ROLLBACK">Geri Alma</option>
            <option value="ASSIGN">Atama</option>
            <option value="UNASSIGN">Atama Kaldırma</option>
            <option value="LOGIN">Giriş</option>
            <option value="LOGOUT">Çıkış</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Gösterim</label>
          <select class="select" [(ngModel)]="filters.limit" (change)="applyFilters()">
            <option [value]="50">50 kayıt</option>
            <option [value]="100">100 kayıt</option>
            <option [value]="200">200 kayıt</option>
            <option [value]="500">500 kayıt</option>
          </select>
        </div>
      </section>

      <!-- Summary -->
      @if (summary()) {
        <section class="grid-4" style="margin-bottom: 16px;">
          <div class="card" style="text-align: center;">
            <div class="summary-value">{{ summary()!.totalEntries }}</div>
            <div class="summary-label">Toplam İşlem</div>
          </div>
          <div class="card" style="text-align: center;">
            <div class="summary-value" style="color: var(--status-error);">
              {{ summary()!.flaggedCount }}
            </div>
            <div class="summary-label">Bayraklanan</div>
          </div>
          <div class="card" style="text-align: center;">
            <div class="summary-value" style="color: var(--accent-mr);">
              {{ Object.keys(summary()!.byUser).length }}
            </div>
            <div class="summary-label">Aktif Kullanıcı</div>
          </div>
          <div class="card" style="text-align: center;">
            <div class="summary-value" style="color: var(--accent-nukleer);">
              {{ Object.keys(summary()!.byEntity).length }}
            </div>
            <div class="summary-label">Varlık Türü</div>
          </div>
        </section>
      }

      <!-- Timeline -->
      <section class="card">
        @if (isLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Yükleniyor...</span>
          </div>
        } @else if (entries().length === 0) {
          <div class="empty-state">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <h3>Henüz kayıt bulunamadı</h3>
            <p>Seçilen kriterlere uygun denetim günlüğü bulunmamaktadır.</p>
          </div>
        } @else {
          <div class="timeline-entries">
            @for (entry of entries(); track entry.id) {
              <div class="timeline-entry" [class.flagged]="entry.isFlagged">
                <div class="timeline-dot" [class]="entry.action"></div>
                <div class="timeline-content">
                  <div class="entry-header">
                    <span class="action-badge" [class]="'action-' + entry.action">{{
                      entry.actionLabel
                    }}</span>
                    <span class="entry-time">{{ formatDate(entry.timestamp) }}</span>
                    @if (entry.isFlagged) {
                      <span class="badge badge-error">Bayraklı</span>
                    }
                  </div>
                  <div class="entry-body">
                    <div class="entry-row">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>{{ entry.userName }}</span>
                    </div>
                    <div class="entry-row">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      <span>{{ entry.entityTypeLabel }}</span>
                      @if (entry.entityId) {
                        <span class="text-muted">({{ entry.entityId }})</span>
                      }
                    </div>
                    @if (entry.changes.length > 0) {
                      <div class="entry-changes">
                        @for (change of entry.changes.slice(0, 3); track $index) {
                          <div class="change-row">
                            <span class="change-field">{{ change.field }}</span>
                            <span class="change-arrow">&rarr;</span>
                            <span class="change-value">{{ change.newValue }}</span>
                            <span class="change-type" [class]="change.changeType">{{
                              change.changeType
                            }}</span>
                          </div>
                        }
                        @if (entry.changes.length > 3) {
                          <div class="change-more">+{{ entry.changes.length - 3 }} daha</div>
                        }
                      </div>
                    }
                    @if (entry.ipAddress) {
                      <div class="entry-row" style="margin-top: 4px;">
                        <span class="text-muted">IP: {{ entry.ipAddress }}</span>
                      </div>
                    }
                  </div>
                  <div class="entry-actions">
                    <button
                      class="btn btn-ghost btn-sm"
                      (click)="toggleFlag(entry)"
                      [title]="entry.isFlagged ? 'Bayrağı Kaldır' : 'Bayrakla'"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        [attr.fill]="entry.isFlagged ? 'currentColor' : 'none'"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .filter-bar {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 16px;
        padding: 16px;
        border-radius: var(--radius-lg);
      }
      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .filter-group label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .filter-group input,
      .filter-group select {
        min-width: 140px;
      }

      .summary-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--accent-mr);
      }
      .summary-label {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .suspicious-card {
        padding: 14px;
        background: var(--bg-hover);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .suspicious-card.risk-high {
        border-color: rgba(239, 68, 68, 0.3);
      }
      .suspicious-card.risk-medium {
        border-color: rgba(245, 158, 11, 0.3);
      }
      .suspicious-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .suspicious-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
      }
      .suspicious-icon.high {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .suspicious-icon.medium {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .suspicious-icon.low {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .suspicious-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .suspicious-desc {
        font-size: 11px;
        color: var(--text-muted);
      }
      .suspicious-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 10px;
        color: var(--text-muted);
      }
      .suspicious-user {
        color: var(--text-secondary);
      }
      .suspicious-count {
        margin-left: auto;
      }

      .timeline-entries {
      }
      .timeline-entry {
        display: flex;
        gap: 14px;
        padding: 14px 0;
        border-bottom: 1px solid var(--border-subtle);
        position: relative;
      }
      .timeline-entry:last-child {
        border-bottom: none;
      }
      .timeline-entry.flagged {
        background: rgba(239, 68, 68, 0.04);
        margin: 0 -16px;
        padding: 14px 16px;
        border-radius: var(--radius-md);
        border-bottom-color: transparent;
      }
      .timeline-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-top: 6px;
        flex-shrink: 0;
      }
      .timeline-dot.CREATE {
        background: var(--status-success);
      }
      .timeline-dot.UPDATE {
        background: var(--status-info);
      }
      .timeline-dot.DELETE {
        background: var(--status-error);
      }
      .timeline-dot.APPROVE {
        background: var(--status-success);
      }
      .timeline-dot.REJECT {
        background: var(--status-error);
      }
      .timeline-dot.PUBLISH {
        background: var(--accent-nukleer);
      }
      .timeline-dot.ARCHIVE {
        background: var(--text-muted);
      }
      .timeline-dot.ROLLBACK {
        background: var(--status-warning);
      }
      .timeline-dot.SUBMIT_FOR_REVIEW {
        background: var(--status-info);
      }
      .timeline-dot.ASSIGN {
        background: #06b6d4;
      }
      .timeline-dot.UNASSIGN {
        background: #f97316;
      }
      .timeline-dot.LOGIN {
        background: #8b5cf6;
      }
      .timeline-dot.LOGOUT {
        background: #6b7280;
      }

      .timeline-content {
        flex: 1;
        min-width: 0;
      }
      .entry-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .action-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .action-CREATE {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-UPDATE {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .action-DELETE {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .action-APPROVE {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-REJECT {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .action-PUBLISH {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
      }
      .action-ARCHIVE {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .action-ROLLBACK {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .action-SUBMIT_FOR_REVIEW {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .action-ASSIGN {
        background: rgba(6, 182, 212, 0.15);
        color: #22d3ee;
      }
      .action-UNASSIGN {
        background: rgba(249, 115, 22, 0.15);
        color: #fb923c;
      }
      .action-LOGIN {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;
      }
      .action-LOGOUT {
        background: rgba(107, 114, 128, 0.15);
        color: #9ca3af;
      }
      .entry-time {
        font-size: 11px;
        color: var(--text-muted);
        margin-left: auto;
      }

      .entry-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .entry-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--text-primary);
      }
      .text-muted {
        color: var(--text-muted);
        font-size: 12px;
      }
      .entry-changes {
        margin-top: 6px;
        padding: 8px;
        background: var(--bg-hover);
        border-radius: var(--radius-sm);
      }
      .change-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 2px 0;
      }
      .change-field {
        color: var(--text-secondary);
        min-width: 100px;
      }
      .change-arrow {
        color: var(--text-muted);
      }
      .change-value {
        color: var(--text-primary);
      }
      .change-type {
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 10px;
        text-transform: uppercase;
        margin-left: auto;
      }
      .change-type.added {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .change-type.removed {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .change-type.modified {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .change-more {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 4px;
        cursor: pointer;
      }
      .entry-actions {
        display: flex;
        gap: 4px;
        margin-top: 6px;
      }
    `,
  ],
})
export class AuditTimelineComponent implements OnInit, OnDestroy {
  private scheduleApi = inject(ScheduleService);
  private destroy$ = new Subject<void>();
  readonly Object = Object;

  filters = { startDate: '', endDate: '', action: '', limit: 100 };
  entries = signal<AuditLogEntry[]>([]);
  summary = signal<TimelineSummary | null>(null);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  readonly suspiciousActivities = signal<SuspiciousActivity[]>([
    {
      id: 's1',
      type: 'off_hours_access',
      label: 'Mesai Dışı Erişim',
      description: 'Kullanıcı mesai saatleri dışında sisteme erişti',
      risk: 'high',
      time: '02:34',
      user: 'Ali R.',
      count: 3,
    },
    {
      id: 's2',
      type: 'multiple_failed_logins',
      label: 'Başarısız Giriş Denemeleri',
      description: 'Ardışık başarısız kimlik doğrulama',
      risk: 'high',
      time: '14:20',
      user: 'Bilinmeyen',
      count: 5,
    },
    {
      id: 's3',
      type: 'bulk_operation',
      label: 'Toplu İşlem',
      description: 'Tek seferde çok sayıda atama değişikliği',
      risk: 'medium',
      time: '11:05',
      user: 'Mehmet D.',
      count: 12,
    },
  ]);

  ngOnInit() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.filters.endDate = now.toISOString().split('T')[0];
    this.filters.startDate = thirtyDaysAgo.toISOString().split('T')[0];
    this.loadTimeline();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTimeline(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.scheduleApi
      .loadAuditTimeline({
        startDate: this.filters.startDate || undefined,
        endDate: this.filters.endDate || undefined,
        limit: this.filters.limit,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.entries.set(response.entries);
          this.summary.set(response.summary);
          this.isLoading.set(false);
        },
        error: () => {
          this.errorMessage.set('Denetim kayıtları yüklenirken bir hata oluştu.');
          this.isLoading.set(false);
        },
      });
  }

  applyFilters(): void {
    this.loadTimeline();
  }
  refresh(): void {
    this.loadTimeline();
  }

  toggleFlag(entry: AuditLogEntry): void {
    entry.isFlagged = !entry.isFlagged;
    this.entries.update((entries) => [...entries]);
  }

  getRiskIcon(risk: string): string {
    return risk === 'high' ? '!' : risk === 'medium' ? '?' : '·';
  }

  formatDate(timestamp: Date | string): string {
    return new Date(timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
