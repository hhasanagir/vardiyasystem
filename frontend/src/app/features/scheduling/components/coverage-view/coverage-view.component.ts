import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-coverage-view',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coverage-view">
      @if (coverage(); as cov) {
        <div class="coverage-header">
          <div class="big-number" [class.complete]="cov.percent === 100">
            {{ cov.percent | number: '1.0-1' }}%
          </div>
          <div class="subtitle">{{ cov.filled }} / {{ cov.total }} slot dolu</div>
        </div>
        <div class="date-grid">
          @for (d of dateCoverages(); track d.date) {
            <div
              class="date-row"
              [class.complete]="d.percent === 100"
              [class.partial]="d.percent > 0 && d.percent < 100"
              [class.empty]="d.percent === 0"
            >
              <span class="date-label">{{ d.label }}</span>
              <div class="date-bar">
                <div class="date-fill" [style.width.%]="d.percent"></div>
              </div>
              <span class="date-percent">{{ d.percent }}%</span>
            </div>
          }
        </div>
      } @else {
        <div class="empty-view">Kademe verisi hesaplanmadi.</div>
      }
    </div>
  `,
  styles: [
    `
      .coverage-view {
        padding: 16px;
      }
      .coverage-header {
        text-align: center;
        margin-bottom: 20px;
      }
      .big-number {
        font-size: 48px;
        font-weight: 700;
        color: var(--color-text, #1e293b);
      }
      .big-number.complete {
        color: var(--color-valid, #10b981);
      }
      .subtitle {
        font-size: 13px;
        color: var(--color-text-muted, #94a3b8);
      }
      .date-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .date-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .date-label {
        width: 60px;
        font-size: 11px;
        color: var(--color-text-secondary, #64748b);
        text-align: right;
        flex-shrink: 0;
      }
      .date-bar {
        flex: 1;
        height: 6px;
        background: var(--surface-border, #e2e8f0);
        border-radius: 3px;
        overflow: hidden;
      }
      .date-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.3s;
      }
      .complete .date-fill {
        background: var(--color-valid, #10b981);
      }
      .partial .date-fill {
        background: var(--color-warning, #f59e0b);
      }
      .empty .date-fill {
        background: var(--color-critical, #ef4444);
      }
      .date-percent {
        width: 40px;
        font-size: 11px;
        font-weight: 600;
        text-align: right;
      }
      .complete .date-percent {
        color: var(--color-valid, #10b981);
      }
      .partial .date-percent {
        color: var(--color-warning, #f59e0b);
      }
      .empty .date-percent {
        color: var(--color-critical, #ef4444);
      }
      .empty-view {
        text-align: center;
        padding: 40px;
        color: var(--color-text-muted, #94a3b8);
      }
    `,
  ],
})
export class CoverageViewComponent {
  private readonly store = inject(ScheduleStore);

  readonly coverage = computed(() => {
    const v = this.store.validationResult()?.coverage;
    if (!v) return null;
    return { percent: v.coveragePercent, filled: v.filledSlots, total: v.totalSlots };
  });

  readonly dateCoverages = computed(() => {
    const assignments = this.store.assignments();
    const s = this.store.schedule();
    if (!s) return [];
    const daysInMonth = new Date(s.year, s.month, 0).getDate();
    const totalDevices = this.store.uniqueDevices().length || 1;
    const result: Array<{ date: string; label: string; percent: number }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${s.year}-${String(s.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayAssignments = assignments.filter((a) => a.date === dateStr);
      const percent = Math.round((dayAssignments.length / totalDevices) * 100);
      result.push({ date: dateStr, label: `${d}`, percent: Math.min(percent, 100) });
    }
    return result;
  });
}
