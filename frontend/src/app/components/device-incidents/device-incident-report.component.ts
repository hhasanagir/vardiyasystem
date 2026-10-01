import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DeviceIncidentsService,
  DeviceIncident,
  CreateDeviceIncidentPayload,
} from '../../services/device-incidents.service';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { DeviceApiService, Device } from '../../core/api/device-api.service';
import { Subscription } from 'rxjs';

const ISSUE_TYPES = [
  'arıza',
  'bakım ihtiyacı',
  'kalibrasyon problemi',
  'görüntü kalitesi sorunu',
  'cihaz offline',
  'servis çağrıldı',
] as const;

@Component({
  selector: 'app-device-incident-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page di-page">
      <div class="hero-section glass animate-in">
        <div class="hero-top">
          <div class="hero-brand">
            <h1 class="hero-title">Cihaz Arıza / Bakım Bildirimi</h1>
            <p class="hero-subtitle">
              {{ currentUser()?.name }} &middot; Anlık arıza ve bakım kayıtları
            </p>
          </div>
          <div class="hero-actions">
            <button class="btn btn-ghost btn-sm" (click)="refresh()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg
              >Yenile
            </button>
            <button class="btn btn-primary btn-sm" (click)="openCreate()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" /></svg
              >Arıza Bildir
            </button>
          </div>
        </div>

        <div class="filter-bar">
          <button
            class="filter-btn"
            [class.active]="filterStatus() === ''"
            (click)="filterStatus.set(''); refresh()"
          >
            Tümü
          </button>
          <button
            class="filter-btn status-open"
            [class.active]="filterStatus() === 'open'"
            (click)="filterStatus.set('open'); refresh()"
          >
            Açık
          </button>
          <button
            class="filter-btn status-in-progress"
            [class.active]="filterStatus() === 'in_progress'"
            (click)="filterStatus.set('in_progress'); refresh()"
          >
            İşlemde
          </button>
          <button
            class="filter-btn status-resolved"
            [class.active]="filterStatus() === 'resolved'"
            (click)="filterStatus.set('resolved'); refresh()"
          >
            Çözüldü
          </button>
          <button
            class="filter-btn status-closed"
            [class.active]="filterStatus() === 'closed'"
            (click)="filterStatus.set('closed'); refresh()"
          >
            Kapatıldı
          </button>
          <span class="filter-sep"></span>
          <button
            class="filter-btn sev-low"
            [class.active]="filterSeverity() === 'low'"
            (click)="filterSeverity.set('low'); refresh()"
          >
            Düşük
          </button>
          <button
            class="filter-btn sev-medium"
            [class.active]="filterSeverity() === 'medium'"
            (click)="filterSeverity.set('medium'); refresh()"
          >
            Orta
          </button>
          <button
            class="filter-btn sev-high"
            [class.active]="filterSeverity() === 'high'"
            (click)="filterSeverity.set('high'); refresh()"
          >
            Yüksek
          </button>
          <button
            class="filter-btn sev-critical"
            [class.active]="filterSeverity() === 'critical'"
            (click)="filterSeverity.set('critical'); refresh()"
          >
            Kritik
          </button>
          @if (filterStatus() || filterSeverity()) {
            <button
              class="filter-btn filter-clear"
              (click)="filterStatus.set(''); filterSeverity.set(''); refresh()"
            >
              Temizle
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <div class="error-banner">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" /></svg
          ><span>{{ error() }}</span>
        </div>
      }

      @if (loading()) {
        <div class="loading-list">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-row">
              <div
                class="skeleton-shimmer"
                style="height:72px;border-radius:var(--radius-lg)"
              ></div>
            </div>
          }
        </div>
      } @else {
        <div class="incidents-list">
          @for (incident of incidents(); track incident.id) {
            <div
              class="incident-card"
              [class.expanded]="expandedId() === incident.id"
              [class]="'severity-' + incident.severity"
              [class.resolved]="incident.status === 'resolved' || incident.status === 'closed'"
            >
              <div class="incident-main" (click)="toggleExpand(incident.id)">
                <div class="incident-severity" [class]="'sev-' + incident.severity">
                  @switch (incident.severity) {
                    @case ('critical') {
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    }
                    @case ('high') {
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                        />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    }
                    @case ('medium') {
                      <svg
                        width="16"
                        height="16"
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
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    }
                  }
                </div>
                <div class="incident-content">
                  <div class="incident-top">
                    <span class="incident-type">{{ getIssueLabel(incident.issueType) }}</span>
                    <span class="status-badge" [class]="'status-' + incident.status">{{
                      getStatusLabel(incident.status)
                    }}</span>
                  </div>
                  <span class="incident-meta">
                    <span class="incident-author">{{ incident.user.name }}</span>
                    <span class="incident-sep">&middot;</span>
                    <span class="incident-date">{{ formatDate(incident.reportedAt) }}</span>
                    @if (incident.device) {
                      <span class="incident-sep">&middot;</span>
                      <span class="incident-device">{{ incident.device.name }}</span>
                    }
                  </span>
                </div>
                <div class="incident-actions">
                  <span class="severity-tag" [class]="'sev-' + incident.severity">{{
                    getSeverityLabel(incident.severity)
                  }}</span>
                  <svg
                    width="14"
                    height="14"
                    class="expand-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
              @if (expandedId() === incident.id) {
                <div class="incident-detail">
                  <div class="detail-text">{{ incident.description }}</div>
                  @if (incident.imageUrl) {
                    <div class="detail-image">
                      <img [src]="incident.imageUrl" alt="Attachment" />
                    </div>
                  }
                  <div class="detail-footer">
                    <div class="detail-info">
                      <span
                        >Bildiren: <strong>{{ incident.user.name }}</strong> ({{
                          incident.user.role
                        }})</span
                      >
                      <span
                        >Birim: <strong>{{ incident.unit.name }}</strong></span
                      >
                      @if (incident.device) {
                        <span
                          >Cihaz:
                          <strong
                            >{{ incident.device.name }} ({{ incident.device.code }})</strong
                          ></span
                        >
                      }
                      <span
                        >Şiddet:
                        <span class="severity-tag" [class]="'sev-' + incident.severity">{{
                          getSeverityLabel(incident.severity)
                        }}</span></span
                      >
                      <span
                        >Durum: <strong>{{ getStatusLabel(incident.status) }}</strong></span
                      >
                    </div>
                    <div class="detail-actions">
                      @if (incident.status === 'open' || incident.status === 'in_progress') {
                        <button
                          class="btn btn-ghost btn-xs"
                          (click)="quickStatus(incident, 'in_progress'); $event.stopPropagation()"
                          [disabled]="incident.status === 'in_progress'"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg
                          >İşleme Al
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          (click)="quickStatus(incident, 'resolved'); $event.stopPropagation()"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <polyline points="20 6 9 17 4 12" /></svg
                          >Çözüldü
                        </button>
                      }
                      @if (incident.status === 'resolved') {
                        <button
                          class="btn btn-ghost btn-xs"
                          (click)="quickStatus(incident, 'closed'); $event.stopPropagation()"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" /></svg
                          >Kapat
                        </button>
                      }
                      <button
                        class="btn btn-ghost btn-xs"
                        (click)="openEdit(incident); $event.stopPropagation()"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg
                        >Düzenle
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <div class="empty-state">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>Henüz arıza/bakım kaydı bulunmuyor</span>
              <button class="btn btn-primary btn-sm" (click)="openCreate()">
                İlk Bildirimi Yap
              </button>
            </div>
          }
        </div>
      }
    </div>

    @if (showForm()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingIncident() ? 'Kaydı Düzenle' : 'Arıza / Bakım Bildir' }}</h3>
            <button class="modal-close" (click)="closeForm()">
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
          <div class="modal-body">
            <div class="form-group">
              <label>Arıza Türü *</label>
              <select class="form-select" [(ngModel)]="formIssueType">
                <option value="" disabled>Seçiniz</option>
                @for (t of issueTypes; track t) {
                  <option [value]="t">{{ getIssueLabel(t) }}</option>
                }
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Şiddet</label>
                <select class="form-select" [(ngModel)]="formSeverity">
                  <option value="low">Düşük</option>
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                  <option value="critical">Kritik</option>
                </select>
              </div>
              <div class="form-group">
                <label>Cihaz</label>
                <select class="form-select" [(ngModel)]="formDeviceId">
                  <option value="">Seçilmedi</option>
                  @for (d of devices(); track d.id) {
                    <option [value]="d.id">{{ d.name }} ({{ d.code }})</option>
                  }
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Açıklama *</label>
              <textarea
                class="form-textarea"
                [(ngModel)]="formDescription"
                placeholder="Arıza/bakım detaylarını açıklayın..."
                rows="4"
                maxlength="5000"
              ></textarea>
            </div>
            <div class="form-group">
              <label>Görsel (isteğe bağlı)</label>
              <input
                type="text"
                class="form-input"
                [(ngModel)]="formImageUrl"
                placeholder="https://..."
              />
            </div>
            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">İptal</button>
            <button class="btn btn-primary" (click)="saveIncident()" [disabled]="saving()">
              @if (saving()) {
                Kaydediliyor...
              } @else {
                {{ editingIncident() ? 'Güncelle' : 'Bildir' }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .di-page {
        padding: 16px 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .hero-section {
        padding: 24px 28px;
        margin-bottom: 16px;
        border-radius: var(--radius-xl);
      }
      .hero-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
      }
      .hero-title {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.4px;
      }
      .hero-subtitle {
        font-size: 13px;
        color: var(--text-muted);
        margin: 6px 0 0;
      }
      .hero-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn-ghost:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-default);
      }
      .btn-ghost:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: var(--radius-md);
        background: var(--accent-gradient);
        color: white;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn-primary:hover {
        opacity: 0.9;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-sm {
        padding: 6px 12px;
        font-size: 11px;
      }
      .btn-xs {
        padding: 4px 10px;
        font-size: 10px;
      }
      .error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        margin-bottom: 12px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }

      .filter-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 16px;
        flex-wrap: wrap;
      }
      .filter-btn {
        padding: 5px 12px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-muted);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .filter-btn:hover {
        background: var(--bg-hover);
        color: var(--text-secondary);
      }
      .filter-btn.active {
        background: var(--bg-active);
        color: var(--accent-mr);
        border-color: var(--accent-mr);
      }
      .filter-btn.status-open.active {
        color: #3b82f6;
        border-color: #3b82f6;
      }
      .filter-btn.status-in-progress.active {
        color: #f59e0b;
        border-color: #f59e0b;
      }
      .filter-btn.status-resolved.active {
        color: #22c55e;
        border-color: #22c55e;
      }
      .filter-btn.status-closed.active {
        color: #6b7280;
        border-color: #6b7280;
      }
      .filter-btn.sev-low.active {
        color: #6b7280;
        border-color: #6b7280;
      }
      .filter-btn.sev-medium.active {
        color: #3b82f6;
        border-color: #3b82f6;
      }
      .filter-btn.sev-high.active {
        color: #f59e0b;
        border-color: #f59e0b;
      }
      .filter-btn.sev-critical.active {
        color: #ef4444;
        border-color: #ef4444;
      }
      .filter-clear {
        color: var(--status-error);
      }
      .filter-sep {
        width: 1px;
        height: 20px;
        background: var(--border-subtle);
        margin: 0 4px;
      }

      .loading-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .skeleton-row {
        width: 100%;
      }

      .incidents-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .incident-card {
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: all var(--transition-fast);
      }
      .incident-card:hover {
        border-color: var(--border-default);
      }
      .incident-card.expanded {
        border-color: var(--accent-mr);
      }
      .incident-card.severity-critical {
        border-left: 3px solid #ef4444;
      }
      .incident-card.severity-high {
        border-left: 3px solid #f59e0b;
      }
      .incident-card.severity-medium {
        border-left: 3px solid #3b82f6;
      }
      .incident-card.resolved {
        opacity: 0.6;
      }
      .incident-main {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        cursor: pointer;
      }
      .incident-severity {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-md);
        flex-shrink: 0;
      }
      .incident-severity.sev-critical {
        background: rgba(239, 68, 68, 0.12);
        color: #f87171;
      }
      .incident-severity.sev-high {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .incident-severity.sev-medium {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .incident-severity.sev-low {
        background: rgba(107, 114, 128, 0.1);
        color: #9ca3af;
      }
      .incident-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .incident-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .incident-type {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .status-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 600;
      }
      .status-badge.status-open {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .status-badge.status-in_progress {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .status-badge.status-resolved {
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
      }
      .status-badge.status-closed {
        background: rgba(107, 114, 128, 0.1);
        color: #9ca3af;
      }
      .incident-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--text-muted);
        flex-wrap: wrap;
      }
      .incident-sep {
        opacity: 0.4;
      }
      .incident-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .severity-tag {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 600;
      }
      .severity-tag.sev-critical {
        background: rgba(239, 68, 68, 0.12);
        color: #f87171;
      }
      .severity-tag.sev-high {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .severity-tag.sev-medium {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .severity-tag.sev-low {
        background: rgba(107, 114, 128, 0.1);
        color: #9ca3af;
      }
      .expand-icon {
        color: var(--text-muted);
        transition: transform var(--transition-fast);
      }
      .expanded .expand-icon {
        transform: rotate(180deg);
      }

      .incident-detail {
        border-top: 1px solid var(--border-subtle);
        padding: 16px;
        background: var(--bg-glass);
      }
      .detail-text {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.6;
        white-space: pre-wrap;
        margin-bottom: 12px;
      }
      .detail-image {
        margin-bottom: 12px;
      }
      .detail-image img {
        max-width: 100%;
        max-height: 300px;
        border-radius: var(--radius-md);
        object-fit: cover;
      }
      .detail-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .detail-info {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        font-size: 11px;
        color: var(--text-muted);
      }
      .detail-info strong {
        color: var(--text-secondary);
        font-weight: 600;
      }
      .detail-actions {
        display: flex;
        gap: 6px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 48px;
        color: var(--text-muted);
        font-size: 13px;
      }
      .empty-state svg {
        opacity: 0.25;
      }

      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
      }
      .modal {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        width: 100%;
        max-width: 560px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .modal-close {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--radius-sm);
        display: flex;
      }
      .modal-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .modal-body {
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 24px;
        border-top: 1px solid var(--border-subtle);
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .form-group label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .form-input,
      .form-textarea,
      .form-select {
        padding: 9px 12px;
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: 13px;
        transition: border-color var(--transition-fast);
      }
      .form-input:focus,
      .form-textarea:focus,
      .form-select:focus {
        outline: none;
        border-color: var(--accent-mr);
      }
      .form-textarea {
        resize: vertical;
        min-height: 80px;
        font-family: inherit;
      }
      .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .form-error {
        padding: 8px 12px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 11px;
        color: var(--status-error);
      }

      @media (max-width: 768px) {
        .hero-top {
          flex-direction: column;
        }
        .hero-actions {
          width: 100%;
        }
        .detail-footer {
          flex-direction: column;
        }
        .form-row {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class DeviceIncidentReportComponent implements OnInit, OnDestroy {
  private incidentsService = inject(DeviceIncidentsService);
  private wsService = inject(WebSocketService);
  private authService = inject(AuthService);
  private deviceApi = inject(DeviceApiService);

  protected issueTypes = ISSUE_TYPES;
  protected currentUser = this.authService.user;
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected incidents = signal<DeviceIncident[]>([]);
  protected expandedId = signal<string | null>(null);
  protected filterStatus = signal('');
  protected filterSeverity = signal('');

  protected showForm = signal(false);
  protected editingIncident = signal<DeviceIncident | null>(null);
  protected saving = signal(false);
  protected formIssueType = '';
  protected formSeverity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  protected formDescription = '';
  protected formDeviceId = '';
  protected formImageUrl = '';
  protected formError = signal<string | null>(null);
  protected devices = signal<Device[]>([]);

  private wsSub: Subscription | null = null;

  ngOnInit() {
    this.refresh();
    this.loadDevices();
    this.wsSub = this.wsService.on<any>('incident:new').subscribe(() => {
      this.refresh();
    });
  }

  ngOnDestroy() {
    if (this.wsSub) this.wsSub.unsubscribe();
  }

  protected refresh() {
    this.loading.set(true);
    this.error.set(null);

    const params: Record<string, string> = {};
    if (this.filterStatus()) params['status'] = this.filterStatus();
    if (this.filterSeverity()) params['severity'] = this.filterSeverity();

    this.incidentsService.getIncidents(params).subscribe({
      next: (res) => {
        this.incidents.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Kayıtlar yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  private loadDevices() {
    this.deviceApi.loadDevices().subscribe({
      next: (res) => this.devices.set(res.devices),
      error: () => {
        this.devices.set([]);
      },
    });
  }

  protected toggleExpand(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected quickStatus(incident: DeviceIncident, status: string) {
    this.incidentsService.updateStatus(incident.id, status).subscribe({
      next: () => this.refresh(),
      error: (err) => {
        this.error.set(
          'Durum güncellenemedi: ' + (err?.error?.message || err?.message || 'Bilinmeyen hata'),
        );
      },
    });
  }

  protected openCreate() {
    this.editingIncident.set(null);
    this.formIssueType = '';
    this.formSeverity = 'medium';
    this.formDescription = '';
    this.formDeviceId = '';
    this.formImageUrl = '';
    this.formError.set(null);
    this.showForm.set(true);
  }

  protected openEdit(incident: DeviceIncident) {
    this.editingIncident.set(incident);
    this.formIssueType = incident.issueType;
    this.formSeverity = incident.severity;
    this.formDescription = incident.description;
    this.formDeviceId = incident.deviceId || '';
    this.formImageUrl = incident.imageUrl || '';
    this.formError.set(null);
    this.showForm.set(true);
  }

  protected closeForm() {
    this.showForm.set(false);
    this.editingIncident.set(null);
    this.formError.set(null);
  }

  protected saveIncident() {
    this.formError.set(null);
    if (!this.formIssueType || !this.formDescription.trim()) {
      this.formError.set('Arıza türü ve açıklama zorunludur');
      return;
    }

    this.saving.set(true);
    const edit = this.editingIncident();

    if (edit) {
      this.incidentsService
        .updateIncident(edit.id, {
          issueType: this.formIssueType,
          severity: this.formSeverity,
          description: this.formDescription.trim(),
          imageUrl: this.formImageUrl || undefined,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.closeForm();
            this.refresh();
          },
          error: (err) => {
            this.saving.set(false);
            this.formError.set(err.message || 'Kayıt güncellenemedi');
          },
        });
    } else {
      const user = this.currentUser();
      const payload: CreateDeviceIncidentPayload = {
        unitId: user?.unitId || '',
        issueType: this.formIssueType,
        severity: this.formSeverity,
        description: this.formDescription.trim(),
      };
      if (this.formDeviceId) payload.deviceId = this.formDeviceId;
      if (this.formImageUrl) payload.imageUrl = this.formImageUrl;

      if (!payload.unitId) {
        this.formError.set('Birim bilgisi bulunamadı');
        this.saving.set(false);
        return;
      }

      this.incidentsService.createIncident(payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.closeForm();
          this.refresh();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.message || 'Kayıt oluşturulamadı');
        },
      });
    }
  }

  protected formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected getIssueLabel(type: string): string {
    const map: Record<string, string> = {
      arıza: 'Arıza',
      'bakım ihtiyacı': 'Bakım İhtiyacı',
      'kalibrasyon problemi': 'Kalibrasyon Problemi',
      'görüntü kalitesi sorunu': 'Görüntü Kalitesi Sorunu',
      'cihaz offline': 'Cihaz Offline',
      'servis çağrıldı': 'Servis Çağrıldı',
    };
    return map[type] || type;
  }

  protected getSeverityLabel(sev: string): string {
    const map: Record<string, string> = {
      low: 'Düşük',
      medium: 'Orta',
      high: 'Yüksek',
      critical: 'Kritik',
    };
    return map[sev] || sev;
  }

  protected getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Açık',
      in_progress: 'İşlemde',
      resolved: 'Çözüldü',
      closed: 'Kapatıldı',
    };
    return map[status] || status;
  }
}
