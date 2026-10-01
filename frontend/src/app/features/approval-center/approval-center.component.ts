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
import {
  ScheduleService,
  ScheduleResponse,
  VersionHistoryResponse,
  VersionCompareResult,
} from '../../services/schedule.service';
@Component({
  selector: 'app-approval-center',
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

      <div class="approval-layout">
        <aside class="sidebar-panel">
          <div class="sidebar-header">
            <h3>Bekleyen Onaylar</h3>
            <span class="badge badge-warning">{{ pendingApprovals().length }}</span>
          </div>
          <div class="list-items">
            @for (item of pendingApprovals(); track item.id) {
              <div
                class="list-item"
                [class.active]="selectedId() === item.id"
                (click)="selectSchedule(item)"
              >
                <div class="item-left">
                  <div class="item-unit-dot" [style.background]="getUnitColor(item.unit)"></div>
                  <div class="item-info">
                    <span class="item-title">{{ getUnitLabel(item.unit) }}</span>
                    <span class="item-subtitle"
                      >{{ item.month }}/{{ item.year }} · v{{ item.version }}</span
                    >
                  </div>
                </div>
                <div class="item-right">
                  <span class="item-user">{{ item.workflow?.submittedBy || '—' }}</span>
                </div>
              </div>
            } @empty {
              <div class="empty-state" style="padding: 48px 16px;">
                <h3>Onay Bekleyen Yok</h3>
                <p>Bekleyen program bulunamadı</p>
              </div>
            }
          </div>
        </aside>

        <main class="detail-panel">
          @if (!selectedSchedule()) {
            <div class="empty-state" style="padding: 96px 24px;">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
              </svg>
              <h3>Program Seçin</h3>
              <p>İncelemek için bir program seçin</p>
            </div>
          } @else {
            <div class="detail-header">
              <div class="detail-title-row">
                <h2>
                  {{ getUnitLabel(selectedSchedule()!.unit) }} · {{ selectedSchedule()!.month }}/{{
                    selectedSchedule()!.year
                  }}
                </h2>
                <span
                  class="badge"
                  [class.badge-info]="selStatus() === 'review' || selStatus() === 'under_review'"
                  [class.badge-success]="selStatus() === 'approved'"
                  [class.badge-error]="selStatus() === 'rejected'"
                  [class.badge-neutral]="selStatus() === 'draft'"
                >
                  {{ getStatusLabel(selectedSchedule()!.status) }}
                </span>
                <span class="badge badge-neutral">v{{ selectedSchedule()!.version }}</span>
              </div>
              <div class="detail-actions">
                @if (selStatus() === 'under_review' || selStatus() === 'review') {
                  <button class="btn btn-success" (click)="openApproveDialog()">
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
                    Onayla
                  </button>
                  <button class="btn btn-danger" (click)="openRejectDialog()">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Reddet
                  </button>
                }
                @if (selectedSchedule()!.status === 'approved') {
                  <button class="btn btn-primary" (click)="showPublishModal.set(true)">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Yayınla
                  </button>
                }
              </div>
            </div>

            <!-- Workflow Compliance -->
            <div class="compliance-section card" style="margin-bottom: 16px;">
              <div class="card-header"><h3>Uygunluk Kontrolü</h3></div>
              <div class="compliance-grid">
                @for (check of complianceChecks(); track check.label) {
                  <div
                    class="compliance-item"
                    [class.compliant]="check.passed"
                    [class.failed]="!check.passed"
                  >
                    <span class="compliance-icon">{{ check.passed ? '✓' : '✗' }}</span>
                    <div class="compliance-info">
                      <span class="compliance-label">{{ check.label }}</span>
                      <span class="compliance-status">{{
                        check.passed ? 'Geçti' : 'Başarısız'
                      }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Workflow Timeline -->
            <div class="workflow-section card" style="margin-bottom: 16px;">
              <div class="card-header"><h3>İş Akışı</h3></div>
              <div class="workflow-steps">
                <div class="workflow-step active">
                  <span class="step-dot"></span><span>Taslak</span>
                </div>
                <div class="workflow-line" [class.done]="isAtLeast('review')"></div>
                <div
                  class="workflow-step"
                  [class.active]="isAtLeast('review')"
                  [class.done]="isAtLeast('review')"
                >
                  <span class="step-dot"></span><span>İnceleme</span>
                </div>
                <div class="workflow-line" [class.done]="isAtLeast('approved')"></div>
                <div
                  class="workflow-step"
                  [class.active]="isAtLeast('approved')"
                  [class.done]="isAtLeast('approved')"
                >
                  <span class="step-dot"></span><span>Onay</span>
                </div>
                <div class="workflow-line" [class.done]="isAtLeast('published')"></div>
                <div
                  class="workflow-step"
                  [class.active]="isAtLeast('published')"
                  [class.done]="isAtLeast('published')"
                >
                  <span class="step-dot"></span><span>Yayın</span>
                </div>
              </div>
            </div>

            <!-- Info Cards -->
            <div class="info-section card" style="margin-bottom: 16px;">
              <div class="card-header"><h3>Program Bilgisi</h3></div>
              <div class="grid-4">
                <div class="info-item">
                  <span class="info-label">Atama Sayısı</span>
                  <span class="info-value">{{ selectedSchedule()!.assignments.length }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Oluşturan</span>
                  <span class="info-value">{{ selectedSchedule()!.createdBy }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Oluşturulma</span>
                  <span class="info-value">{{
                    selectedSchedule()!.createdAt | date: 'dd.MM.yyyy'
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Güncelleme</span>
                  <span class="info-value">{{
                    selectedSchedule()!.updatedAt | date: 'dd.MM.yyyy'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Tabs -->
            <div class="card">
              <div
                class="card-header"
                style="margin-bottom: 0; border-bottom: 1px solid var(--border-subtle);"
              >
                <div style="display:flex; gap: 0;">
                  <button
                    class="tab"
                    [class.active]="activeTab() === 'versions'"
                    (click)="activeTab.set('versions')"
                  >
                    Versiyon Geçmişi
                  </button>
                  <button
                    class="tab"
                    [class.active]="activeTab() === 'diff'"
                    (click)="activeTab.set('diff')"
                  >
                    Karşılaştır
                  </button>
                  <button
                    class="tab"
                    [class.active]="activeTab() === 'assignments'"
                    (click)="activeTab.set('assignments')"
                  >
                    Atamalar
                  </button>
                </div>
              </div>

              @if (activeTab() === 'versions') {
                @if (versionHistory().length === 0) {
                  <div class="empty-state"><p>Versiyon geçmişi bulunamadı</p></div>
                } @else {
                  <div style="padding: 16px 0;">
                    @for (v of versionHistory(); track v.version) {
                      <div class="version-item">
                        <div class="version-dot"></div>
                        <div class="version-info">
                          <span class="version-title">Versiyon {{ v.version }}</span>
                          <span class="version-date">{{ formatDate(v.createdAt) }}</span>
                          <span class="version-author">{{ v.createdByName || v.createdBy }}</span>
                          @if (v.comment) {
                            <p class="version-comment">{{ v.comment }}</p>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              }

              @if (activeTab() === 'diff') {
                <div style="padding: 16px 0;">
                  <div class="diff-controls">
                    <div class="diff-selector">
                      <label>Kaynak</label>
                      <select [(ngModel)]="diffFromVersion" (change)="loadDiff()">
                        @for (v of versionHistory(); track v.version) {
                          <option [value]="v.version">v{{ v.version }}</option>
                        }
                      </select>
                    </div>
                    <span class="diff-arrow">&rarr;</span>
                    <div class="diff-selector">
                      <label>Hedef</label>
                      <select [(ngModel)]="diffToVersion" (change)="loadDiff()">
                        @for (v of versionHistory(); track v.version) {
                          <option [value]="v.version">v{{ v.version }}</option>
                        }
                      </select>
                    </div>
                  </div>

                  @if (diffResult(); as diff) {
                    <div style="display:flex; gap: 8px; margin-bottom: 12px;">
                      <span class="badge badge-success">{{ diff.diff.added.length }} Ekleme</span>
                      <span class="badge badge-error">{{ diff.diff.removed.length }} Silme</span>
                      <span class="badge badge-info"
                        >{{ diff.diff.modified.length }} Değişiklik</span
                      >
                    </div>
                    <div class="diff-entries">
                      @for (a of diff.diff.added; track a.id) {
                        <div class="diff-row added">
                          <span class="diff-sign">+</span
                          ><span class="diff-device">{{ a.deviceId }}</span
                          ><span class="diff-date">{{ a.date }}</span
                          ><span class="diff-shift">{{ a.shiftType }}</span
                          ><span class="diff-personnel">{{
                            a.personnelName || a.personnelId
                          }}</span>
                        </div>
                      }
                      @for (a of diff.diff.removed; track a.id) {
                        <div class="diff-row removed">
                          <span class="diff-sign">-</span
                          ><span class="diff-device">{{ a.deviceId }}</span
                          ><span class="diff-date">{{ a.date }}</span
                          ><span class="diff-shift">{{ a.shiftType }}</span
                          ><span class="diff-personnel">{{
                            a.personnelName || a.personnelId
                          }}</span>
                        </div>
                      }
                      @for (a of diff.diff.modified; track a.id) {
                        <div class="diff-row modified">
                          <span class="diff-sign">~</span
                          ><span class="diff-device">{{ a.deviceId }}</span
                          ><span class="diff-date">{{ a.date }}</span
                          ><span class="diff-shift">{{ a.shiftType }}</span
                          ><span class="diff-personnel">{{
                            a.personnelName || a.personnelId
                          }}</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="empty-state"><p>Karşılaştırma için versiyon seçin</p></div>
                  }
                </div>
              }

              @if (activeTab() === 'assignments') {
                <div style="padding: 16px 0;">
                  <div class="assignments-table">
                    <div class="table-header">
                      <span>Cihaz</span><span>Tarih</span><span>Vardiya</span><span>Personel</span>
                    </div>
                    @for (a of selectedSchedule()!.assignments; track a.id) {
                      <div class="table-row">
                        <span>{{ a.deviceId }}</span
                        ><span>{{ a.date }}</span
                        ><span>{{ a.shiftType }}</span
                        ><span>{{ a.personnelName || a.personnelId }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </main>
      </div>
    </div>

    @if (showApproveDialog()) {
      <div class="modal-overlay" (click)="showApproveDialog.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Programı Onayla</h3>
            <button class="btn btn-ghost btn-sm" (click)="showApproveDialog.set(false)">
              &times;
            </button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom: 12px; color: var(--text-secondary);">
              {{ getUnitLabel(selectedSchedule()!.unit) }} - {{ selectedSchedule()!.month }}/{{
                selectedSchedule()!.year
              }}
            </p>
            <div style="display:flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 13px; color: var(--text-secondary);"
                >Yorum (isteğe bağlı)</label
              >
              <textarea
                class="input"
                [(ngModel)]="approveComment"
                placeholder="Onay notu..."
                style="min-height: 80px; resize: vertical;"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="showApproveDialog.set(false)">İptal</button>
            <button class="btn btn-success" (click)="approve()" [disabled]="isLoading()">
              {{ isLoading() ? 'Onaylanıyor...' : 'Onayla' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (showRejectDialog()) {
      <div class="modal-overlay" (click)="showRejectDialog.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Programı Reddet</h3>
            <button class="btn btn-ghost btn-sm" (click)="showRejectDialog.set(false)">
              &times;
            </button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom: 12px; color: var(--text-secondary);">
              {{ getUnitLabel(selectedSchedule()!.unit) }} - {{ selectedSchedule()!.month }}/{{
                selectedSchedule()!.year
              }}
            </p>
            <div style="display:flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 13px; color: var(--text-secondary);"
                >Reddetme Nedeni <span style="color: var(--status-error);">*</span></label
              >
              <textarea
                class="input"
                [(ngModel)]="rejectReason"
                placeholder="Reddetme sebebini açıklayın..."
                style="min-height: 80px; resize: vertical;"
              ></textarea>
              @if (rejectError()) {
                <span style="font-size: 12px; color: var(--status-error);">{{
                  rejectError()
                }}</span>
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="showRejectDialog.set(false)">İptal</button>
            <button class="btn btn-danger" (click)="reject()" [disabled]="isLoading()">
              {{ isLoading() ? 'Reddediliyor...' : 'Reddet' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .header-actions {
        display: flex;
        gap: 8px;
      }

      .approval-layout {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 24px;
        align-items: start;
      }

      .sidebar-panel {
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .sidebar-header h3 {
        margin: 0;
        font-size: 13px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .list-items {
        max-height: 600px;
        overflow-y: auto;
      }
      .list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        cursor: pointer;
        border-bottom: 1px solid var(--border-subtle);
        transition: background var(--transition-fast);
      }
      .list-item:hover {
        background: var(--bg-hover);
      }
      .list-item.active {
        background: var(--bg-active);
      }
      .item-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .item-unit-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .item-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .item-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .item-subtitle {
        font-size: 11px;
        color: var(--text-muted);
      }
      .item-right {
        text-align: right;
      }
      .item-user {
        font-size: 10px;
        color: var(--text-muted);
      }

      .detail-panel {
        min-height: 400px;
      }
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .detail-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .detail-title-row h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .detail-actions {
        display: flex;
        gap: 8px;
      }

      .compliance-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .compliance-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: var(--radius-sm);
        background: var(--bg-hover);
      }
      .compliance-item.compliant {
      }
      .compliance-item.failed {
        background: rgba(239, 68, 68, 0.08);
      }
      .compliance-icon {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
      }
      .compliance-item.compliant .compliance-icon {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .compliance-item.failed .compliance-icon {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .compliance-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .compliance-label {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .compliance-status {
        font-size: 11px;
        font-weight: 600;
      }
      .compliance-item.compliant .compliance-status {
        color: #4ade80;
      }
      .compliance-item.failed .compliance-status {
        color: #f87171;
      }

      .workflow-steps {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 0;
      }
      .workflow-step {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
      }
      .workflow-step.active {
        color: var(--accent-mr);
        font-weight: 600;
      }
      .workflow-step.done {
        color: var(--status-success);
      }
      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--border-default);
      }
      .workflow-step.active .step-dot {
        background: var(--accent-mr);
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
      }
      .workflow-step.done .step-dot {
        background: var(--status-success);
      }
      .workflow-line {
        width: 48px;
        height: 2px;
        background: var(--border-subtle);
        margin: 0 4px;
      }
      .workflow-line.done {
        background: var(--status-success);
      }

      .info-item {
        padding: 12px;
        background: var(--bg-hover);
        border-radius: var(--radius-md);
      }
      .info-label {
        display: block;
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .info-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .tab {
        padding: 10px 20px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .tab.active {
        color: var(--accent-mr);
        border-bottom-color: var(--accent-mr);
      }
      .tab:hover {
        color: var(--text-secondary);
      }

      .version-item {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
        border-left: 2px solid var(--border-default);
        margin-left: 12px;
        position: relative;
      }
      .version-dot {
        position: absolute;
        left: -7px;
        top: 16px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--accent-mr);
        border: 3px solid var(--bg-primary);
      }
      .version-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .version-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .version-date {
        font-size: 12px;
        color: var(--text-muted);
      }
      .version-author {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .version-comment {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--text-muted);
        font-style: italic;
      }

      .diff-controls {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        margin-bottom: 16px;
      }
      .diff-selector {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .diff-selector label {
        font-size: 12px;
        color: var(--text-muted);
      }
      .diff-arrow {
        font-size: 20px;
        color: var(--text-muted);
        padding-bottom: 6px;
      }
      .diff-entries {
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        overflow: hidden;
      }
      .diff-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 12px;
        font-size: 13px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .diff-row:last-child {
        border-bottom: none;
      }
      .diff-row.added {
        background: rgba(34, 197, 94, 0.04);
      }
      .diff-row.removed {
        background: rgba(239, 68, 68, 0.04);
      }
      .diff-row.modified {
        background: rgba(59, 130, 246, 0.04);
      }
      .diff-sign {
        font-weight: 700;
        width: 16px;
        text-align: center;
      }
      .diff-row.added .diff-sign {
        color: #4ade80;
      }
      .diff-row.removed .diff-sign {
        color: #f87171;
      }
      .diff-row.modified .diff-sign {
        color: #60a5fa;
      }
      .diff-device {
        min-width: 100px;
        color: var(--text-primary);
      }
      .diff-date {
        min-width: 90px;
        color: var(--text-secondary);
      }
      .diff-shift {
        min-width: 70px;
        color: var(--text-secondary);
      }
      .diff-personnel {
        color: var(--text-primary);
      }

      .assignments-table {
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        overflow: hidden;
        font-size: 13px;
      }
      .table-header {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        padding: 10px 12px;
        background: var(--bg-hover);
        color: var(--text-muted);
        font-size: 11px;
        text-transform: uppercase;
      }
      .table-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        padding: 8px 12px;
        border-top: 1px solid var(--border-subtle);
        color: var(--text-primary);
      }
    `,
  ],
})
export class ApprovalCenterComponent implements OnInit, OnDestroy {
  private scheduleApi = inject(ScheduleService);
  private destroy$ = new Subject<void>();

  activeTab = signal<'versions' | 'diff' | 'assignments'>('versions');
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  selectedId = signal<string | null>(null);
  pendingApprovals = signal<ScheduleResponse[]>([]);
  selectedSchedule = signal<ScheduleResponse | null>(null);
  readonly selStatus = computed(() => (this.selectedSchedule()?.status || 'draft') as string);
  versionHistory = signal<VersionHistoryResponse[]>([]);
  diffResult = signal<VersionCompareResult | null>(null);

  diffFromVersion = 0;
  diffToVersion = 0;

  showApproveDialog = signal(false);
  showRejectDialog = signal(false);
  showPublishModal = signal(false);
  approveComment = '';
  rejectReason = '';
  rejectError = signal<string | null>(null);
  isPublishing = signal(false);

  readonly complianceChecks = signal([
    { label: 'Zorunlu Onaylar', passed: true },
    { label: 'Rol Doğrulama', passed: true },
    { label: 'Kısıt Kontrolü', passed: true },
    { label: 'Adalet Eşiği', passed: false },
  ]);

  ngOnInit() {
    this.loadPendingApprovals();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPendingApprovals(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.scheduleApi
      .loadPendingApprovals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (schedules) => {
          this.pendingApprovals.set(schedules);
          this.isLoading.set(false);
          if (schedules.length > 0 && !this.selectedId()) this.selectSchedule(schedules[0]);
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Onay bekleyen vardiyalar yüklenemedi');
        },
      });
  }

  selectSchedule(schedule: ScheduleResponse): void {
    if (!schedule.id) return;
    this.selectedId.set(schedule.id);
    this.selectedSchedule.set(schedule);
    this.diffResult.set(null);
    this.activeTab.set('versions');
    this.loadVersionHistory(schedule.id);
  }

  loadVersionHistory(scheduleId: string): void {
    this.scheduleApi
      .loadVersionHistory(scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (versions) => {
          this.versionHistory.set(versions);
          if (versions.length >= 2) {
            this.diffFromVersion = versions[versions.length - 2].version;
            this.diffToVersion = versions[versions.length - 1].version;
          } else if (versions.length === 1) {
            this.diffFromVersion = versions[0].version;
            this.diffToVersion = versions[0].version;
          }
        },
        error: () => {
          this.versionHistory.set([]);
        },
      });
  }

  loadDiff(): void {
    const id = this.selectedId();
    if (!id || !this.diffFromVersion || !this.diffToVersion) return;
    this.scheduleApi
      .compareVersions(id, this.diffFromVersion, this.diffToVersion)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (r) => this.diffResult.set(r), error: () => this.diffResult.set(null) });
  }

  openApproveDialog(): void {
    this.approveComment = '';
    this.showApproveDialog.set(true);
  }
  openRejectDialog(): void {
    this.rejectReason = '';
    this.rejectError.set(null);
    this.showRejectDialog.set(true);
  }

  approve(): void {
    const id = this.selectedId();
    if (!id) return;
    this.isLoading.set(true);
    this.scheduleApi
      .approveSchedule(id, this.approveComment || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showApproveDialog.set(false);
          this.isLoading.set(false);
          this.loadPendingApprovals();
        },
        error: () => this.isLoading.set(false),
      });
  }

  reject(): void {
    const id = this.selectedId();
    if (!id) return;
    if (!this.rejectReason.trim()) {
      this.rejectError.set('Reddetme nedeni zorunludur.');
      return;
    }
    this.rejectError.set(null);
    this.isLoading.set(true);
    this.scheduleApi
      .rejectSchedule(id, this.rejectReason.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showRejectDialog.set(false);
          this.isLoading.set(false);
          this.loadPendingApprovals();
        },
        error: () => this.isLoading.set(false),
      });
  }

  publish(): void {
    const id = this.selectedId();
    if (!id) return;
    this.isPublishing.set(true);
    this.scheduleApi
      .publishSchedule(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showPublishModal.set(false);
          this.isPublishing.set(false);
          this.loadPendingApprovals();
        },
        error: () => this.isPublishing.set(false),
      });
  }

  refresh(): void {
    this.loadPendingApprovals();
    if (this.selectedId()) this.loadVersionHistory(this.selectedId()!);
  }

  isAtLeast(status: string): boolean {
    const order = ['draft', 'review', 'under_review', 'approved', 'published'];
    const current = this.selectedSchedule()?.status || 'draft';
    return order.indexOf(current) >= order.indexOf(status);
  }

  getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      nukleer: 'Nükleer Tıp',
      onkoloji: 'Radyasyon Onkolojisi',
    };
    return labels[unit] || unit;
  }

  getUnitColor(unit: string): string {
    const colors: Record<string, string> = {
      mr: '#3b82f6',
      bt: '#22c55e',
      rontgen: '#f59e0b',
      nukleer: '#a855f7',
      onkoloji: '#06b6d4',
    };
    return colors[unit] || '#64748b';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Taslak',
      under_review: 'İncelemede',
      review: 'İncelemede',
      approved: 'Onaylandı',
      published: 'Yayınlandı',
      archived: 'Arşivlendi',
      rejected: 'Reddedildi',
    };
    return labels[status] || status;
  }

  formatDate(d: string | Date): string {
    return new Date(d).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
