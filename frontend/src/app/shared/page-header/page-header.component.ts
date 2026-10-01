import { Component, inject, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageContext } from './page-header.types';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (context(); as ctx) {
      <div class="page-header">
        <div class="page-header-left">
          @if (ctx.breadcrumbs.length > 0) {
            <nav class="breadcrumbs">
              @for (crumb of ctx.breadcrumbs; track crumb.label; let last = $last) {
                @if (crumb.path && !last) {
                  <a class="breadcrumb-link" [routerLink]="crumb.path">{{ crumb.label }}</a>
                  <span class="breadcrumb-sep">/</span>
                }
              }
            </nav>
          }
          <div class="title-row">
            <h1 class="page-header-title">{{ ctx.title }}</h1>
            @if (ctx.status) {
              <span
                class="page-status"
                [class.status-success]="ctx.status.color === 'success'"
                [class.status-warning]="ctx.status.color === 'warning'"
                [class.status-error]="ctx.status.color === 'error'"
                [class.status-info]="ctx.status.color === 'info'"
              >
                <span class="page-status-dot" [class.pulse]="ctx.status.pulse"></span>
                {{ ctx.status.label }}
              </span>
            }
          </div>
          @if (ctx.subtitle) {
            <p class="page-header-subtitle">{{ ctx.subtitle }}</p>
          }
        </div>
        <div class="page-header-right">
          @if (ctx.lastUpdated) {
            <span class="last-updated">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {{ ctx.lastUpdated | date: 'HH:mm' }}
            </span>
          }
          @if (visibleActions().length > 0) {
            <div class="page-header-actions">
              @for (action of visibleActions(); track action.id) {
                <button
                  class="page-header-btn"
                  [class.btn-primary]="action.severity === 'primary'"
                  [class.btn-success]="action.severity === 'success'"
                  [class.btn-danger]="action.severity === 'danger'"
                  [class.btn-ghost]="!action.severity || action.severity === 'ghost'"
                  (click)="actionClick.emit(action.id)"
                >
                  <span [innerHTML]="sanitizeIcon(action.icon)"></span>
                  {{ action.label }}
                </button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 32px;
        margin-bottom: var(--spacing-lg, 20px);
      }
      .page-header-left {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .page-header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
        padding-top: 20px;
      }

      .breadcrumbs {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 4px;
      }
      .breadcrumb-link {
        color: var(--text-muted);
        text-decoration: none;
        transition: color var(--transition-fast);
      }
      .breadcrumb-link:hover {
        color: var(--text-secondary);
      }
      .breadcrumb-sep {
        color: var(--border-strong);
      }

      .title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .page-header-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.4px;
        line-height: 1.3;
      }
      .page-header-subtitle {
        font-size: 13px;
        color: var(--text-muted);
        margin: 2px 0 0;
        line-height: 1.5;
      }

      .page-status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: var(--radius-full);
      }
      .page-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .page-status-dot.pulse {
        animation: pulse 2s infinite;
      }
      .status-success {
        background: color-mix(in srgb, var(--status-success) 12%, transparent);
        color: var(--status-success);
      }
      .status-success .page-status-dot {
        background: var(--status-success);
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
      }
      .status-warning {
        background: color-mix(in srgb, var(--status-warning) 12%, transparent);
        color: var(--status-warning);
      }
      .status-warning .page-status-dot {
        background: var(--status-warning);
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
      }
      .status-error {
        background: color-mix(in srgb, var(--status-error) 12%, transparent);
        color: var(--status-error);
      }
      .status-error .page-status-dot {
        background: var(--status-error);
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
      }
      .status-info {
        background: color-mix(in srgb, var(--status-info) 12%, transparent);
        color: var(--status-info);
      }
      .status-info .page-status-dot {
        background: var(--status-info);
        box-shadow: 0 0 6px rgba(96, 165, 250, 0.4);
      }

      .last-updated {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
      }

      .page-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .page-header-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: var(--radius-md);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all var(--transition-fast);
        white-space: nowrap;
        line-height: 1.4;
      }
      .page-header-btn.btn-primary {
        background: var(--accent-gradient);
        color: white;
        box-shadow: 0 2px 12px rgba(59, 130, 246, 0.25);
      }
      .page-header-btn.btn-primary:hover {
        filter: brightness(1.1);
      }
      .page-header-btn.btn-success {
        background: rgba(22, 101, 52, 0.6);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, 0.3);
      }
      .page-header-btn.btn-danger {
        background: rgba(153, 27, 27, 0.6);
        color: #fecaca;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .page-header-btn.btn-ghost {
        background: transparent;
        color: var(--text-secondary);
        border: 1px solid var(--border-default);
      }
      .page-header-btn.btn-ghost:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
        color: var(--text-primary);
      }

      @media (max-width: 768px) {
        .page-header {
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .page-header-right {
          width: 100%;
          justify-content: space-between;
          padding-top: 0;
        }
        .page-header-title {
          font-size: 18px;
        }
        .page-header-actions {
          gap: 6px;
        }
        .page-header-btn {
          padding: 5px 10px;
          font-size: 11px;
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly context = input<PageContext | null>(null);
  readonly actionClick = output<string>();
  private sanitizer = inject(DomSanitizer);

  readonly visibleActions = computed(() => {
    const ctx = this.context();
    if (!ctx?.actions) return [];
    return ctx.actions.filter((a) => a.visible !== false);
  });

  sanitizeIcon(icon: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(icon);
  }
}
