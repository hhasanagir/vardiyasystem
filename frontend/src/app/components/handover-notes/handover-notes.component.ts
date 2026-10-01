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
  HandoverNotesService,
  HandoverNote,
  CreateHandoverNotePayload,
} from '../../services/handover-notes.service';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { DeviceApiService, Device } from '../../core/api/device-api.service';

@Component({
  selector: 'app-handover-notes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page hn-page">
      <div class="hero-section glass animate-in">
        <div class="hero-top">
          <div class="hero-brand">
            <h1 class="hero-title">Devir Teslim Notları</h1>
            <p class="hero-subtitle">
              {{ currentUser()?.name }} &middot; Birim içi operasyon notları
            </p>
          </div>
          <div class="hero-actions">
            <span class="unread-badge" [class.has-unread]="unreadCount() > 0">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              @if (unreadCount() > 0) {
                <span class="badge-num">{{ unreadCount() }}</span>
              }
              <span class="badge-label">Okunmamış</span>
            </span>
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
              >Yeni Not
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
            class="filter-btn"
            [class.active]="filterStatus() === 'active'"
            (click)="filterStatus.set('active'); refresh()"
          >
            Aktif
          </button>
          <button
            class="filter-btn"
            [class.active]="filterStatus() === 'resolved'"
            (click)="filterStatus.set('resolved'); refresh()"
          >
            Çözülmüş
          </button>
          <span class="filter-sep"></span>
          <button
            class="filter-btn priority-info"
            [class.active]="filterPriority() === 'info'"
            (click)="filterPriority.set('info'); refresh()"
          >
            Bilgi
          </button>
          <button
            class="filter-btn priority-warning"
            [class.active]="filterPriority() === 'warning'"
            (click)="filterPriority.set('warning'); refresh()"
          >
            Uyarı
          </button>
          <button
            class="filter-btn priority-critical"
            [class.active]="filterPriority() === 'critical'"
            (click)="filterPriority.set('critical'); refresh()"
          >
            Kritik
          </button>
          @if (filterStatus() || filterPriority()) {
            <button
              class="filter-btn filter-clear"
              (click)="filterStatus.set(''); filterPriority.set(''); refresh()"
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
        <div class="notes-list">
          @for (note of notes(); track note.id) {
            <div
              class="note-card"
              [class.expanded]="expandedId() === note.id"
              [class.unread]="!note.isReadByMe && note.status === 'active'"
              [class.resolved]="note.status === 'resolved'"
            >
              <div class="note-main" (click)="toggleExpand(note.id)">
                <div class="note-priority" [class]="'priority-' + note.priority">
                  @switch (note.priority) {
                    @case ('critical') {
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
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    }
                    @case ('warning') {
                      <svg
                        width="14"
                        height="14"
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
                    @default {
                      <svg
                        width="14"
                        height="14"
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
                <div class="note-content">
                  <span class="note-title">{{ note.title }}</span>
                  <span class="note-meta">
                    <span class="note-author">{{ note.user.name }}</span>
                    <span class="note-sep">&middot;</span>
                    <span class="note-date">{{ formatDate(note.createdAt) }}</span>
                    @if (note.device) {
                      <span class="note-sep">&middot;</span>
                      <span class="note-device">{{ note.device.name }}</span>
                    }
                    @if (note.shiftType) {
                      <span class="note-sep">&middot;</span>
                      <span class="note-shift">{{ getShiftLabel(note.shiftType) }}</span>
                    }
                  </span>
                </div>
                <div class="note-actions">
                  @if (!note.isReadByMe && note.status === 'active') {
                    <span class="unread-dot" title="Okunmadı"></span>
                  }
                  @if (note.status === 'resolved') {
                    <span class="resolved-badge">Çözüldü</span>
                  }
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
              @if (expandedId() === note.id) {
                <div class="note-detail">
                  <div class="detail-text">{{ note.content }}</div>
                  <div class="detail-footer">
                    <div class="detail-info">
                      <span
                        >Oluşturan: <strong>{{ note.user.name }}</strong> ({{
                          note.user.role
                        }})</span
                      >
                      <span
                        >Birim: <strong>{{ note.unit.name }}</strong></span
                      >
                      @if (note.device) {
                        <span
                          >Cihaz:
                          <strong>{{ note.device.name }} ({{ note.device.code }})</strong></span
                        >
                      }
                      <span
                        >Öncelik:
                        <span class="priority-tag" [class]="'priority-' + note.priority">{{
                          note.priority
                        }}</span></span
                      >
                      <span
                        >Durum:
                        <strong>{{ note.status === 'active' ? 'Aktif' : 'Çözüldü' }}</strong></span
                      >
                      <span
                        >Okunma: <strong>{{ note.readBy.length }}</strong> kişi</span
                      >
                    </div>
                    <div class="detail-actions">
                      @if (!note.isReadByMe && note.status === 'active') {
                        <button
                          class="btn btn-ghost btn-xs"
                          (click)="markAsRead(note); $event.stopPropagation()"
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
                          >Okundu İşaretle
                        </button>
                      }
                      @if (note.userId === currentUser()?.id && note.status === 'active') {
                        <button
                          class="btn btn-ghost btn-xs"
                          (click)="openEdit(note); $event.stopPropagation()"
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
                            <path
                              d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                            /></svg
                          >Düzenle
                        </button>
                      }
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Henüz devir teslim notu bulunmuyor</span>
              <button class="btn btn-primary btn-sm" (click)="openCreate()">
                İlk Notu Oluştur
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
            <h3>{{ editingNote() ? 'Notu Düzenle' : 'Yeni Devir Teslim Notu' }}</h3>
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
              <label>Başlık *</label>
              <input
                type="text"
                class="form-input"
                [(ngModel)]="formTitle"
                placeholder="Not başlığı"
                maxlength="200"
              />
            </div>
            <div class="form-group">
              <label>İçerik *</label>
              <textarea
                class="form-textarea"
                [(ngModel)]="formContent"
                placeholder="Operasyon notunuzu yazın..."
                rows="4"
                maxlength="5000"
              ></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Öncelik</label>
                <select class="form-select" [(ngModel)]="formPriority">
                  <option value="info">Bilgi</option>
                  <option value="warning">Uyarı</option>
                  <option value="critical">Kritik</option>
                </select>
              </div>
              <div class="form-group">
                <label>Vardiya Türü</label>
                <select class="form-select" [(ngModel)]="formShiftType">
                  <option value="">Seçilmedi</option>
                  <option value="day">Gündüz</option>
                  <option value="evening">Akşam</option>
                  <option value="night">Gece</option>
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
            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">İptal</button>
            <button class="btn btn-primary" (click)="saveNote()" [disabled]="saving()">
              @if (saving()) {
                Kaydediliyor...
              } @else {
                {{ editingNote() ? 'Güncelle' : 'Oluştur' }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .hn-page {
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

      .unread-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: var(--radius-md);
        font-size: 11px;
        color: var(--text-muted);
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
      }
      .unread-badge.has-unread {
        color: var(--accent-mr);
        border-color: rgba(59, 130, 246, 0.2);
      }
      .badge-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--accent-mr);
        color: white;
        font-size: 10px;
        font-weight: 700;
      }
      .badge-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
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
      .filter-btn.priority-info.active {
        color: #3b82f6;
        border-color: #3b82f6;
      }
      .filter-btn.priority-warning.active {
        color: #f59e0b;
        border-color: #f59e0b;
      }
      .filter-btn.priority-critical.active {
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

      .notes-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .note-card {
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: all var(--transition-fast);
      }
      .note-card:hover {
        border-color: var(--border-default);
      }
      .note-card.expanded {
        border-color: var(--accent-mr);
      }
      .note-card.unread {
        border-left: 3px solid var(--accent-mr);
      }
      .note-card.resolved {
        opacity: 0.6;
      }
      .note-main {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        cursor: pointer;
      }
      .note-priority {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
        flex-shrink: 0;
      }
      .note-priority.priority-info {
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
      }
      .note-priority.priority-warning {
        background: rgba(245, 158, 11, 0.1);
        color: #fbbf24;
      }
      .note-priority.priority-critical {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
      }
      .note-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .note-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .note-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--text-muted);
        flex-wrap: wrap;
      }
      .note-sep {
        opacity: 0.4;
      }
      .note-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .unread-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-mr);
        box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
      }
      .resolved-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 600;
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
      }
      .expand-icon {
        color: var(--text-muted);
        transition: transform var(--transition-fast);
      }
      .expanded .expand-icon {
        transform: rotate(180deg);
      }

      .note-detail {
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
      .priority-tag {
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
      }
      .priority-tag.priority-info {
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
      }
      .priority-tag.priority-warning {
        background: rgba(245, 158, 11, 0.1);
        color: #fbbf24;
      }
      .priority-tag.priority-critical {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
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
export class HandoverNotesComponent implements OnInit, OnDestroy {
  private handoverNotesService = inject(HandoverNotesService);
  private wsService = inject(WebSocketService);
  private authService = inject(AuthService);
  private deviceApi = inject(DeviceApiService);

  protected currentUser = this.authService.user;
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected notes = signal<HandoverNote[]>([]);
  protected unreadCount = signal(0);
  protected expandedId = signal<string | null>(null);
  private wsSub: any = null;

  protected filterStatus = signal('');
  protected filterPriority = signal('');

  protected showForm = signal(false);
  protected editingNote = signal<HandoverNote | null>(null);
  protected saving = signal(false);
  protected formTitle = '';
  protected formContent = '';
  protected formPriority: 'info' | 'warning' | 'critical' = 'info';
  protected formShiftType = '';
  protected formDeviceId = '';
  protected formError = signal<string | null>(null);
  protected devices = signal<Device[]>([]);

  ngOnInit() {
    this.refresh();
    this.loadDevices();
    this.wsSub = this.wsService.on<any>('handover-note:new').subscribe(() => {
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
    if (this.filterPriority()) params['priority'] = this.filterPriority();

    this.handoverNotesService.getNotes(params).subscribe({
      next: (res) => {
        this.notes.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Notlar yüklenemedi');
        this.loading.set(false);
      },
    });

    this.handoverNotesService.getUnreadCount().subscribe({
      next: (res) => this.unreadCount.set(res.count),
      error: () => {},
    });
  }

  private loadDevices() {
    const user = this.currentUser();
    if (!user?.unitId) return;
    this.deviceApi.getDevicesForUnit(user.unitId as any).subscribe({
      next: (devices) => this.devices.set(devices),
      error: () => {},
    });
  }

  protected toggleExpand(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected markAsRead(note: HandoverNote) {
    this.handoverNotesService.markAsRead(note.id).subscribe({
      next: () => this.refresh(),
      error: () => {},
    });
  }

  protected openCreate() {
    this.editingNote.set(null);
    this.formTitle = '';
    this.formContent = '';
    this.formPriority = 'info';
    this.formShiftType = '';
    this.formDeviceId = '';
    this.formError.set(null);
    this.showForm.set(true);
  }

  protected openEdit(note: HandoverNote) {
    this.editingNote.set(note);
    this.formTitle = note.title;
    this.formContent = note.content;
    this.formPriority = note.priority;
    this.formShiftType = note.shiftType || '';
    this.formDeviceId = note.deviceId || '';
    this.formError.set(null);
    this.showForm.set(true);
  }

  protected closeForm() {
    this.showForm.set(false);
    this.editingNote.set(null);
    this.formError.set(null);
  }

  protected saveNote() {
    this.formError.set(null);
    if (!this.formTitle.trim() || !this.formContent.trim()) {
      this.formError.set('Başlık ve içerik zorunludur');
      return;
    }

    this.saving.set(true);
    const editNote = this.editingNote();

    if (editNote) {
      this.handoverNotesService
        .updateNote(editNote.id, {
          title: this.formTitle.trim(),
          content: this.formContent.trim(),
          priority: this.formPriority,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.closeForm();
            this.refresh();
          },
          error: (err) => {
            this.saving.set(false);
            this.formError.set(err.message || 'Not güncellenemedi');
          },
        });
    } else {
      const user = this.currentUser();
      const payload: CreateHandoverNotePayload = {
        unitId: user?.unitId || '',
        title: this.formTitle.trim(),
        content: this.formContent.trim(),
        priority: this.formPriority,
      };
      if (this.formShiftType) payload.shiftType = this.formShiftType;
      if (this.formDeviceId) payload.deviceId = this.formDeviceId;

      if (!payload.unitId) {
        this.formError.set('Birim bilgisi bulunamadı');
        this.saving.set(false);
        return;
      }

      this.handoverNotesService.createNote(payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.closeForm();
          this.refresh();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.message || 'Not oluşturulamadı');
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

  protected getShiftLabel(type: string): string {
    const map: Record<string, string> = { day: 'Gündüz', evening: 'Akşam', night: 'Gece' };
    return map[type] || type;
  }
}
