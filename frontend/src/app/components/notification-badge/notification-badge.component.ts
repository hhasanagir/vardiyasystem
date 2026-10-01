import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificationCenterService } from '../../services/notification-center.service';

@Component({
  selector: 'app-notification-badge',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="notif-bell" routerLink="/app/notifications" title="Bildirimler">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      @if (service.unreadCount() > 0) {
        <span class="badge" [class.pulse]="service.unreadCount() > 0">{{
          service.unreadCount() > 99 ? '99+' : service.unreadCount()
        }}</span>
      }
    </a>
  `,
  styles: [
    `
      .notif-bell {
        position: relative;
        display: flex;
        align-items: center;
        padding: 7px;
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        text-decoration: none;
        transition: all var(--transition-fast);
      }
      .notif-bell:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 8px;
        background: var(--status-error);
        color: white;
        font-size: 9px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 0 2px var(--bg-primary);
      }
      .badge.pulse {
        animation: notif-pulse 2s infinite;
      }
      @keyframes notif-pulse {
        0%,
        100% {
          box-shadow:
            0 0 0 2px var(--bg-primary),
            0 0 0 0 rgba(239, 68, 68, 0.4);
        }
        50% {
          box-shadow:
            0 0 0 2px var(--bg-primary),
            0 0 0 6px rgba(239, 68, 68, 0);
        }
      }
    `,
  ],
})
export class NotificationBadgeComponent {
  service = inject(NotificationCenterService);
}
