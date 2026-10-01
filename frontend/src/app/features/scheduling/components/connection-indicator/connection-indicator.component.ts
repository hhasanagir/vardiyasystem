import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ScheduleStore, type ConnectionState } from '../../store/schedule.store';

@Component({
  selector: 'app-connection-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (connectionState() !== 'connected') {
      <div
        class="connection-bar"
        [class]="connectionState()"
        role="alert"
        [attr.aria-live]="'assertive'"
      >
        <span class="conn-dot"></span>
        <span class="conn-text">{{ label }}</span>
      </div>
    }
  `,
  styles: [
    `
      .connection-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 500;
        justify-content: center;
      }
      .connection-bar.connecting {
        background: #fef3c7;
        color: #92400e;
      }
      .connection-bar.disconnected {
        background: #fee2e2;
        color: #991b1b;
      }
      .conn-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .connecting .conn-dot {
        background: #f59e0b;
        animation: pulse 1.5s infinite;
      }
      .disconnected .conn-dot {
        background: #ef4444;
      }
      @keyframes pulse {
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
})
export class ConnectionIndicatorComponent {
  private readonly store = inject(ScheduleStore);
  readonly connectionState = this.store.connectionState;

  get label(): string {
    const labels: Record<ConnectionState, string> = {
      connecting: 'Bağlanıyor...',
      connected: '',
      disconnected: 'Çevrimdışı — kritik işlemler askıya alındı',
    };
    return labels[this.connectionState()];
  }
}
