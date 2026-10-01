import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      @for (toast of toastSvc.toasts(); track toast.id) {
        <div
          class="toast toast-{{ toast.severity }}"
          [class.toast-dismissing]="toast.dismissing"
          [style.animation-delay.ms]="$index * 40"
          role="alert"
        >
          <div class="toast-icon">
            @switch (toast.severity) {
              @case ('success') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="16 8 10 16 8 14"/></svg>
              }
              @case ('error') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              }
              @case ('warning') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              }
              @case ('info') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              }
            }
          </div>
          <div class="toast-body">
            <span class="toast-title">{{ toast.title }}</span>
            <span class="toast-message">{{ toast.message }}</span>
          </div>
          <button class="toast-close" (click)="toastSvc.dismiss(toast.id)" aria-label="Kapat">&times;</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed; top: 16px; right: 16px; z-index: 10000;
      display: flex; flex-direction: column; gap: 8px;
      pointer-events: none; max-width: 400px; width: 100%;
    }
    .toast {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 16px; border-radius: var(--radius-lg);
      pointer-events: auto;
      animation: toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
      box-shadow: var(--shadow-elevated);
      backdrop-filter: blur(20px);
      border: 1px solid;
    }
    .toast-dismissing {
      animation: toastSlideOut 0.25s cubic-bezier(0.4, 0, 0.2, 1) both !important;
    }
    .toast-success { background: rgba(6, 78, 59, 0.9); border-color: rgba(34, 197, 94, 0.3); }
    .toast-error { background: rgba(127, 29, 29, 0.9); border-color: rgba(239, 68, 68, 0.3); }
    .toast-warning { background: rgba(113, 63, 18, 0.9); border-color: rgba(245, 158, 11, 0.3); }
    .toast-info { background: rgba(30, 64, 175, 0.9); border-color: rgba(59, 130, 246, 0.3); }
    .toast-icon { flex-shrink: 0; width: 20px; height: 20px; }
    .toast-success .toast-icon { color: #4ade80; }
    .toast-error .toast-icon { color: #f87171; }
    .toast-warning .toast-icon { color: #fbbf24; }
    .toast-info .toast-icon { color: #60a5fa; }
    .toast-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toast-title { font-size: var(--text-md); font-weight: 600; color: var(--text-primary); }
    .toast-message { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.4; }
    .toast-close {
      flex-shrink: 0; background: none; border: none; color: var(--text-muted);
      font-size: 18px; cursor: pointer; padding: 0 2px; line-height: 1;
      &:hover { color: var(--text-primary); }
    }
    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateX(100%) scale(0.95); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes toastSlideOut {
      from { opacity: 1; transform: translateX(0) scale(1); }
      to { opacity: 0; transform: translateX(100%) scale(0.95); }
    }
    @media (max-width: 480px) {
      .toast-container { left: 12px; right: 12px; max-width: none; top: 12px; }
    }
  `]
})
export class ToastContainerComponent {
  protected toastSvc = inject(ToastService);
}
