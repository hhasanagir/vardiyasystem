import { Component, input, ChangeDetectionStrategy } from '@angular/core';

export type BadgeSeverity = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

@Component({
  selector: 'app-badge',
  standalone: true,
  template: `
    <span
      class="badge"
      [class]="severity()"
      [class.badge-pulse]="pulse()"
      [class.badge-dot]="dot()"
    >
      @if (dot()) {
        <span class="badge-dot-indicator" aria-hidden="true"></span>
      }
      <ng-content></ng-content>
    </span>
  `,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.125rem 0.625rem;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 9999px;
        white-space: nowrap;
        line-height: 1.5;
      }
      .badge-dot {
        padding-left: 0.375rem;
      }
      .badge-dot-indicator {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 9999px;
        display: inline-block;
      }
      .info {
        background: color-mix(in srgb, var(--status-info) 15%, transparent);
        color: var(--status-info);
      }
      .info .badge-dot-indicator {
        background: var(--status-info);
      }
      .success {
        background: color-mix(in srgb, var(--status-success) 15%, transparent);
        color: var(--status-success);
      }
      .success .badge-dot-indicator {
        background: var(--status-success);
      }
      .warning {
        background: color-mix(in srgb, var(--status-warning) 15%, transparent);
        color: var(--status-warning);
      }
      .warning .badge-dot-indicator {
        background: var(--status-warning);
      }
      .danger {
        background: color-mix(in srgb, var(--status-danger) 15%, transparent);
        color: var(--status-danger);
      }
      .danger .badge-dot-indicator {
        background: var(--status-danger);
      }
      .neutral {
        background: var(--bg-hover);
        color: var(--text-secondary);
      }
      .neutral .badge-dot-indicator {
        background: var(--text-muted);
      }
      .badge-pulse .badge-dot-indicator {
        animation: badgePulse 2s ease-in-out infinite;
      }
      @keyframes badgePulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly severity = input<BadgeSeverity>('neutral');
  readonly pulse = input(false);
  readonly dot = input(false);
}
