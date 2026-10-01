import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (pwa.isInstallable()) {
      <div class="pwa-banner">
        <div class="pwa-banner-body">
          <div class="pwa-banner-icon">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="8" fill="#3b82f6" />
              <rect x="5" y="5" width="26" height="26" rx="5" fill="#1e293b" />
              <rect x="9" y="14" width="18" height="3" rx="1.5" fill="#3b82f6" />
              <rect x="15" y="9" width="3" height="18" rx="1.5" fill="#3b82f6" />
              <rect x="9" y="22" width="8" height="2" rx="1" fill="#60a5fa" />
              <rect x="19" y="22" width="8" height="2" rx="1" fill="#60a5fa" />
            </svg>
          </div>
          <div class="pwa-banner-text">
            <strong>VardiyaOS'u Ana Ekrana Ekle</strong>
            <span>Hızlı erişim ve çevrimdışı kullanım için</span>
          </div>
        </div>
        <div class="pwa-banner-actions">
          <button class="pwa-btn pwa-btn-secondary" (click)="pwa.dismissInstallPrompt()">
            Şimdi Değil
          </button>
          <button class="pwa-btn pwa-btn-primary" (click)="install()">Ekle</button>
        </div>
      </div>
    }

    @if (!pwa.isOnline() && pwa.isInstalled()) {
      <div class="offline-banner">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M8 8a5 5 0 0 1 7 7" />
          <path d="M2 2a9 9 0 0 1 12 12" />
          <path d="M12 22h.01" />
        </svg>
        <span>Çevrimdışı mod — önbellekteki veriler gösteriliyor</span>
      </div>
    }
  `,
  styles: [
    `
      .pwa-banner {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px 18px;
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(20px);
        max-width: 360px;
        width: calc(100vw - 32px);
        animation: slideUpPwa 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideUpPwa {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      .pwa-banner-body {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .pwa-banner-icon {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
      }
      .pwa-banner-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .pwa-banner-text strong {
        font-size: 13px;
        font-weight: 600;
        color: #f1f5f9;
      }
      .pwa-banner-text span {
        font-size: 11px;
        color: #94a3b8;
      }
      .pwa-banner-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .pwa-btn {
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 150ms;
      }
      .pwa-btn-primary {
        background: #3b82f6;
        color: white;
      }
      .pwa-btn-primary:hover {
        background: #2563eb;
      }
      .pwa-btn-secondary {
        background: transparent;
        color: #94a3b8;
      }
      .pwa-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #f1f5f9;
      }
      .offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(245, 158, 11, 0.95);
        color: #1e293b;
        font-size: 11px;
        font-weight: 600;
        backdrop-filter: blur(12px);
        animation: fadeIn 0.2s;
      }
    `,
  ],
})
export class PwaInstallPromptComponent {
  protected pwa = inject(PwaService);

  protected install() {
    this.pwa.promptInstall();
  }
}
