import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionTimeoutService } from '../../services/session-timeout.service';

@Component({
  selector: 'app-session-timeout-warning',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sessionTimeout.showWarning()) {
      <div class="session-warning-overlay">
        <div class="session-warning-modal">
          <div class="sw-icon">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3>Oturum Süresi Doluyor</h3>
          <p>
            Güvenliğiniz için oturumunuz {{ sessionTimeout.remainingSeconds() }} saniye içinde
            sonlanacak.
          </p>
          <div class="sw-timer">
            <div
              class="sw-timer-bar"
              [style.width.%]="(sessionTimeout.remainingSeconds() / 300) * 100"
            ></div>
          </div>
          <div class="sw-actions">
            <button class="btn btn-primary" (click)="sessionTimeout.extendSession()">
              Oturumu Uzat
            </button>
            <button class="btn btn-ghost" (click)="sessionTimeout.dismissWarning()">Kapat</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .session-warning-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      .session-warning-modal {
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-2xl);
        padding: 32px;
        width: 400px;
        max-width: 90vw;
        text-align: center;
        animation: scaleIn 0.3s ease;
        box-shadow: var(--shadow-elevated);
      }
      .sw-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: rgba(245, 158, 11, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fbbf24;
      }
      h3 {
        font-size: var(--text-xl);
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 8px;
      }
      p {
        font-size: var(--text-md);
        color: var(--text-secondary);
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .sw-timer {
        height: 4px;
        background: var(--border-subtle);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 24px;
      }
      .sw-timer-bar {
        height: 100%;
        background: linear-gradient(90deg, #f59e0b, #ef4444);
        border-radius: 2px;
        transition: width 1s linear;
      }
      .sw-actions {
        display: flex;
        justify-content: center;
        gap: 8px;
      }
    `,
  ],
})
export class SessionTimeoutWarningComponent {
  protected sessionTimeout = inject(SessionTimeoutService);
}
