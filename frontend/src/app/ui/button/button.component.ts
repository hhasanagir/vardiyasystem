import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'button[appButton], a[appButton]',
  standalone: true,
  template: `
    @if (loading()) {
      <span class="btn-spinner" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-dasharray="31.4 31.4"
            stroke-linecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      </span>
    }
    <ng-content />
    @if (iconRight()) {
      <span class="btn-icon-right" [innerHTML]="iconRight()"></span>
    }
  `,
  host: {
    '[class]': 'hostClasses()',
    '[attr.disabled]': 'disabled() || loading() ? true : null',
    '[attr.aria-disabled]': 'disabled() || loading()',
    '[attr.aria-busy]': 'loading()',
  },
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border: none;
        border-radius: var(--radius-md);
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
        white-space: nowrap;
      }
      :host:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      :host[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }
      .btn-spinner {
        display: inline-flex;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly iconRight = input('');

  readonly hostClasses = computed(() => {
    const base = 'btn';
    const variant = this.variant();
    const size = this.size();
    const classes: string[] = [base, `btn-${variant}`, `btn-${size}`];
    return classes.join(' ');
  });

  // Styling is applied via global CSS using these classes
}
