import { Component, input, signal, computed, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ScheduleAlert } from '../../services/schedule.service';

export interface AlertWarningItem {
  type: string;
  message: string;
  severity: 'warning' | 'error';
  date?: string;
  deviceId?: string;
  shiftType?: string;
  alertKey: string;
}

interface AlertRow {
  key: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  deviceId?: string;
  date?: string;
  shiftType?: string;
  alertKey?: string;
  canOpen: boolean;
}

@Component({
  selector: 'app-schedule-alerts',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalCount() > 0) {
      <div class="alerts-panel" [class.has-critical]="criticalCount() > 0">
        <div class="alerts-summary">
          <div class="alerts-summary-left">
            <svg
              class="alerts-bell"
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
            <span class="alerts-title">Uyarı Merkezi</span>
            @if (criticalCount() > 0) {
              <span class="summary-chip critical">{{ criticalCount() }} Kritik</span>
            }
            @if (warningCount() > 0) {
              <span class="summary-chip warning">{{ warningCount() }} Uyarı</span>
            }
            @if (infoCount() > 0) {
              <span class="summary-chip info">{{ infoCount() }} Bilgi</span>
            }
          </div>
          <button class="alerts-open" (click)="expanded.set(!expanded())">
            {{ expanded() ? 'Kapat' : 'Tümünü Gör (' + totalCount() + ')' }}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        @if (expanded()) {
          <div class="alerts-drawer">
            @for (item of combinedItems(); track $index + '|' + item.key) {
              <div class="alert-row" [class]="item.severity">
                <span class="alert-dot"></span>
                <span class="alert-row-msg">{{ item.message }}</span>
                <button
                  class="alert-row-action"
                  (click)="onResolveItem(item)"
                  [title]="item.canOpen ? 'İlgili hücreyi aç' : 'Bu uyarıyı kapat'"
                >
                  {{ item.canOpen ? 'Hücreye Git' : 'Kapat' }}
                </button>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .alerts-panel {
        margin: 0 16px 2px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-default);
        background: var(--bg-secondary);
        overflow: hidden;
      }
      .alerts-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 12px;
      }
      .alerts-summary-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .alerts-bell {
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .alerts-title {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .summary-chip {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .summary-chip.critical {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.25);
      }
      .summary-chip.warning {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.22);
      }
      .summary-chip.info {
        background: rgba(59, 130, 246, 0.1);
        color: #93c5fd;
        border: 1px solid rgba(59, 130, 246, 0.2);
      }
      .alerts-open {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: transparent;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--transition-fast);
      }
      .alerts-open:hover {
        color: var(--text-primary);
        border-color: var(--border-strong);
        background: rgba(255, 255, 255, 0.03);
      }
      .alerts-drawer {
        border-top: 1px solid var(--border-subtle);
        max-height: 240px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .alert-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        font-size: 11px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .alert-row:last-child {
        border-bottom: none;
      }
      .alert-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .alert-row.critical .alert-dot {
        background: #ef4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
      }
      .alert-row.warning .alert-dot {
        background: #f59e0b;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
      }
      .alert-row.info .alert-dot {
        background: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
      }
      .alert-row-msg {
        flex: 1;
        color: var(--text-primary);
        min-width: 0;
      }
      .alert-row-action {
        padding: 3px 10px;
        font-size: 9px;
        font-weight: 600;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-default);
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        flex-shrink: 0;
        white-space: nowrap;
        transition: all var(--transition-fast);
      }
      .alert-row.critical .alert-row-action {
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.25);
      }
      .alert-row.critical .alert-row-action:hover {
        background: rgba(239, 68, 68, 0.12);
        color: #fecaca;
      }
      .alert-row.warning .alert-row-action {
        color: #fbbf24;
        border-color: rgba(245, 158, 11, 0.25);
      }
      .alert-row.warning .alert-row-action:hover {
        background: rgba(245, 158, 11, 0.12);
        color: #fde68a;
      }
      .alert-row.info .alert-row-action {
        color: #93c5fd;
        border-color: rgba(59, 130, 246, 0.25);
      }
      .alert-row.info .alert-row-action:hover {
        background: rgba(59, 130, 246, 0.12);
        color: #bfdbfe;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .alerts-panel.has-critical .alerts-summary {
        animation: fadeIn 0.2s ease both;
      }
    `,
  ],
})
export class ScheduleAlertsComponent {
  alerts = input<ScheduleAlert[]>([]);
  warnings = input<AlertWarningItem[]>([]);
  resolve = output<{ alertKey?: string; deviceId?: string; date?: string; shiftType?: string }>();

  expanded = signal(false);

  criticalCount = computed(() => this.alerts().filter((a) => a.severity === 'critical').length);
  warningCount = computed(
    () => this.alerts().filter((a) => a.severity === 'warning').length + this.warnings().length,
  );
  infoCount = computed(() => this.alerts().filter((a) => a.severity === 'info').length);
  totalCount = computed(() => this.alerts().length + this.warnings().length);

  combinedItems = computed<AlertRow[]>(() => {
    const items: AlertRow[] = [];
    for (const a of this.alerts()) {
      items.push({
        key: `${a.type}|${a.deviceId || ''}|${a.date || ''}|${a.message}`,
        severity:
          a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
        message: a.message,
        deviceId: a.deviceId,
        date: a.date,
        shiftType: this.extractShiftType(a.message),
        alertKey: `${a.type}|${a.deviceId || ''}|${a.date || ''}|${a.message}`,
        canOpen: !!(a.deviceId && a.date),
      });
    }
    for (const w of this.warnings()) {
      items.push({
        key: `w|${w.alertKey}`,
        severity: w.severity === 'error' ? 'critical' : 'warning',
        message: w.message,
        deviceId: w.deviceId,
        date: w.date,
        shiftType: w.shiftType,
        alertKey: w.alertKey,
        canOpen: !!(w.deviceId && w.date && w.shiftType),
      });
    }
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return items.sort((x, y) => (order[x.severity] ?? 3) - (order[y.severity] ?? 3));
  });

  private extractShiftType(message: string): string | undefined {
    const m = message.toLocaleLowerCase('tr-TR');
    if (m.includes('gündüz') || m.includes('gunduz')) return 'day';
    if (m.includes('ikindi') || m.includes('öğle') || m.includes('ogle')) return 'evening';
    if (m.includes('sabah')) return 'morning';
    if (m.includes('gece')) return 'night';
    return undefined;
  }

  onResolveItem(item: AlertRow): void {
    if (item.canOpen) {
      this.resolve.emit({ deviceId: item.deviceId, date: item.date, shiftType: item.shiftType });
    } else if (item.alertKey) {
      this.resolve.emit({ alertKey: item.alertKey });
    }
  }
}
