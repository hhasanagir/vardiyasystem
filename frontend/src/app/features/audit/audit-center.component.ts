import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize, catchError, of } from 'rxjs';
import { RouterModule } from '@angular/router';
import { AuditService } from '../../services/audit.service';
import { NotificationService } from '../../services/notification.service';
import type {
  AuditLogEntry,
  AuditQueryFilters,
  AuditStatistics,
  AuditChange,
} from '../../domain/models/audit-log';

@Component({
  selector: 'app-audit-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page">
      <!-- Statistics Cards -->
      @if (statistics(); as stats) {
        <section class="stats-grid">
          <div class="card stat-card">
            <div class="stat-value">{{ stats.totalLogs }}</div>
            <div class="stat-label">Toplam İşlem</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value" style="color: var(--status-error);">
              {{ stats.flaggedLogs }}
            </div>
            <div class="stat-label">İşaretlenen</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value" style="color: var(--accent-mr);">{{ stats.byUser.length }}</div>
            <div class="stat-label">Aktif Kullanıcı</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value" style="color: var(--accent-nukleer);">
              {{ stats.byEntity.length }}
            </div>
            <div class="stat-label">Varlık Türü</div>
          </div>
        </section>
      }

      <!-- Suspicious Activity Alert -->
      @if (suspicious().length > 0) {
        <section class="card suspicious-section">
          <div class="card-header">
            <h3>Şüpheli Aktiviteler</h3>
            <span class="badge badge-error">{{ suspicious().length }}</span>
          </div>
          <div class="suspicious-list">
            @for (act of suspicious(); track act.type + (act.userId || '')) {
              <div
                class="suspicious-item"
                [class.critical]="act.severity === 'critical'"
                [class.high]="act.severity === 'high'"
              >
                <div class="suspicious-indicator" [class]="act.severity"></div>
                <div class="suspicious-content">
                  <span class="suspicious-message">{{ act.message }}</span>
                  <span class="suspicious-meta">{{
                    act.detectedAt | date: 'dd.MM.yyyy HH:mm'
                  }}</span>
                </div>
                <span
                  class="badge"
                  [class.badge-error]="act.severity === 'critical' || act.severity === 'high'"
                  [class.badge-warning]="act.severity === 'medium'"
                  [class.badge-neutral]="act.severity === 'low'"
                >
                  {{
                    act.severity === 'critical'
                      ? 'Kritik'
                      : act.severity === 'high'
                        ? 'Yüksek'
                        : act.severity === 'medium'
                          ? 'Orta'
                          : 'Düşük'
                  }}
                </span>
              </div>
            }
          </div>
        </section>
      }

      <!-- Advanced Filters -->
      <section class="card filter-section">
        <div class="filter-grid">
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
            <select class="select" [(ngModel)]="filters.actionType" (change)="applyFilters()">
              <option value="">Tümü</option>
              <option value="LOGIN">Giriş</option>
              <option value="LOGOUT">Çıkış</option>
              <option value="FAILED_LOGIN">Başarısız Giriş</option>
              <option value="PASSWORD_CHANGE">Şifre Değişikliği</option>
              <option value="TOKEN_REFRESH">Token Yenileme</option>
              <option value="PERSONNEL_CREATED">Personel Oluşturma</option>
              <option value="PERSONNEL_UPDATED">Personel Güncelleme</option>
              <option value="PERSONNEL_DELETED">Personel Silme</option>
              <option value="SCHEDULE_CREATED">Program Oluşturma</option>
              <option value="SCHEDULE_UPDATED">Program Güncelleme</option>
              <option value="SCHEDULE_APPROVED">Program Onaylama</option>
              <option value="SCHEDULE_DELETED">Program Silme</option>
              <option value="ATTENDANCE_CREATED">Katılım Kaydı</option>
              <option value="ATTENDANCE_UPDATED">Katılım Güncelleme</option>
              <option value="TRAINING_CREATED">Eğitim Oluşturma</option>
              <option value="TRAINING_COMPLETED">Eğitim Tamamlama</option>
              <option value="DEVICE_CREATED">Cihaz Oluşturma</option>
              <option value="DEVICE_INCIDENT_CREATED">Cihaz Arızası</option>
              <option value="ROLE_ASSIGNED">Rol Atama</option>
              <option value="ROLE_REMOVED">Rol Kaldırma</option>
              <option value="SETTINGS_CHANGED">Ayar Değişikliği</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Varlık Türü</label>
            <select class="select" [(ngModel)]="filters.entityType" (change)="applyFilters()">
              <option value="">Tümü</option>
              <option value="user">Kullanıcı</option>
              <option value="personnel">Personel</option>
              <option value="schedule">Program</option>
              <option value="assignment">Atama</option>
              <option value="attendance">Katılım</option>
              <option value="training">Eğitim</option>
              <option value="device">Cihaz</option>
              <option value="device_incident">Cihaz Arızası</option>
              <option value="role">Rol</option>
              <option value="permission">Yetki</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Durum</label>
            <select class="select" [(ngModel)]="filters.status" (change)="applyFilters()">
              <option value="">Tümü</option>
              <option value="SUCCESS">Başarılı</option>
              <option value="FAILURE">Başarısız</option>
              <option value="ERROR">Hata</option>
            </select>
          </div>
          <div class="filter-group filter-search">
            <label>Arama</label>
            <input
              class="input"
              type="text"
              placeholder="Kullanıcı, varlık ID, açıklama..."
              [(ngModel)]="filters.search"
              (keyup.enter)="applyFilters()"
            />
          </div>
        </div>
      </section>

      <!-- Audit Log Table -->
      <section class="card">
        <div class="table-header">
          <span class="table-count">{{ paginatedData()?.total || 0 }} kayıt</span>
          <div class="table-pagination">
            <span class="text-muted">Sayfa {{ currentPage() }} / {{ totalPages() }}</span>
            <button
              class="btn btn-ghost btn-sm"
              (click)="prevPage()"
              [disabled]="currentPage() <= 1"
            >
              ◀
            </button>
            <button
              class="btn btn-ghost btn-sm"
              (click)="nextPage()"
              [disabled]="currentPage() >= totalPages()"
            >
              ▶
            </button>
          </div>
        </div>

        @if (isLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Yükleniyor...</span>
          </div>
        } @else {
          @if (entries().length === 0) {
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
              <h3>Kayıt Bulunamadı</h3>
              <p>Seçilen filtrelere uygun denetim günlüğü bulunmamaktadır.</p>
            </div>
          } @else {
            <div class="table-wrapper scroll-container scroll-sticky-head">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th>Tarih/Saat</th>
                    <th>Kullanıcı</th>
                    <th>Rol</th>
                    <th>İşlem</th>
                    <th>Varlık</th>
                    <th>IP</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of entries(); track entry.id) {
                    <tr
                      class="audit-row"
                      [class.flagged]="entry.isFlagged"
                      (click)="openDetail(entry)"
                    >
                      <td class="cell-timestamp">
                        {{ entry.timestamp | date: 'dd.MM.yyyy HH:mm' }}
                      </td>
                      <td class="cell-user">
                        <div class="user-info">
                          <div class="user-avatar">{{ entry.userName.charAt(0) }}</div>
                          <div>
                            <div class="user-name">{{ entry.userName }}</div>
                            <div class="user-email">{{ entry.userRole }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="role-badge">{{ entry.userRole }}</span>
                      </td>
                      <td>
                        <span class="action-badge" [class]="'action-' + entry.action">{{
                          entry.actionLabel
                        }}</span>
                      </td>
                      <td>
                        <div class="entity-cell">
                          <span class="entity-type">{{ entry.entityTypeLabel }}</span>
                          <span class="entity-id">{{
                            entry.entityId ? '#' + entry.entityId.slice(0, 8) : '-'
                          }}</span>
                        </div>
                      </td>
                      <td class="cell-ip">{{ entry.ipAddress || '-' }}</td>
                      <td>
                        <span
                          class="status-badge"
                          [class.success]="entry.status === 'SUCCESS'"
                          [class.error]="entry.status === 'FAILURE' || entry.status === 'ERROR'"
                        >
                          {{ entry.status }}
                        </span>
                        @if (entry.isFlagged) {
                          <span class="badge badge-error">İşaretli</span>
                        }
                      </td>
                      <td class="cell-actions">
                        <button
                          class="btn btn-ghost btn-sm"
                          (click)="$event.stopPropagation(); toggleFlag(entry)"
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
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="table-footer">
              <span class="text-muted"
                >{{ paginatedData()?.total || 0 }} kayıt içinden
                {{ (currentPage() - 1) * pageSize + 1 }}-{{
                  Math.min(currentPage() * pageSize, paginatedData()?.total || 0)
                }}
                gösteriliyor</span
              >
              <div class="pagination-controls">
                <button
                  class="btn btn-ghost btn-sm"
                  (click)="firstPage()"
                  [disabled]="currentPage() <= 1"
                >
                  «
                </button>
                <button
                  class="btn btn-ghost btn-sm"
                  (click)="prevPage()"
                  [disabled]="currentPage() <= 1"
                >
                  ‹
                </button>
                @for (p of pageNumbers(); track p) {
                  <button
                    class="btn btn-sm"
                    [class.btn-primary]="p === currentPage()"
                    [class.btn-ghost]="p !== currentPage()"
                    (click)="goToPage(p)"
                  >
                    {{ p }}
                  </button>
                }
                <button
                  class="btn btn-ghost btn-sm"
                  (click)="nextPage()"
                  [disabled]="currentPage() >= totalPages()"
                >
                  ›
                </button>
                <button
                  class="btn btn-ghost btn-sm"
                  (click)="lastPage()"
                  [disabled]="currentPage() >= totalPages()"
                >
                  »
                </button>
              </div>
            </div>
          }
        }
      </section>
    </div>

    <div class="modal-overlay" *ngIf="selectedEntry()" (click)="closeDetail()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>İşlem Detayı</h2>
          <button class="btn btn-ghost btn-sm" (click)="closeDetail()">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-grid">
            <div class="detail-section">
              <h4>İşlem Bilgileri</h4>
              <div class="detail-row">
                <span class="detail-label">İşlem</span
                ><span class="action-badge" [class]="'action-' + getSelected().action">{{
                  getSelected().actionLabel
                }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Tarih</span
                ><span>{{ getSelected().timestamp | date: 'dd.MM.yyyy HH:mm:ss' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Durum</span
                ><span class="status-badge" [class.success]="getSelected().status === 'SUCCESS'">{{
                  getSelected().status
                }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Açıklama</span
                ><span>{{ getSelected().description || '-' }}</span>
              </div>
            </div>
            <div class="detail-section">
              <h4>Kullanıcı</h4>
              <div class="detail-row">
                <span class="detail-label">Ad</span><span>{{ getSelected().userName }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Rol</span><span>{{ getSelected().userRole }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Kullanıcı ID</span
                ><span class="mono">{{ getSelected().userId }}</span>
              </div>
            </div>
            <div class="detail-section">
              <h4>Varlık</h4>
              <div class="detail-row">
                <span class="detail-label">Tür</span
                ><span>{{ getSelected().entityTypeLabel }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">ID</span
                ><span class="mono">{{ getSelected().entityId || '-' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Organizasyon</span
                ><span>{{ getSelected().organizationId || '-' }}</span>
              </div>
              @if (getSelected().unitId) {
                <div class="detail-row">
                  <span class="detail-label">Birim</span><span>{{ getSelected().unitId }}</span>
                </div>
              }
            </div>
            <div class="detail-section">
              <h4>İstek</h4>
              <div class="detail-row">
                <span class="detail-label">İstek ID</span
                ><span class="mono">{{ getSelected().requestId || '-' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">IP Adresi</span
                ><span class="mono">{{ getSelected().ipAddress || '-' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Kullanıcı Aracı</span
                ><span class="mono" style="font-size: 11px; word-break: break-all;">{{
                  getSelected().userAgent || '-'
                }}</span>
              </div>
            </div>
          </div>

          @if (getSelected().changes.length > 0) {
            <div class="detail-section changes-section">
              <h4>Değişiklikler</h4>
              <div class="changes-table-wrapper scroll-container scroll-sticky-head">
                <table class="changes-table">
                  <thead>
                    <tr>
                      <th>Alan</th>
                      <th>Eski Değer</th>
                      <th>Yeni Değer</th>
                      <th>Tür</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (chg of getSelected().changes; track chg.field) {
                      <tr>
                        <td class="change-field">{{ chg.field }}</td>
                        <td class="change-old">{{ chg.oldValue }}</td>
                        <td class="change-new">{{ chg.newValue }}</td>
                        <td>
                          <span
                            class="change-type-badge"
                            [class.added]="chg.changeType === 'added'"
                            [class.removed]="chg.changeType === 'removed'"
                            [class.modified]="chg.changeType === 'modified'"
                          >
                            {{
                              chg.changeType === 'added'
                                ? 'Eklendi'
                                : chg.changeType === 'removed'
                                  ? 'Kaldırıldı'
                                  : 'Değişti'
                            }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @if (getSelected().isFlagged) {
            <div class="flag-info">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              <span
                >Bu kayıt işaretlenmiştir. Sebep:
                {{ getSelected().flagReason || 'Belirtilmemiş' }}</span
              >
            </div>
          }
        </div>
        <div class="modal-footer">
          @if (getSelected().isFlagged) {
            <button class="btn btn-ghost btn-sm" (click)="unflagEntry(getSelected())">
              Bayrağı Kaldır
            </button>
          } @else {
            <button class="btn btn-ghost btn-sm" (click)="showFlagInput.set(true)">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              İşaretle
            </button>
          }
          @if (showFlagInput()) {
            <div class="flag-input-group">
              <input
                class="input"
                type="text"
                placeholder="İşaretleme sebebi..."
                [(ngModel)]="flagReason"
                (keyup.enter)="flagEntry(getSelected())"
              />
              <button class="btn btn-primary btn-sm" (click)="flagEntry(getSelected())">
                Kaydet
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        position: relative;
      }
      .export-menu {
        position: absolute;
        top: 100%;
        right: 0;
        z-index: 10;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .export-menu button {
        white-space: nowrap;
        justify-content: flex-start;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 16px;
      }
      .stat-card {
        text-align: center;
        padding: 16px;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--accent-mr);
      }
      .stat-label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
      }

      .suspicious-section {
        margin-bottom: 16px;
        border-color: rgba(239, 68, 68, 0.2);
      }
      .suspicious-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .suspicious-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: var(--radius-md);
        background: var(--bg-hover);
      }
      .suspicious-item.critical {
        border-left: 3px solid var(--status-error);
      }
      .suspicious-item.high {
        border-left: 3px solid #f97316;
      }
      .suspicious-item.medium {
        border-left: 3px solid #eab308;
      }
      .suspicious-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .suspicious-indicator.critical {
        background: var(--status-error);
      }
      .suspicious-indicator.high {
        background: #f97316;
      }
      .suspicious-indicator.medium {
        background: #eab308;
      }
      .suspicious-indicator.low {
        background: #94a3b8;
      }
      .suspicious-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .suspicious-message {
        font-size: 13px;
        font-weight: 500;
      }
      .suspicious-meta {
        font-size: 11px;
        color: var(--text-muted);
      }

      .filter-section {
        margin-bottom: 16px;
      }
      .filter-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr) 1.5fr;
        gap: 12px;
        align-items: end;
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
      .filter-search {
        grid-column: span 1;
      }
      @media (max-width: 1024px) {
        .filter-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (max-width: 768px) {
        .filter-grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      .table-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-subtle);
        margin-bottom: 12px;
      }
      .table-count {
        font-size: 13px;
        color: var(--text-muted);
      }
      .table-pagination {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .table-wrapper {
        overflow-x: auto;
      }
      .audit-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        font-size: 13px;
      }
      .audit-table th {
        text-align: left;
        padding: 8px 12px;
        color: var(--text-muted);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .audit-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--border-subtle);
        vertical-align: middle;
      }
      .audit-row {
        cursor: pointer;
        transition: background 0.15s;
      }
      .audit-row:hover {
        background: var(--bg-hover);
      }
      .audit-row.flagged {
        background: rgba(239, 68, 68, 0.04);
      }
      .cell-timestamp {
        white-space: nowrap;
        color: var(--text-muted);
        font-size: 12px;
      }
      .cell-user {
        min-width: 180px;
      }
      .user-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .user-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--accent-mr);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
      }
      .user-name {
        font-weight: 500;
      }
      .user-email {
        font-size: 11px;
        color: var(--text-muted);
      }
      .role-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        background: var(--bg-hover);
        color: var(--text-secondary);
      }
      .action-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
      }
      .action-LOGIN {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;
      }
      .action-LOGOUT {
        background: rgba(107, 114, 128, 0.15);
        color: #9ca3af;
      }
      .action-FAILED_LOGIN {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
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
      .action-PERSONNEL_CREATED {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-PERSONNEL_UPDATED {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .action-PERSONNEL_DELETED {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .action-SCHEDULE_CREATED {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-SCHEDULE_APPROVED {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-ROLE_ASSIGNED {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .action-ROLE_REMOVED {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .action-DEVICE_CREATED {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-DEVICE_INCIDENT_CREATED {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .action-TRAINING_COMPLETED {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .entity-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .entity-type {
        font-size: 12px;
      }
      .entity-id {
        font-size: 10px;
        color: var(--text-muted);
        font-family: monospace;
      }
      .cell-ip {
        font-family: monospace;
        font-size: 11px;
        color: var(--text-muted);
      }
      .status-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
      }
      .status-badge.success {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .status-badge.error {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .cell-actions {
        text-align: right;
      }

      .table-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 12px;
        border-top: 1px solid var(--border-subtle);
        margin-top: 12px;
      }
      .pagination-controls {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      /* Modal */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 24px;
      }
      .modal {
        background: var(--bg-surface);
        border-radius: var(--radius-lg);
        max-width: 720px;
        width: 100%;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .modal-header h2 {
        margin: 0;
        font-size: 16px;
      }
      .modal-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }
      .modal-footer {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 12px 20px;
        border-top: 1px solid var(--border-subtle);
      }

      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .detail-section h4 {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-muted);
        margin: 0 0 8px 0;
      }
      .detail-row {
        display: flex;
        gap: 8px;
        padding: 4px 0;
        font-size: 13px;
      }
      .detail-label {
        color: var(--text-muted);
        min-width: 80px;
        font-size: 12px;
        flex-shrink: 0;
      }
      .mono {
        font-family: monospace;
        font-size: 11px;
      }
      .changes-section {
        margin-top: 8px;
      }
      .changes-table-wrapper {
        overflow-x: auto;
      }
      .changes-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        font-size: 12px;
      }
      .changes-table th {
        text-align: left;
        padding: 6px 8px;
        color: var(--text-muted);
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        border-bottom: 1px solid var(--border-subtle);
      }
      .changes-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--border-subtle);
        vertical-align: top;
      }
      .change-field {
        font-weight: 500;
        min-width: 100px;
      }
      .change-old {
        color: var(--status-error);
        font-size: 11px;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .change-new {
        color: var(--status-success);
        font-size: 11px;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .change-type-badge {
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 10px;
        white-space: nowrap;
      }
      .change-type-badge.added {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .change-type-badge.removed {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .change-type-badge.modified {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      .flag-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(239, 68, 68, 0.08);
        border-radius: var(--radius-md);
        font-size: 13px;
        color: var(--status-error);
        margin-top: 12px;
      }
      .flag-input-group {
        display: flex;
        gap: 8px;
        flex: 1;
      }
      .flag-input-group input {
        flex: 1;
      }
    `,
  ],
})
export class AuditCenterComponent implements OnInit, OnDestroy {
  private auditService = inject(AuditService);
  private notification = inject(NotificationService);
  private destroy$ = new Subject<void>();
  readonly Math = Math;
  readonly Object = Object;

  entries = signal<AuditLogEntry[]>([]);
  paginatedData = signal<{ data: AuditLogEntry[]; total: number; pages: number } | null>(null);
  statistics = signal<AuditStatistics | null>(null);
  suspicious = signal<any[]>([]);
  isLoading = signal(false);
  selectedEntry = signal<AuditLogEntry | null>(null);
  showFlagInput = signal(false);
  flagReason = '';

  pageSize = 50;
  currentPage = signal(1);

  totalPages = computed(() => {
    const total = this.paginatedData()?.total || 0;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  filters: AuditQueryFilters = {
    startDate: '',
    endDate: '',
    actionType: '',
    entityType: '',
    status: '',
    search: '',
    limit: this.pageSize,
    offset: 0,
  };

  ngOnInit() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.filters.endDate = now.toISOString().split('T')[0];
    this.filters.startDate = thirtyDaysAgo.toISOString().split('T')[0];
    this.loadAll();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll() {
    this.loadLogs();
    this.loadStatistics();
    this.loadSuspicious();
  }

  loadLogs() {
    this.isLoading.set(true);
    this.filters.limit = this.pageSize;
    this.filters.offset = (this.currentPage() - 1) * this.pageSize;

    this.auditService
      .findAll(this.filters)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading.set(false)),
        catchError(() => of({ data: [], total: 0, pages: 0 })),
      )
      .subscribe((res) => {
        this.paginatedData.set(res);
        this.entries.set(res.data || []);
      });
  }

  loadStatistics() {
    if (!this.filters.startDate || !this.filters.endDate) return;
    this.auditService
      .getStatistics(this.filters.startDate, this.filters.endDate)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
      )
      .subscribe((stats) => this.statistics.set(stats));
  }

  loadSuspicious() {
    this.auditService
      .getSuspicious()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
      )
      .subscribe((s) => this.suspicious.set(s));
  }

  applyFilters() {
    this.currentPage.set(1);
    this.loadAll();
  }

  refresh() {
    this.loadAll();
  }

  goToPage(page: number) {
    this.currentPage.set(page);
    this.loadLogs();
  }

  firstPage() {
    this.currentPage.set(1);
    this.loadLogs();
  }
  lastPage() {
    this.currentPage.set(this.totalPages());
    this.loadLogs();
  }
  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.loadLogs();
    }
  }
  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadLogs();
    }
  }

  openDetail(entry: AuditLogEntry) {
    this.selectedEntry.set(entry);
    this.showFlagInput.set(false);
    this.flagReason = '';
  }

  closeDetail() {
    this.selectedEntry.set(null);
  }

  toggleFlag(entry: AuditLogEntry) {
    if (entry.isFlagged) {
      this.unflagEntry(entry);
    } else {
      const reason = prompt('İşaretleme sebebi:');
      if (reason) {
        this.auditService
          .flagEntry(entry.id, reason)
          .pipe(catchError(() => of(null)))
          .subscribe(() => {
            entry.isFlagged = true;
            (entry as any).flagReason = reason;
            this.entries.update((e) => [...e]);
            this.notification.success('İşaretlendi', 'Kayıt işaretlendi.');
          });
      }
    }
  }

  flagEntry(entry: AuditLogEntry) {
    if (!this.flagReason.trim()) return;
    this.auditService
      .flagEntry(entry.id, this.flagReason)
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        entry.isFlagged = true;
        (entry as any).flagReason = this.flagReason;
        this.entries.update((e) => [...e]);
        this.selectedEntry.set({ ...entry });
        this.showFlagInput.set(false);
        this.notification.success('İşaretlendi', 'Kayıt işaretlendi.');
      });
  }

  unflagEntry(entry: AuditLogEntry) {
    this.auditService
      .unflagEntry(entry.id)
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        entry.isFlagged = false;
        this.entries.update((e) => [...e]);
        this.selectedEntry.set({ ...entry, isFlagged: false });
        this.notification.success('İşaret Kaldırıldı', 'Kayıt işareti kaldırıldı.');
      });
  }

  getSelected() {
    return this.selectedEntry()!;
  }

  formatValue(val: unknown): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }
}
