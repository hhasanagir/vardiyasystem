import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import {
  isHardConflict,
  CONFLICT_CODE_LABELS,
  CONFLICT_SEVERITY_LABELS,
  type ConflictDTO,
  type ConflictSeverityLevel,
} from '../../models';

@Component({
  selector: 'app-conflict-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="conflict-view">
      @if (conflicts().length > 0) {
        <div class="conflict-summary">
          <span class="summary-count error">{{ hardCount() }} Ciddi</span>
          <span class="summary-count warn">{{ softCount() }} Uyari</span>
        </div>
        <div class="conflict-list">
          @for (c of conflicts(); track c.id) {
            <div
              class="conflict-card"
              [class.hard]="isHard(c.severity)"
              [class.soft]="!isHard(c.severity)"
            >
              <div class="card-header">
                <span class="card-severity" [class]="'sev-' + getSeverityClass(c.severity)">{{
                  getSeverityLabel(c.severity)
                }}</span>
                <span class="card-rule">{{ getCodeLabel(c.code) }}</span>
              </div>
              <div class="card-message">{{ c.message }}</div>
              @if (c.context.personnelId) {
                <div class="card-context">
                  Personel: {{ c.context.personnelName ?? c.context.personnelId }}
                </div>
              }
              @if (c.context.date) {
                <div class="card-context">Tarih: {{ c.context.date }}</div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="empty-view">Cakisma bulunmuyor.</div>
      }
    </div>
  `,
  styles: [
    `
      .conflict-view {
        padding: 16px;
      }
      .conflict-summary {
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
      }
      .summary-count {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
      }
      .summary-count.error {
        background: var(--color-critical-bg, #fee2e2);
        color: var(--color-critical, #ef4444);
      }
      .summary-count.warn {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #f59e0b);
      }
      .conflict-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .conflict-card {
        padding: 10px 14px;
        background: var(--surface-card, #fff);
        border-radius: 8px;
        border-left: 4px solid;
      }
      .conflict-card.hard {
        border-left-color: var(--color-critical, #ef4444);
      }
      .conflict-card.soft {
        border-left-color: var(--color-warning, #f59e0b);
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .card-severity {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .sev-error {
        color: var(--color-critical, #ef4444);
      }
      .sev-critical {
        color: var(--color-critical, #dc2626);
      }
      .sev-warning {
        color: var(--color-warning, #f59e0b);
      }
      .sev-info {
        color: #3b82f6;
      }
      .card-rule {
        font-size: 10px;
        color: var(--color-text-muted, #94a3b8);
      }
      .card-message {
        font-size: 12px;
        color: var(--color-text, #1e293b);
        margin-bottom: 4px;
      }
      .card-context {
        font-size: 11px;
        color: var(--color-text-secondary, #64748b);
      }
      .empty-view {
        text-align: center;
        padding: 40px;
        color: var(--color-text-muted, #94a3b8);
      }
    `,
  ],
})
export class ConflictViewComponent {
  private readonly store = inject(ScheduleStore);

  readonly conflicts = this.store.conflicts;
  readonly hardCount = computed(() => this.store.validationResult()?.hardViolations.total ?? 0);
  readonly softCount = computed(() => this.store.validationResult()?.softViolations.total ?? 0);

  isHard(severity: ConflictSeverityLevel): boolean {
    return isHardConflict(severity);
  }

  getSeverityClass(severity: ConflictSeverityLevel): string {
    return severity.toLowerCase();
  }

  getSeverityLabel(severity: ConflictSeverityLevel): string {
    return CONFLICT_SEVERITY_LABELS[severity] ?? severity;
  }

  getCodeLabel(code: string): string {
    return (CONFLICT_CODE_LABELS as Record<string, string>)[code] ?? code;
  }
}
