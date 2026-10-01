import { Component, input, ChangeDetectionStrategy } from '@angular/core';

export type SkeletonVariant = 'text' | 'card' | 'table-row' | 'avatar' | 'chart' | 'kpi';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `
    <div
      class="skeleton"
      [class]="variant()"
      [style.width]="width()"
      [style.height]="height()"
      [style.border-radius]="radius()"
    >
      @if (variant() === 'card') {
        <div class="skeleton-card">
          <div class="skeleton-line w-3/4"></div>
          <div class="skeleton-line w-1/2"></div>
          <div class="skeleton-line w-full"></div>
        </div>
      }
      @if (variant() === 'table-row') {
        <div class="skeleton-table-row">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-cell"></div>
          <div class="skeleton-cell"></div>
          <div class="skeleton-cell w-24"></div>
        </div>
      }
      @if (variant() === 'kpi') {
        <div class="skeleton-kpi">
          <div class="skeleton-line w-16 h-3"></div>
          <div class="skeleton-line w-24 h-8 mt-2"></div>
          <div class="skeleton-line w-12 h-3 mt-1"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .skeleton {
        display: flex;
      }
      .skeleton-line {
        background: linear-gradient(
          90deg,
          var(--bg-secondary) 25%,
          var(--bg-hover) 50%,
          var(--bg-secondary) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: var(--radius-sm);
        height: 1rem;
        margin-bottom: 0.5rem;
      }
      .skeleton-card {
        padding: 1.5rem;
        width: 100%;
      }
      .skeleton-table-row {
        display: flex;
        gap: 1rem;
        align-items: center;
        padding: 0.75rem 1rem;
        width: 100%;
      }
      .skeleton-avatar {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 9999px;
        background: var(--bg-secondary);
        animation: shimmer 1.5s ease-in-out infinite;
      }
      .skeleton-cell {
        flex: 1;
        height: 1rem;
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        animation: shimmer 1.5s ease-in-out infinite;
      }
      .skeleton-kpi {
        padding: 1rem;
        width: 100%;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly width = input('100%');
  readonly height = input('auto');
  readonly radius = input('var(--radius-md)');
}
