import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KpiCardData, KpiSize } from './kpi-card.types';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="kpi-card"
      [style.--kpi-color]="kpi().color"
      [class.kpi-card-sm]="size() === 'sm'"
      [class.kpi-card-lg]="size() === 'lg'"
    >
      <div class="kpi-icon-wrapper">
        <div class="kpi-icon" [innerHTML]="kpi().icon"></div>
      </div>
      <div class="kpi-body">
        <div class="kpi-value-row">
          <span class="kpi-value"
            >{{ kpi().value }}
            @if (kpi().unit) {
              <span class="kpi-unit">{{ kpi().unit }}</span>
            }
          </span>
          @if (kpi().trend !== undefined && kpi().trend !== null) {
            <span
              class="kpi-trend"
              [class.trend-up]="(kpi().trend ?? 0) >= 0"
              [class.trend-down]="(kpi().trend ?? 0) < 0"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                @if ((kpi().trend ?? 0) >= 0) {
                  <polyline points="18 15 12 9 6 15" />
                } @else {
                  <polyline points="6 9 12 15 18 9" />
                }
              </svg>
              {{ (kpi().trend ?? 0) >= 0 ? '+' : '' }}{{ kpi().trend }}
            </span>
          }
        </div>
        <span class="kpi-label">{{ kpi().label }}</span>
        @if (kpi().comparison) {
          <span class="kpi-comparison">{{ kpi().comparison }}</span>
        }
      </div>
      @if (kpi().status) {
        <span
          class="kpi-status-dot"
          [class.dot-healthy]="kpi().status === 'healthy'"
          [class.dot-warning]="kpi().status === 'warning'"
          [class.dot-critical]="kpi().status === 'critical'"
        ></span>
      }
    </div>
  `,
  styles: [
    `
      .kpi-card {
        display: flex;
        align-items: stretch;
        gap: 14px;
        padding: 18px 20px;
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        transition:
          border-color var(--transition-polish),
          box-shadow var(--transition-polish),
          transform var(--transition-fast);
        position: relative;
        overflow: hidden;
      }
      .kpi-card:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-card);
        transform: translateY(-1px);
      }
      .kpi-card-sm {
        padding: 12px 14px;
        gap: 10px;
      }
      .kpi-card-lg {
        padding: 22px 24px;
        gap: 16px;
      }

      .kpi-icon-wrapper {
        display: flex;
        align-items: flex-start;
        flex-shrink: 0;
      }
      .kpi-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-lg);
        background: color-mix(in srgb, var(--kpi-color) 12%, transparent);
        color: var(--kpi-color);
      }
      .kpi-card-sm .kpi-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
      }
      .kpi-card-sm .kpi-icon svg {
        width: 16px;
        height: 16px;
      }
      .kpi-card-lg .kpi-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-xl);
      }

      .kpi-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .kpi-value-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .kpi-value {
        font-size: 26px;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.5px;
        line-height: 1.2;
      }
      .kpi-card-sm .kpi-value {
        font-size: 20px;
      }
      .kpi-card-lg .kpi-value {
        font-size: 32px;
      }
      .kpi-unit {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-muted);
        margin-left: 1px;
      }
      .kpi-trend {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        white-space: nowrap;
      }
      .kpi-trend.trend-up {
        color: var(--status-success);
        background: color-mix(in srgb, var(--status-success) 12%, transparent);
      }
      .kpi-trend.trend-down {
        color: var(--status-error);
        background: color-mix(in srgb, var(--status-error) 12%, transparent);
      }

      .kpi-label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
      }
      .kpi-comparison {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 2px;
      }

      .kpi-status-dot {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .dot-healthy {
        background: var(--status-success);
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
      }
      .dot-warning {
        background: var(--status-warning);
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
      }
      .dot-critical {
        background: var(--status-error);
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
      }
    `,
  ],
})
export class KpiCardComponent {
  readonly kpi = input.required<KpiCardData>();
  readonly size = input<KpiSize>('md');
}
