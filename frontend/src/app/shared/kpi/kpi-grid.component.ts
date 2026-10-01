import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KpiCardComponent } from './kpi-card.component';
import { KpiCardData, KpiSize } from './kpi-card.types';

@Component({
  selector: 'app-kpi-grid',
  standalone: true,
  imports: [CommonModule, KpiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="kpi-grid" [class.kpi-grid-compact]="size() === 'sm'">
        @for (i of skeletonArray(); track i) {
          <div class="kpi-skeleton">
            <div class="kpi-skeleton-icon"></div>
            <div class="kpi-skeleton-body">
              <div class="kpi-skeleton-value"></div>
              <div class="kpi-skeleton-label"></div>
            </div>
          </div>
        }
      </div>
    } @else if (error(); as err) {
      <div class="kpi-error">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{{ err }}</span>
        <button class="kpi-retry-btn" (click)="retry.emit()">Tekrar Dene</button>
      </div>
    } @else if (kpis().length === 0) {
      <div class="kpi-empty">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        <span>{{ emptyMessage() }}</span>
      </div>
    } @else {
      <div
        class="kpi-grid"
        [class.kpi-grid-compact]="size() === 'sm'"
        [class.kpi-grid-spacious]="size() === 'lg'"
      >
        @for (kpi of kpis(); track kpi.id) {
          <app-kpi-card [kpi]="kpi" [size]="size() === 'sm' ? 'sm' : 'md'" />
        }
      </div>
    }
  `,
  styles: [
    `
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }
      .kpi-grid-compact {
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 12px;
      }
      .kpi-grid-spacious {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 20px;
      }

      .kpi-skeleton {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 20px;
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
      }
      .kpi-skeleton-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-lg);
        flex-shrink: 0;
        background: linear-gradient(
          90deg,
          rgba(30, 41, 59, 0.4) 25%,
          rgba(51, 65, 85, 0.4) 50%,
          rgba(30, 41, 59, 0.4) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }
      .kpi-skeleton-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .kpi-skeleton-value {
        height: 22px;
        width: 80px;
        border-radius: var(--radius-sm);
        background: linear-gradient(
          90deg,
          rgba(30, 41, 59, 0.4) 25%,
          rgba(51, 65, 85, 0.4) 50%,
          rgba(30, 41, 59, 0.4) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }
      .kpi-skeleton-label {
        height: 11px;
        width: 60px;
        border-radius: var(--radius-sm);
        background: linear-gradient(
          90deg,
          rgba(30, 41, 59, 0.4) 25%,
          rgba(51, 65, 85, 0.4) 50%,
          rgba(30, 41, 59, 0.4) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }

      .kpi-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: color-mix(in srgb, var(--status-error) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--status-error) 20%, transparent);
        border-radius: var(--radius-lg);
        color: var(--status-error);
        font-size: 13px;
      }
      .kpi-retry-btn {
        margin-left: auto;
        padding: 4px 12px;
        border-radius: var(--radius-md);
        border: 1px solid color-mix(in srgb, var(--status-error) 30%, transparent);
        background: transparent;
        color: var(--status-error);
        font-size: 12px;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .kpi-retry-btn:hover {
        background: color-mix(in srgb, var(--status-error) 12%, transparent);
      }

      .kpi-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 32px;
        color: var(--text-muted);
      }
      .kpi-empty svg {
        opacity: 0.25;
      }
      .kpi-empty span {
        font-size: 13px;
      }
    `,
  ],
})
export class KpiGridComponent {
  readonly kpis = input.required<KpiCardData[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly emptyMessage = input('Henüz veri bulunmuyor');
  readonly size = input<KpiSize>('md');
  readonly skeletonCount = input(4);
  readonly retry = output<void>();

  readonly skeletonArray = computed(() =>
    Array.from({ length: this.skeletonCount() }, (_, i) => i),
  );
}
