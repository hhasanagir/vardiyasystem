import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty-state" role="status" aria-label="Veri bulunamadı">
      <div class="empty-state-icon" [innerHTML]="icon()"></div>
      <h3 class="empty-state-title">{{ title() }}</h3>
      @if (description()) {
        <p class="empty-state-description">{{ description() }}</p>
      }
      @if (actionLabel()) {
        <button class="empty-state-action" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--spacing-2xl) var(--spacing-lg);
        min-height: 16rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        border: 2px dashed var(--border-subtle);
      }
      .empty-state-icon {
        width: 4rem;
        height: 4rem;
        color: var(--text-muted);
        margin-bottom: var(--spacing-lg);
        opacity: 0.6;
      }
      .empty-state-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: var(--spacing-xs);
      }
      .empty-state-description {
        font-size: 0.875rem;
        color: var(--text-muted);
        max-width: 24rem;
        line-height: 1.5;
        margin-bottom: var(--spacing-lg);
      }
      .empty-state-action {
        padding: 0.5rem 1.25rem;
        background: var(--accent-gradient, var(--primary));
        color: white;
        border: none;
        border-radius: var(--radius-md);
        font-weight: 500;
        font-size: 0.875rem;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      .empty-state-action:hover {
        opacity: 0.9;
      }
      .empty-state-action:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>`,
  );
  readonly title = input('Veri bulunamadı');
  readonly description = input('');
  readonly actionLabel = input('');
  readonly action = output<void>();
}
