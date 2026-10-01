import { Component, inject, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-publish-dialog',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="dialog-overlay" (click)="close.emit()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <h3>Planı Yayınla</h3>
            <button class="close-btn" (click)="close.emit()">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="warning-banner">
              <span class="warning-icon">⚠</span>
              <span
                >Yayınlanan plan değiştirilemez. Yeni değişiklikler için_revizyon_oluşturmanız
                gerekir.</span
              >
            </div>
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-label">Sürüm</span>
                <span class="stat-value">v{{ version() }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Atama</span>
                <span class="stat-value">{{ assignmentCount() }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Kapsama</span>
                <span
                  class="stat-value"
                  [class.ok]="coverage() >= 90"
                  [class.warn]="coverage() < 90"
                  >{{ coverage() | number: '1.0-1' }}%</span
                >
              </div>
              <div class="stat">
                <span class="stat-label">Puan</span>
                <span class="stat-value" [class.ok]="score() >= 80" [class.warn]="score() < 80">{{
                  score() | number: '1.0-1'
                }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Ciddi İhlal</span>
                <span
                  class="stat-value"
                  [class.error]="hardViolations() > 0"
                  [class.ok]="hardViolations() === 0"
                  >{{ hardViolations() }}</span
                >
              </div>
              <div class="stat">
                <span class="stat-label">Uyarı</span>
                <span class="stat-value" [class.warn]="softViolations() > 0">{{
                  softViolations()
                }}</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-secondary" (click)="close.emit()">İptal</button>
            <button
              class="btn-primary"
              (click)="onConfirm()"
              [disabled]="publishing() || hardViolations() > 0"
            >
              {{ publishing() ? 'Yayınlanıyor...' : 'Yayınla' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .dialog {
        background: white;
        border-radius: 12px;
        width: 440px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e2e8f0;
      }
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #94a3b8;
        padding: 4px 8px;
        border-radius: 4px;
      }
      .close-btn:hover {
        background: #f1f5f9;
        color: #1e293b;
      }
      .dialog-body {
        padding: 20px;
      }
      .warning-banner {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #92400e;
      }
      .warning-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px;
        background: #f8fafc;
        border-radius: 6px;
      }
      .stat-label {
        font-size: 11px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .stat-value {
        font-size: 18px;
        font-weight: 700;
        color: #1e293b;
      }
      .stat-value.ok {
        color: #10b981;
      }
      .stat-value.warn {
        color: #f59e0b;
      }
      .stat-value.error {
        color: #ef4444;
      }
      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid #e2e8f0;
      }
      .btn-secondary {
        padding: 8px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: white;
        font-size: 13px;
        cursor: pointer;
      }
      .btn-primary {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        background: #3b82f6;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class PublishDialogComponent {
  private readonly store = inject(ScheduleStore);

  readonly open = signal(false);
  readonly close = output<void>();
  readonly confirm = output<void>();
  readonly publishing = signal(false);

  readonly version = () => this.store.version();
  readonly assignmentCount = () => this.store.assignmentCount();
  readonly coverage = () => this.store.coveragePercent();
  readonly score = () => this.store.overallScore();
  readonly hardViolations = () => this.store.hardViolationCount();
  readonly softViolations = () => this.store.softViolationCount();

  onConfirm(): void {
    this.publishing.set(true);
    this.store.setPublishing(true);
    this.confirm.emit();
  }

  openDialog(): void {
    this.open.set(true);
    this.publishing.set(false);
  }

  reset(): void {
    this.publishing.set(false);
  }
}
