import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-validation-panel',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header">
        <h4>Doğrulama Sonucu</h4>
        @if (validation) {
          <div
            class="validity"
            [class.valid]="validation.valid"
            [class.invalid]="!validation.valid"
          >
            {{ validation.valid ? '✓ GEÇERLİ' : '✗ GEÇERSİZ' }}
          </div>
        }
      </div>
      @if (validation) {
        <div class="panel-body">
          <div class="metric-grid">
            <div class="metric">
              <div class="metric-label">Sert İhlal</div>
              <div class="metric-value" [class.error]="validation.hardViolations.total > 0">
                {{ validation.hardViolations.total }}
              </div>
            </div>
            <div class="metric">
              <div class="metric-label">Uyarı</div>
              <div class="metric-value" [class.warning]="validation.softViolations.total > 0">
                {{ validation.softViolations.total }}
              </div>
            </div>
            <div class="metric">
              <div class="metric-label">Kademe</div>
              <div class="metric-value">
                {{ validation.coverage.coveragePercent | number: '1.0-1' }}%
              </div>
            </div>
            <div class="metric">
              <div class="metric-label">Dinlenme</div>
              <div class="metric-value">{{ restPercent | number: '1.0-1' }}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Genel Puan</div>
              <div class="metric-value score">{{ validation.score.overall | number: '1.0-1' }}</div>
            </div>
          </div>
          @if (validation.warnings.length > 0) {
            <div class="warnings">
              <h5>Uyarılar</h5>
              @for (w of validation.warnings; track w) {
                <div class="warning-item">{{ w }}</div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="panel-empty">Doğrulama henüz çalıştırılmadı.</div>
      }
    </div>
  `,
  styles: [
    `
      .panel {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .panel-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .panel-header h4 {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .validity {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 700;
      }
      .validity.valid {
        background: #d1fae5;
        color: #065f46;
      }
      .validity.invalid {
        background: #fee2e2;
        color: #991b1b;
      }
      .panel-body {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .metric {
        text-align: center;
        padding: 10px;
        background: var(--surface-hover, #f8fafc);
        border-radius: 8px;
      }
      .metric-label {
        font-size: 10px;
        color: var(--text-color-secondary, #94a3b8);
        margin-bottom: 4px;
      }
      .metric-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-color, #1e293b);
      }
      .metric-value.error {
        color: #ef4444;
      }
      .metric-value.warning {
        color: #f59e0b;
      }
      .metric-value.score {
        color: #6366f1;
      }
      .warnings {
        margin-top: 16px;
      }
      .warnings h5 {
        font-size: 12px;
        margin: 0 0 8px;
        color: var(--text-color-secondary, #64748b);
      }
      .warning-item {
        padding: 8px 10px;
        margin-bottom: 4px;
        background: #fffbeb;
        border-radius: 4px;
        font-size: 11px;
        color: #92400e;
      }
      .panel-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--text-color-secondary, #94a3b8);
        font-size: 13px;
      }
    `,
  ],
})
export class ValidationPanelComponent {
  private readonly store = inject(ScheduleStore);

  get validation() {
    return this.store.validationResult();
  }

  get restPercent(): number {
    const v = this.validation;
    if (!v) return 0;
    const minRest = v.fatigue.minRestHours;
    return minRest >= 11 ? 100 : Math.round((minRest / 11) * 100);
  }
}
