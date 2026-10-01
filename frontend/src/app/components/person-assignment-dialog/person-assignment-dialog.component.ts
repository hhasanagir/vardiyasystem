import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../services/auth.service';
import { ScheduleService } from '../../services/schedule.service';
import { NotificationService } from '../../services/notification.service';
import { firstValueFrom } from 'rxjs';
import type { PersonShiftTemplate, PersonShiftAssignment } from '../../domain/models';
import { ShiftTypeEnum } from '../../domain/enums';
import { hasMinRole } from '../../shared/utils/role-hierarchy';

interface PersonnelOption {
  id: string;
  name: string;
  unitId: string;
  role: string;
  groupId?: string | null;
  isActive: boolean;
  nightShiftEligible?: boolean;
  seniority?: number;
  offDays?: number[] | null;
  unit?: { id: string; code?: string; type?: string; name?: string };
}

interface AssignmentViolation {
  rule: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  message: string;
  details?: {
    currentShift?: { date: string; shiftType: string; startTime: string; endTime: string };
    newShift?: { date: string; shiftType: string; startTime: string; endTime: string };
    restHours?: number;
    minRestHours?: number;
    dayOfWeek?: string;
    personnelName?: string;
  };
  isOverrideAllowed: boolean;
}

@Component({
  selector: 'app-person-assignment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-overlay" (click)="close()" (keydown.escape)="close()">
      <div
        class="dialog-panel"
        (click)="$event.stopPropagation()"
        (keydown.enter)="handleEnter()"
        tabindex="0"
      >
        <div class="dialog-header">
          <h3>{{ existingAssignmentId() ? 'Nöbeti Düzenle' : 'Personel Nöbeti Ataması' }}</h3>
          <button class="close-btn" (click)="close()" title="Kapat (Esc)">✕</button>
        </div>

        <div class="dialog-body">
          <div class="slot-info">
            <div class="info-row">
              <span class="info-label">Birim</span><span class="info-value">{{ unitLabel() }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Grup</span
              ><span class="info-value"
                >{{ group().name }} <span class="info-sub">({{ group().code }})</span></span
              >
            </div>
            <div class="info-row">
              <span class="info-label">Vardiya Şablonu</span
              ><span class="info-value"
                >{{ template().name }}
                <span class="info-sub"
                  >{{ shiftTypeLabel(template().shiftType) }} · {{ template().startTime }} -
                  {{ template().endTime }}</span
                ></span
              >
            </div>
            <div class="info-row">
              <span class="info-label">Tarih</span
              ><span class="info-value">{{ formattedDate() }}</span>
            </div>
          </div>

          @if (!showOverrideConfirm()) {
            @if (slotWarnings().length) {
              <div class="slot-warnings">
                @for (w of slotWarnings(); track w.message) {
                  <div class="slot-warning" [class.error]="w.severity === 'error'">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {{ w.message }}
                  </div>
                }
              </div>
            }

            <div class="search-box">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
                placeholder="Personel ara (isim)..."
                class="search-input"
              />
            </div>

            @if (loading()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Personeller yükleniyor...</span>
              </div>
            } @else if (error()) {
              <div class="error-state">{{ error() }}</div>
            } @else if (filteredPersonnel().length === 0) {
              <div class="empty-state">Bu grup için uygun personel bulunamadı</div>
            } @else {
              <div class="personnel-list">
                @for (p of filteredPersonnel(); track p.id) {
                  <div
                    class="personnel-item"
                    [class.selected]="selectedId() === p.id"
                    [class.ineligible]="!nightEligible(p)"
                    (click)="selectedId.set(p.id)"
                    (dblclick)="save()"
                  >
                    <div class="personnel-avatar" [style.background]="getColor(p.name)">
                      {{ p.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="personnel-detail">
                      <span class="personnel-name">{{ p.name }}</span>
                      <span class="personnel-meta"
                        >{{ roleLabel(p.role) }}{{ p.groupId ? ' · Grup üyesi' : '' }}</span
                      >
                    </div>
                    @if (selectedId() === p.id) {
                      <svg
                        class="check-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#22c55e"
                        stroke-width="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    }
                  </div>
                }
              </div>
              <div class="list-count">
                {{ selectedId() ? '1 seçildi' : filteredPersonnel().length + ' personel' }}
              </div>
            }

            <div class="reason-box">
              <label class="reason-label" for="person-assign-reason">Gerekçe (opsiyonel)</label>
              <input
                id="person-assign-reason"
                type="text"
                [ngModel]="reason()"
                (ngModelChange)="reason.set($event)"
                placeholder="Örn: Nöbet planı tamamlama"
                class="reason-input"
              />
            </div>
          }

          @if (showOverrideConfirm() && backendViolations().length > 0) {
            <div class="violations-panel">
              <div class="violations-header">
                <svg
                  width="20"
                  height="20"
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
                <span>Doğrulama Uyarıları</span>
              </div>

              <div class="violations-list">
                @for (v of backendViolations(); track v.rule) {
                  <div
                    class="violation-card"
                    [class.blocking]="v.severity === 'BLOCKING'"
                    [class.warning]="v.severity === 'WARNING'"
                    [class.info]="v.severity === 'INFO'"
                  >
                    <div class="violation-severity">
                      @if (v.severity === 'BLOCKING') {
                        <span class="severity-badge blocking">ENGELLEYİCİ</span>
                      } @else if (v.severity === 'WARNING') {
                        <span class="severity-badge warning">UYARI</span>
                      } @else {
                        <span class="severity-badge info">BİLGİ</span>
                      }
                    </div>
                    <div class="violation-message">{{ v.message }}</div>

                    @if ($any(v.details)?.currentShift && $any(v.details)?.newShift) {
                      <div class="violation-comparison">
                        <div class="comparison-col">
                          <span class="comparison-label">Mevcut</span>
                          <span class="comparison-value"
                            >{{ formatDateShort($any(v.details).currentShift.date) }}
                            {{ shiftTypeLabel($any(v.details).currentShift.shiftType) }}</span
                          >
                          <span class="comparison-time"
                            >{{ $any(v.details).currentShift.startTime }} -
                            {{ $any(v.details).currentShift.endTime }}</span
                          >
                        </div>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div class="comparison-col">
                          <span class="comparison-label">Yeni</span>
                          <span class="comparison-value"
                            >{{ formatDateShort($any(v.details).newShift.date) }}
                            {{ shiftTypeLabel($any(v.details).newShift.shiftType) }}</span
                          >
                          <span class="comparison-time"
                            >{{ $any(v.details).newShift.startTime }} -
                            {{ $any(v.details).newShift.endTime }}</span
                          >
                        </div>
                      </div>
                    }

                    @if (v.rule === 'REST_RULE_VIOLATION' && $any(v.details)?.restHours != null) {
                      <div class="violation-detail-line">
                        Dinlenme: <strong>{{ $any(v.details).restHours }} saat</strong> (gerekli:
                        {{ $any(v.details).minRestHours || 11 }} saat)
                      </div>
                    }

                    @if (v.rule === 'TIME_OVERLAP' && $any(v.details)?.restHours != null) {
                      <div class="violation-detail-line">
                        Çakışma süresi: <strong>{{ $any(v.details).restHours }} dakika</strong>
                      </div>
                    }

                    @if ($any(v.details)?.personnelName) {
                      <div class="violation-detail-line">
                        İlişkili personel: <strong>{{ $any(v.details).personnelName }}</strong>
                      </div>
                    }

                    @if ($any(v.details)?.dayOfWeek) {
                      <div class="violation-detail-line">
                        Gün: <strong>{{ $any(v.details).dayOfWeek }}</strong>
                      </div>
                    }

                    @if (!v.isOverrideAllowed) {
                      <div class="violation-note">Bu kural istisna ile aşılamaz</div>
                    }
                  </div>
                }
              </div>

              @if (canOverride() && !hasBlockingViolation()) {
                <div class="override-section">
                  <div class="override-info">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span
                      >Uyarı kuralları yetkili istisna ile aşılabilir. Onaylamak için gerekçenizi
                      yazın.</span
                    >
                  </div>
                  <textarea
                    class="override-reason-input"
                    [ngModel]="overrideReason()"
                    (ngModelChange)="overrideReason.set($event)"
                    placeholder="İstisna gerekçesini yazın (zorunlu)..."
                    rows="3"
                  ></textarea>
                  <label class="override-checkbox-label">
                    <input
                      type="checkbox"
                      [ngModel]="overrideConfirmed()"
                      (ngModelChange)="overrideConfirmed.set($event)"
                    />
                    <span>İhlalleri okudum ve kabul ediyorum</span>
                  </label>
                </div>
              }

              @if (hasBlockingViolation()) {
                <div class="blocking-notice">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  <span
                    >Bu atama engleyici kurallar nedeniyle yapılamaz. Engelleyici kurallar istisna
                    ile aşılamaz.</span
                  >
                </div>
              }
            </div>
          }
        </div>

        <div class="dialog-footer">
          @if (showOverrideConfirm()) {
            <button class="btn btn-secondary" (click)="cancelOverride()">Geri Dön</button>
            @if (canOverride() && !hasBlockingViolation()) {
              <button
                class="btn btn-warning"
                [disabled]="!overrideConfirmed() || !overrideReason().trim() || saving()"
                (click)="confirmOverride()"
              >
                @if (saving()) {
                  <span class="btn-spinner"></span> Kaydediliyor...
                } @else {
                  Yetkili İstisna ile Ata
                }
              </button>
            }
          } @else {
            <button class="btn btn-secondary" (click)="close()">İptal (Esc)</button>
            <button
              class="btn btn-primary"
              [disabled]="!selectedId() || saving() || blockerCount() > 0"
              (click)="save()"
            >
              @if (saving()) {
                <span class="btn-spinner"></span> Kaydediliyor...
              } @else if (blockerCount() > 0) {
                Atama Engellendi
              } @else {
                Nöbeti Kaydet (Enter)
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dialog-panel {
        background: var(--bg-primary, #1e293b);
        border-radius: 12px;
        width: 480px;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
        outline: none;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #334155);
      }
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary, #f1f5f9);
      }
      .close-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #94a3b8);
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        border-radius: 4px;
      }
      .close-btn:hover {
        color: var(--text-primary, #f1f5f9);
        background: rgba(255, 255, 255, 0.05);
      }
      .dialog-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      }
      .slot-info {
        background: var(--bg-secondary, #0f172a);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;
      }
      .info-label {
        color: var(--text-secondary, #94a3b8);
      }
      .info-value {
        color: var(--text-primary, #f1f5f9);
        font-weight: 500;
        text-align: right;
      }
      .info-sub {
        font-weight: 400;
        color: var(--text-secondary, #94a3b8);
        font-size: 11px;
      }
      .slot-warnings {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .slot-warning {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .slot-warning.error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #fca5a5;
      }
      .slot-warning:not(.error) {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.25);
        color: #fbbf24;
      }
      .slot-warning svg {
        flex-shrink: 0;
        margin-top: 1px;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-secondary, #0f172a);
        border-radius: 8px;
        padding: 8px 12px;
        margin-bottom: 12px;
      }
      .search-input {
        background: none;
        border: none;
        color: var(--text-primary, #f1f5f9);
        outline: none;
        flex: 1;
        font-size: 13px;
      }
      .search-input::placeholder {
        color: var(--text-secondary, #64748b);
      }
      .personnel-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 240px;
        overflow-y: auto;
      }
      .personnel-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
        border: 1px solid transparent;
      }
      .personnel-item:hover {
        background: var(--bg-secondary, #0f172a);
      }
      .personnel-item.selected {
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.3);
      }
      .personnel-item.ineligible {
        opacity: 0.5;
      }
      .personnel-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 13px;
        flex-shrink: 0;
      }
      .personnel-detail {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .personnel-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #f1f5f9);
      }
      .personnel-meta {
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
      }
      .check-icon {
        flex-shrink: 0;
      }
      .list-count {
        text-align: right;
        font-size: 11px;
        color: var(--text-secondary, #64748b);
        padding: 6px 4px 0;
      }
      .reason-box {
        margin-top: 12px;
      }
      .reason-label {
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
        margin-bottom: 4px;
      }
      .reason-input {
        width: 100%;
        background: var(--bg-secondary, #0f172a);
        border: 1px solid var(--border-color, #334155);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--text-primary, #f1f5f9);
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
      }
      .reason-input:focus {
        border-color: var(--accent-color, #3b82f6);
      }
      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid var(--border-color, #334155);
      }
      .btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-secondary {
        background: var(--bg-secondary, #0f172a);
        color: var(--text-primary, #f1f5f9);
      }
      .btn-secondary:hover {
        background: #1e293b;
      }
      .btn-primary {
        background: var(--accent-color, #3b82f6);
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .btn-warning {
        background: #f59e0b;
        color: #1e293b;
        font-weight: 600;
      }
      .btn-warning:hover:not(:disabled) {
        background: #d97706;
      }
      .loading-state,
      .error-state,
      .empty-state {
        padding: 20px;
        text-align: center;
        color: var(--text-secondary, #94a3b8);
        font-size: 13px;
      }
      .spinner,
      .btn-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        margin-right: 6px;
        vertical-align: middle;
      }
      .loading-state .spinner {
        border-color: rgba(59, 130, 246, 0.3);
        border-top-color: #3b82f6;
        margin-right: 8px;
        vertical-align: middle;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .violations-panel {
        margin-top: 4px;
      }
      .violations-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 12px;
      }
      .violations-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .violation-card {
        border-radius: 8px;
        padding: 12px;
        border: 1px solid;
      }
      .violation-card.blocking {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.25);
      }
      .violation-card.warning {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.25);
      }
      .violation-card.info {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.25);
      }
      .violation-severity {
        margin-bottom: 6px;
      }
      .severity-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .severity-badge.blocking {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }
      .severity-badge.warning {
        background: rgba(245, 158, 11, 0.2);
        color: #fbbf24;
      }
      .severity-badge.info {
        background: rgba(59, 130, 246, 0.2);
        color: #93c5fd;
      }
      .violation-message {
        font-size: 13px;
        color: var(--text-primary, #f1f5f9);
        line-height: 1.4;
        margin-bottom: 8px;
      }
      .violation-comparison {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(0, 0, 0, 0.15);
        border-radius: 6px;
        padding: 8px 12px;
        margin-bottom: 8px;
      }
      .comparison-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      .comparison-label {
        font-size: 10px;
        color: var(--text-secondary, #94a3b8);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .comparison-value {
        font-size: 12px;
        color: var(--text-primary, #f1f5f9);
        font-weight: 500;
      }
      .comparison-time {
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
      }
      .violation-comparison svg {
        color: var(--text-secondary, #64748b);
        flex-shrink: 0;
      }
      .violation-detail-line {
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
        padding: 2px 0;
      }
      .violation-detail-line strong {
        color: var(--text-primary, #f1f5f9);
      }
      .violation-note {
        font-size: 11px;
        color: #f87171;
        font-style: italic;
        margin-top: 4px;
      }
      .override-section {
        background: rgba(245, 158, 11, 0.05);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        padding: 12px;
      }
      .override-info {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        font-size: 12px;
        color: #fbbf24;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      .override-info svg {
        flex-shrink: 0;
        margin-top: 1px;
      }
      .override-reason-input {
        width: 100%;
        background: var(--bg-secondary, #0f172a);
        border: 1px solid var(--border-color, #334155);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--text-primary, #f1f5f9);
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
        resize: vertical;
        min-height: 60px;
      }
      .override-reason-input:focus {
        border-color: #f59e0b;
      }
      .override-checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        font-size: 12px;
        color: var(--text-secondary, #94a3b8);
        cursor: pointer;
      }
      .override-checkbox-label input[type='checkbox'] {
        accent-color: #f59e0b;
      }
      .blocking-notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px;
        color: #fca5a5;
        font-size: 12px;
        line-height: 1.4;
      }
      .blocking-notice svg {
        flex-shrink: 0;
        margin-top: 1px;
      }
    `,
  ],
})
export class PersonAssignmentDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly scheduleApi = inject(ScheduleService);
  private readonly notification = inject(NotificationService);

  readonly scheduleId = input<string>('');
  readonly unitId = input.required<string>();
  readonly unitLabel = input<string>('');
  readonly unitType = input<string>('');
  readonly group = input.required<{ id: string; code: string; name: string }>();
  readonly template = input.required<PersonShiftTemplate>();
  readonly date = input.required<string>();
  readonly existingAssignments = input<PersonShiftAssignment[]>([]);
  readonly existingAssignmentId = input<string>('');
  readonly existingPersonnelId = input<string>('');

  readonly closeDialog = output<void>();
  readonly assignmentSaved = output<void>();

  readonly personnelList = signal<PersonnelOption[]>([]);
  readonly selectedId = signal<string>('');
  readonly search = signal('');
  readonly reason = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string>('');

  readonly backendViolations = signal<AssignmentViolation[]>([]);
  readonly showOverrideConfirm = signal(false);
  readonly overrideReason = signal('');
  readonly overrideConfirmed = signal(false);

  readonly canOverride = computed(() => {
    const user = this.authService.user();
    if (!user) return false;
    return hasMinRole(user.role, 'supervisor');
  });

  readonly hasBlockingViolation = computed(() =>
    this.backendViolations().some((v) => v.severity === 'BLOCKING'),
  );

  readonly filteredPersonnel = computed(() => {
    const q = this.search().toLowerCase();
    const gid = this.group().id;
    return this.personnelList().filter((p) => {
      const matchesGroup = p.groupId === gid;
      if (!matchesGroup) return false;
      return p.name.toLowerCase().includes(q);
    });
  });

  readonly formattedDate = computed(() => {
    const d = new Date(this.date() + 'T00:00:00');
    if (isNaN(d.getTime())) return this.date();
    const months = [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ];
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
  });

  readonly slotWarnings = computed(() => {
    const warnings: Array<{ severity: 'error' | 'warning'; message: string }> = [];
    const pid = this.selectedId();
    if (!pid) return warnings;
    const date = this.date();
    const st = this.template().shiftType;
    const list = this.existingAssignments().filter((a) => a.id !== this.existingAssignmentId());
    const hasReason = !!this.reason().trim();
    const NON_WORKING = new Set(['off', 'leave', 'sick', 'training', 'backup']);

    const sameSlot = list.find(
      (a) => a.personnelId === pid && a.date === date && a.shiftType === st,
    );
    if (sameSlot) {
      warnings.push({
        severity: 'error',
        message: `Bu personel ${this.formattedDate()} tarihinde zaten ${this.shiftTypeLabel(st)} nöbetine atanmıştır.`,
      });
    }

    const sameDayWorking = list.find(
      (a) =>
        a.personnelId === pid &&
        a.date === date &&
        a.shiftType !== st &&
        !NON_WORKING.has(a.shiftType) &&
        a.personnelGroupId === this.group().id,
    );
    if (sameDayWorking) {
      warnings.push({
        severity: 'warning',
        message: `Bu personel ${this.formattedDate()} tarihinde başka bir nöbete (${this.shiftTypeLabel(sameDayWorking.shiftType)}) atanmıştır.`,
      });
    }

    const overlap = list.find(
      (a) =>
        a.personnelId === pid &&
        a.date === date &&
        !NON_WORKING.has(a.shiftType) &&
        this.timesOverlap(
          a.startTime,
          a.endTime,
          this.template().startTime,
          this.template().endTime,
        ),
    );
    if (overlap && !sameDayWorking) {
      warnings.push({
        severity: 'warning',
        message: `Bu personel ${this.formattedDate()} tarihinde ${overlap.startTime}-${overlap.endTime} saatlerinde başka bir nöbete atanmıştır (saat çakışması).`,
      });
    }

    const person = this.personnelList().find((p) => p.id === pid);
    if (person && person.groupId && person.groupId !== this.group().id) {
      warnings.push({ severity: 'error', message: `Personel seçilen gruba bağlı değildir.` });
    }
    if (person && person.offDays && Array.isArray(person.offDays)) {
      const dayNum = new Date(date).getDay();
      if (person.offDays.includes(dayNum)) {
        const sev: 'error' | 'warning' = hasReason ? 'warning' : 'error';
        warnings.push({
          severity: sev,
          message: `Personelin ${this.formattedDate()} tarihinde (gün ${dayNum}) izin günü bulunmaktadır.`,
        });
      }
    }
    return warnings;
  });

  readonly blockerCount = computed(
    () => this.slotWarnings().filter((w) => w.severity === 'error').length,
  );

  private timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const toMin = (t: string): number => {
      const [h, m] = (t || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const norm = (s: string, e: string) => {
      let sMin = toMin(s);
      let eMin = toMin(e);
      if (eMin <= sMin) eMin += 1440;
      return { sMin, eMin };
    };
    const a = norm(startA, endA);
    const b = norm(startB, endB);
    if (b.sMin < a.sMin) {
      b.sMin += 1440;
      b.eMin += 1440;
    }
    return a.sMin < b.eMin && b.sMin < a.eMin;
  }

  nightEligible(p: PersonnelOption): boolean {
    const st = this.template().shiftType;
    if (st !== ShiftTypeEnum.NIGHT && st !== ShiftTypeEnum.EVENING) return true;
    return p.nightShiftEligible !== false;
  }

  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
    if (e.key === 'Enter' && !e.shiftKey) this.handleEnter();
  };

  ngOnInit(): void {
    document.addEventListener('keydown', this.keyHandler);
    this.loadPersonnel();
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keyHandler);
  }

  handleEnter(): void {
    if (this.showOverrideConfirm()) {
      if (
        this.canOverride() &&
        !this.hasBlockingViolation() &&
        this.overrideConfirmed() &&
        this.overrideReason().trim()
      ) {
        this.confirmOverride();
      }
    } else if (this.selectedId() && !this.saving() && this.blockerCount() === 0) {
      this.save();
    }
  }

  private async loadPersonnel(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = { isActive: 'true' };
      const ut = this.unitType();
      if (ut) params['unitId'] = ut;
      const res = await firstValueFrom(this.api.get<PersonnelOption[]>('/personnel', { params }));
      this.personnelList.set(this.filterByUnit(res || [], ut));
      if (this.existingAssignmentId() && this.existingPersonnelId()) {
        const exists = this.personnelList().some((p) => p.id === this.existingPersonnelId());
        if (exists) this.selectedId.set(this.existingPersonnelId());
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Personeller yüklenemedi');
    } finally {
      this.loading.set(false);
    }
  }

  private filterByUnit(list: PersonnelOption[], unitType: string): PersonnelOption[] {
    if (!unitType) return list;
    const ut = unitType.toLowerCase();
    return list.filter((p) => {
      const u = p.unit;
      if (!u) return false;
      return u.type === ut || (u.code && u.code.toLowerCase() === ut) || u.id === unitType;
    });
  }

  private buildPayload(person: PersonnelOption | undefined) {
    const t = this.template();
    return {
      personnelId: this.selectedId(),
      personnelGroupId: this.group().id,
      shiftTemplateId: t.id,
      unitId: this.unitId(),
      date: this.date(),
      shiftType: t.shiftType as 'day' | 'evening' | 'night' | 'morning',
      startTime: t.startTime,
      endTime: t.endTime,
      personnelType: person?.role || undefined,
    };
  }

  private async ensureSchedule(): Promise<string> {
    let sid = this.scheduleId();
    if (sid) return sid;
    const d = new Date(this.date() + 'T00:00:00');
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const res = await firstValueFrom(
      this.scheduleApi.publishUnitSchedule(this.unitType() as any, month, year),
    );
    if (res?.schedule?.id) sid = res.schedule.id;
    else if (res?.id) sid = res.id;
    return sid;
  }

  async save(): Promise<void> {
    const pid = this.selectedId();
    if (!pid) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const person = this.personnelList().find((p) => p.id === pid);
      const payload = this.buildPayload(person);
      const sid = await this.ensureSchedule();

      await firstValueFrom(
        this.scheduleApi.assignPersonShift(sid, payload, this.reason() || 'Manuel nöbet ataması'),
      );
      this.notification.success(
        'Nöbet Atandı',
        `${person?.name || 'Personel'} ${this.formattedDate()} tarihine atandı.`,
      );
      this.assignmentSaved.emit();
      this.closeDialog.emit();
    } catch (e: any) {
      const errBody = e?.error;
      if (errBody?.violations && Array.isArray(errBody.violations)) {
        this.backendViolations.set(errBody.violations);
        this.showOverrideConfirm.set(true);
      } else {
        const raw = e?.message || errBody?.message || 'Nöbet ataması yapılamadı.';
        this.error.set(raw);
      }
    } finally {
      this.saving.set(false);
    }
  }

  cancelOverride(): void {
    this.showOverrideConfirm.set(false);
    this.backendViolations.set([]);
    this.overrideReason.set('');
    this.overrideConfirmed.set(false);
  }

  async confirmOverride(): Promise<void> {
    if (!this.overrideReason().trim() || !this.overrideConfirmed()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const person = this.personnelList().find((p) => p.id === this.selectedId());
      const payload = this.buildPayload(person);
      const sid = await this.ensureSchedule();
      const violatedRules = this.backendViolations()
        .filter((v) => v.severity !== 'BLOCKING')
        .map((v) => v.rule);

      await firstValueFrom(
        this.scheduleApi.overridePersonShift(sid, payload, this.overrideReason(), violatedRules),
      );
      this.notification.success(
        'İstisna İle Atandı',
        `${person?.name || 'Personel'} yetkili istisna ile ${this.formattedDate()} tarihine atandı.`,
      );
      this.assignmentSaved.emit();
      this.closeDialog.emit();
    } catch (e: any) {
      const errBody = e?.error;
      const raw = e?.message || errBody?.message || 'İstisna ataması yapılamadı.';
      this.error.set(raw);
    } finally {
      this.saving.set(false);
    }
  }

  close(): void {
    this.closeDialog.emit();
  }

  getColor(name: string): string {
    const colors = [
      '#3b82f6',
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  protected roleLabel(role: string): string {
    const labels: Record<string, string> = {
      technician: 'Tekniker',
      assistant_technician: 'Yardımcı Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      head_technician: 'Baş Tekniker',
      supervisor: 'Süpervizör',
      field_supervisor: 'Saha Sorumlusu',
      medical_engineer: 'Medikal Mühendis',
      medical_physicist: 'Sağlık Fizikçisi',
      medical_physicist_2: 'Sağlık Fizikçisi 2',
      medical_physicist_3: 'Sağlık Fizikçisi 3',
      pharmacist: 'Farmasist',
      planning: 'Planlama',
    };
    return labels[role] || role;
  }

  protected shiftTypeLabel(t: string): string {
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
    };
    return map[t] || t;
  }

  protected formatDateShort(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }
}
