import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { ScheduleStatus } from '../../models';
import type { ScheduleTab } from '../../store/schedule.store';

@Component({
  selector: 'app-schedule-toolbar',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">Vardiya Planı</span>
        @if (status) {
          <span class="status-badge" [class]="'status-' + status">{{ statusLabel }}</span>
        }
        @if (version > 0) {
          <span class="version-badge">v{{ version }}</span>
        }
        @if (score !== null && score !== undefined) {
          <span
            class="score-badge"
            [class.high]="score >= 80"
            [class.mid]="score >= 60 && score < 80"
            [class.low]="score < 60"
          >
            {{ score | number: '1.0-1' }}
          </span>
        }
        @if (connectionState && connectionState !== 'connected') {
          <span class="connection-badge" [class]="connectionState">{{ connectionLabel }}</span>
        }
      </div>
      <div class="toolbar-right">
        @switch (status) {
          @case ('draft') {
            <button
              class="toolbar-btn btn-generate"
              (click)="generate.emit()"
              [disabled]="executing || generating"
            >
              {{ generating ? 'Üretiliyor...' : 'Vardiya Üret' }}
            </button>
            <button class="toolbar-btn btn-validate" (click)="validate.emit()" [disabled]="loading">
              Doğrula
            </button>
          }
          @case ('rejected') {
            <button
              class="toolbar-btn btn-generate"
              (click)="generate.emit()"
              [disabled]="executing || generating"
            >
              Yeniden Üret
            </button>
            <button class="toolbar-btn btn-validate" (click)="validate.emit()" [disabled]="loading">
              Doğrula
            </button>
            <button
              class="toolbar-btn btn-review"
              (click)="submitReview.emit()"
              [disabled]="executing || loading"
            >
              İncelemeye Gönder
            </button>
          }
          @case ('generated') {
            <button class="toolbar-btn btn-validate" (click)="validate.emit()" [disabled]="loading">
              Doğrula
            </button>
            <button
              class="toolbar-btn btn-review"
              (click)="submitReview.emit()"
              [disabled]="executing || loading"
            >
              İncelemeye Gönder
            </button>
          }
          @case ('validated') {
            <button
              class="toolbar-btn btn-review"
              (click)="submitReview.emit()"
              [disabled]="executing || loading"
            >
              İncelemeye Gönder
            </button>
          }
          @case ('under_review') {
            <button class="toolbar-btn btn-approve" (click)="approve.emit()" [disabled]="executing">
              Onayla
            </button>
            <button class="toolbar-btn btn-reject" (click)="reject.emit()" [disabled]="executing">
              Reddet
            </button>
          }
          @case ('approved') {
            <button class="toolbar-btn btn-publish" (click)="publish.emit()" [disabled]="executing">
              Yayınla
            </button>
          }
          @case ('published') {
            <button class="toolbar-btn btn-archive" (click)="archive.emit()" [disabled]="executing">
              Arşivle
            </button>
          }
          @case ('archived') {
            <button
              class="toolbar-btn btn-revert"
              (click)="revertToDraft.emit()"
              [disabled]="executing"
            >
              Taslağa Dön
            </button>
          }
        }
        <button class="toolbar-btn btn-refresh" (click)="refresh.emit()" [disabled]="loading">
          ↻
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: var(--surface-card, #fff);
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .toolbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .toolbar-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-color, #1e293b);
      }
      .status-badge {
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .status-draft {
        background: #f1f5f9;
        color: #64748b;
      }
      .status-generated {
        background: #ede9fe;
        color: #6d28d9;
      }
      .status-validated {
        background: #d1fae5;
        color: #065f46;
      }
      .status-under_review {
        background: #fef3c7;
        color: #92400e;
      }
      .status-approved {
        background: #d1fae5;
        color: #065f46;
      }
      .status-published {
        background: #dbeafe;
        color: #1e40af;
      }
      .status-archived {
        background: #f3f4f6;
        color: #6b7280;
      }
      .status-rejected {
        background: #fee2e2;
        color: #991b1b;
      }
      .version-badge {
        padding: 2px 8px;
        border-radius: 4px;
        background: var(--surface-hover, #f1f5f9);
        font-size: 11px;
        font-weight: 500;
        color: var(--text-color-secondary, #64748b);
      }
      .score-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      .score-badge.high {
        background: #d1fae5;
        color: #065f46;
      }
      .score-badge.mid {
        background: #fef3c7;
        color: #92400e;
      }
      .score-badge.low {
        background: #fee2e2;
        color: #991b1b;
      }
      .connection-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
      }
      .connection-badge.connecting {
        background: #fef3c7;
        color: #92400e;
      }
      .connection-badge.disconnected {
        background: #fee2e2;
        color: #991b1b;
      }
      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .toolbar-btn {
        padding: 6px 14px;
        border: 1px solid var(--surface-border, #e2e8f0);
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        background: var(--surface-card, #fff);
        color: var(--text-color, #1e293b);
      }
      .toolbar-btn:hover:not(:disabled) {
        background: var(--surface-hover, #f1f5f9);
      }
      .toolbar-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-generate {
        border-color: #6366f1;
        color: #6366f1;
      }
      .btn-validate {
        border-color: #6366f1;
        color: #6366f1;
      }
      .btn-review {
        background: #6366f1;
        color: white;
        border-color: #6366f1;
      }
      .btn-approve {
        background: #10b981;
        color: white;
        border-color: #10b981;
      }
      .btn-reject {
        background: #ef4444;
        color: white;
        border-color: #ef4444;
      }
      .btn-publish {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }
      .btn-archive {
        background: #6b7280;
        color: white;
        border-color: #6b7280;
      }
      .btn-revert {
        border-color: #f59e0b;
        color: #92400e;
        background: #fffbeb;
      }
      .btn-refresh {
        padding: 6px 10px;
        font-size: 16px;
      }
    `,
  ],
})
export class ScheduleToolbarComponent {
  @Input() scheduleId: string | null = null;
  @Input() status: ScheduleStatus | null = null;
  @Input() version = 0;
  @Input() loading = false;
  @Input() executing = false;
  @Input() isEditable = false;
  @Input() score: number | null = null;
  @Input() generating = false;
  @Input() connectionState: string | null = null;

  @Output() unitChange = new EventEmitter<string>();
  @Output() monthChange = new EventEmitter<{ month: number; year: number }>();
  @Output() validate = new EventEmitter<void>();
  @Output() submitReview = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
  @Output() publish = new EventEmitter<void>();
  @Output() archive = new EventEmitter<void>();
  @Output() revertToDraft = new EventEmitter<void>();
  @Output() rollback = new EventEmitter<number>();
  @Output() refresh = new EventEmitter<void>();
  @Output() generate = new EventEmitter<void>();

  get statusLabel(): string {
    const labels: Record<string, string> = {
      draft: 'Taslak',
      generated: 'Üretildi',
      validated: 'Doğrulandı',
      under_review: 'İnceleniyor',
      approved: 'Onaylandı',
      published: 'Yayında',
      archived: 'Arşiv',
      rejected: 'Reddedildi',
    };
    return labels[this.status ?? ''] ?? this.status ?? '';
  }

  get connectionLabel(): string {
    const labels: Record<string, string> = {
      connecting: 'Bağlanıyor...',
      disconnected: 'Bağlantı yok',
    };
    return labels[this.connectionState ?? ''] ?? '';
  }
}
