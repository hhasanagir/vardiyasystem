import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <div class="error-state" role="alert" aria-live="assertive">
      <div class="error-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          width="48"
          height="48"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="error-title">{{ title() }}</h3>
      @if (description()) {
        <p class="error-description">{{ description() }}</p>
      }
      @if (showDetails() && details()) {
        <details class="error-details">
          <summary>Detaylar</summary>
          <pre>{{ details() }}</pre>
        </details>
      }
      <div class="error-actions">
        @if (retryLabel()) {
          <button class="error-retry-btn" (click)="retry.emit()">
            {{ retryLabel() }}
          </button>
        }
        @if (fallbackLabel()) {
          <button class="error-fallback-btn" (click)="fallback.emit()">
            {{ fallbackLabel() }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--spacing-2xl) var(--spacing-lg);
        min-height: 16rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        border: 1px solid color-mix(in srgb, var(--status-danger) 20%, transparent);
      }
      .error-icon {
        color: var(--status-danger);
        margin-bottom: var(--spacing-lg);
      }
      .error-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: var(--spacing-xs);
      }
      .error-description {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-bottom: var(--spacing-lg);
        max-width: 28rem;
      }
      .error-details {
        margin-bottom: var(--spacing-lg);
        text-align: left;
        width: 100%;
        max-width: 28rem;
      }
      .error-details summary {
        cursor: pointer;
        font-size: 0.8rem;
        color: var(--text-muted);
      }
      .error-details pre {
        font-size: 0.75rem;
        background: var(--bg-primary);
        padding: var(--spacing-md);
        border-radius: var(--radius-sm);
        overflow-x: auto;
        margin-top: var(--spacing-xs);
        color: var(--text-secondary);
      }
      .error-actions {
        display: flex;
        gap: var(--spacing-md);
      }
      .error-retry-btn {
        padding: 0.5rem 1.25rem;
        background: var(--status-danger);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        font-weight: 500;
        cursor: pointer;
      }
      .error-retry-btn:hover {
        opacity: 0.9;
      }
      .error-fallback-btn {
        padding: 0.5rem 1.25rem;
        background: transparent;
        color: var(--text-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        cursor: pointer;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  readonly title = input('Bir hata oluştu');
  readonly description = input('');
  readonly details = input('');
  readonly showDetails = input(false);
  readonly retryLabel = input('Tekrar Dene');
  readonly fallbackLabel = input('');
  readonly retry = output<void>();
  readonly fallback = output<void>();
}
