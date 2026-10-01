import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  HostListener,
  ElementRef,
  viewChild,
} from '@angular/core';
import { FocusTrapDirective } from '../../core/directives/focus-trap.directive';
import { trigger, transition, style, animate } from '@angular/animations';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [FocusTrapDirective],
  animations: [
    trigger('overlay', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('150ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('panel', [
      transition(':enter', [
        style({ opacity: 0, scale: 0.96, y: 20 }),
        animate('200ms ease-out', style({ opacity: 1, scale: 1, y: 0 })),
      ]),
      transition(':leave', [animate('150ms ease-in', style({ opacity: 0, scale: 0.96 }))]),
    ]),
  ],
  template: `
    @if (visible()) {
      <div class="modal-overlay" (click)="closeOnOverlay() && close.emit()"></div>
      <div
        class="modal-container"
        [class]="'modal-' + size()"
        role="dialog"
        [attr.aria-modal]="true"
        [attr.aria-label]="title()"
        appFocusTrap
      >
        <div class="modal-panel">
          <div class="modal-header">
            <h2 class="modal-title">{{ title() }}</h2>
            <button class="modal-close" (click)="close.emit()" aria-label="Kapat">&times;</button>
          </div>
          <div class="modal-body">
            <ng-content />
          </div>
          @if (showFooter()) {
            <div class="modal-footer">
              <ng-content select="[modal-footer]" />
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1099;
        backdrop-filter: blur(4px);
      }
      .modal-container {
        position: fixed;
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        inset: 0;
        padding: 1rem;
      }
      .modal-panel {
        background: var(--bg-primary);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-2xl);
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        width: 100%;
      }
      .modal-sm .modal-panel {
        max-width: 28rem;
      }
      .modal-md .modal-panel {
        max-width: 36rem;
      }
      .modal-lg .modal-panel {
        max-width: 48rem;
      }
      .modal-xl .modal-panel {
        max-width: 64rem;
      }
      .modal-full .modal-panel {
        max-width: 90vw;
        max-height: 90vh;
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--border-subtle);
      }
      .modal-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }
      .modal-close {
        width: 2rem;
        height: 2rem;
        border: none;
        background: var(--bg-hover);
        border-radius: 9999px;
        cursor: pointer;
        font-size: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        transition: background 0.15s;
      }
      .modal-close:hover {
        background: var(--bg-secondary);
      }
      .modal-body {
        padding: 1.5rem;
        overflow-y: auto;
        flex: 1;
      }
      .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        border-top: 1px solid var(--border-subtle);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  readonly visible = input(false);
  readonly title = input('');
  readonly size = input<ModalSize>('md');
  readonly closeOnOverlay = input(true);
  readonly showFooter = input(true);
  readonly close = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.close.emit();
  }
}
