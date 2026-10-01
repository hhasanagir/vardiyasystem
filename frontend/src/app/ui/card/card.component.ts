import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { SkeletonComponent } from '../skeleton/skeleton.component';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div
      class="card"
      [class.card-clickable]="clickable()"
      [class.card-loading]="loading()"
      [attr.role]="clickable() ? 'button' : null"
      [attr.tabindex]="clickable() ? 0 : null"
    >
      @if (loading()) {
        <app-skeleton variant="card" />
      } @else {
        @if (header()) {
          <div class="card-header">
            <h3 class="card-title">{{ header() }}</h3>
            @if (subtitle()) {
              <p class="card-subtitle">{{ subtitle() }}</p>
            }
            <ng-content select="[card-header-right]" />
          </div>
        }
        <div class="card-body">
          <ng-content />
        </div>
        @if (footer()) {
          <div class="card-footer">
            <ng-content select="[card-footer]" />
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .card {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition:
          box-shadow 0.2s ease,
          border-color 0.2s ease;
      }
      .card-clickable {
        cursor: pointer;
      }
      .card-clickable:hover {
        box-shadow: var(--shadow-md);
        border-color: var(--border-strong);
      }
      .card-clickable:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .card-loading {
        min-height: 8rem;
      }
      .card-header {
        padding: var(--spacing-lg) var(--spacing-lg) 0;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--spacing-md);
      }
      .card-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }
      .card-subtitle {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin: 0.25rem 0 0;
      }
      .card-body {
        padding: var(--spacing-lg);
      }
      .card-footer {
        padding: 0 var(--spacing-lg) var(--spacing-lg);
        border-top: 1px solid var(--border-subtle);
        padding-top: var(--spacing-md);
        margin-top: var(--spacing-sm);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
  readonly header = input('');
  readonly subtitle = input('');
  readonly footer = input('');
  readonly clickable = input(false);
  readonly loading = input(false);
}
