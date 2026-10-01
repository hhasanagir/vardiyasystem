import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import {
  CONFLICT_CODE_LABELS,
  CONFLICT_SEVERITY_COLORS,
  CONFLICT_SEVERITY_LABELS,
  type ConflictDTO,
} from '../../models';

@Component({
  selector: 'app-conflict-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header">
        <h4>Çakışmalar</h4>
        <div class="summary">
          @if (criticalCount > 0) {
            <span class="severity-chip critical">{{ criticalCount }} Kritik</span>
          }
          @if (errorCount > 0) {
            <span class="severity-chip error">{{ errorCount }} Hata</span>
          }
          @if (warningCount > 0) {
            <span class="severity-chip warning">{{ warningCount }} Uyarı</span>
          }
          @if (conflicts.length === 0) {
            <span class="no-conflicts">Çakışma bulunmuyor</span>
          }
        </div>
      </div>
      <div class="panel-body">
        @for (conflict of conflicts; track conflict.id) {
          <div
            class="conflict-item"
            [style.border-left-color]="getSeverityColor(conflict.severity)"
          >
            <div class="conflict-header">
              <span class="conflict-code">{{ getCodeLabel(conflict.code) }}</span>
              <span
                class="severity-dot"
                [style.background]="getSeverityColor(conflict.severity)"
              ></span>
            </div>
            <div class="conflict-message">{{ conflict.message }}</div>
            <div class="conflict-context">
              @if (conflict.context.personnelName) {
                <span>Personel: {{ conflict.context.personnelName }}</span>
              }
              <span>Tarih: {{ conflict.context.date }}</span>
              @if (conflict.context.startTime) {
                <span>Saat: {{ conflict.context.startTime }}-{{ conflict.context.endTime }}</span>
              }
              @if (conflict.context.restHours !== undefined) {
                <span
                  >Dinlenme: {{ conflict.context.restHours }}h (min:
                  {{ conflict.context.minRestHours }}h)</span
                >
              }
            </div>
          </div>
        }
      </div>
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
      .summary {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .severity-chip {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
        color: white;
      }
      .severity-chip.critical {
        background: #dc2626;
      }
      .severity-chip.error {
        background: #ef4444;
      }
      .severity-chip.warning {
        background: #f59e0b;
      }
      .no-conflicts {
        font-size: 12px;
        color: #10b981;
      }
      .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 16px;
      }
      .conflict-item {
        padding: 10px 12px;
        margin-bottom: 8px;
        border-left: 3px solid;
        background: var(--surface-hover, #f8fafc);
        border-radius: 0 6px 6px 0;
      }
      .conflict-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .conflict-code {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-color, #1e293b);
      }
      .severity-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .conflict-message {
        font-size: 12px;
        color: var(--text-color-secondary, #475569);
        margin-bottom: 4px;
      }
      .conflict-context {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 10px;
        color: var(--text-color-secondary, #94a3b8);
      }
    `,
  ],
})
export class ConflictPanelComponent {
  private readonly store = inject(ScheduleStore);

  get conflicts(): ConflictDTO[] {
    return this.store.conflicts();
  }
  get criticalCount(): number {
    return this.conflicts.filter((c) => c.severity === 'CRITICAL').length;
  }
  get errorCount(): number {
    return this.conflicts.filter((c) => c.severity === 'ERROR').length;
  }
  get warningCount(): number {
    return this.conflicts.filter((c) => c.severity === 'WARNING').length;
  }

  getCodeLabel(code: string): string {
    return CONFLICT_CODE_LABELS[code as keyof typeof CONFLICT_CODE_LABELS] ?? code;
  }

  getSeverityColor(severity: string): string {
    return CONFLICT_SEVERITY_COLORS[severity as keyof typeof CONFLICT_SEVERITY_COLORS] ?? '#94a3b8';
  }
}
