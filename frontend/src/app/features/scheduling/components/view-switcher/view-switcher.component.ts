import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  computed,
  inject,
} from '@angular/core';
import type { AssignmentDTO } from '../../models';
import { ScheduleStore } from '../../store/schedule.store';
import { SHIFT_TYPE_LABELS, SHIFT_TYPE_COLORS } from '../../utils/grid-utils';

export type ViewMode = 'grid' | 'personnel' | 'device' | 'coverage' | 'conflicts' | 'mobile-day';

@Component({
  selector: 'app-view-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="view-switcher" role="tablist" aria-label="Gorunum secenekleri">
      @for (v of views; track v.id) {
        <button
          class="view-btn"
          [class.active]="activeView() === v.id"
          role="tab"
          [attr.aria-selected]="activeView() === v.id"
          [attr.aria-label]="v.label"
          (click)="onSelect(v.id)"
        >
          <span class="view-icon" aria-hidden="true">{{ v.icon }}</span>
          <span class="view-label">{{ v.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .view-switcher {
        display: flex;
        gap: 2px;
        padding: 4px;
        background: var(--surface-hover, #f1f5f9);
        border-radius: 8px;
      }
      .view-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: transparent;
        font-size: 12px;
        font-weight: 500;
        color: var(--color-text-secondary, #64748b);
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .view-btn:hover {
        background: var(--surface-card, #fff);
        color: var(--color-text, #1e293b);
      }
      .view-btn.active {
        background: var(--surface-card, #fff);
        color: var(--color-primary, #6366f1);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        font-weight: 600;
      }
      .view-icon {
        font-size: 14px;
      }
    `,
  ],
})
export class ViewSwitcherComponent {
  readonly activeView = signal<ViewMode>('grid');
  readonly viewChange = output<ViewMode>();

  readonly views = [
    { id: 'grid' as ViewMode, label: 'Tablo', icon: '\u25A6' },
    { id: 'personnel' as ViewMode, label: 'Personel', icon: '\u263A' },
    { id: 'device' as ViewMode, label: 'Cihaz', icon: '\u2699' },
    { id: 'coverage' as ViewMode, label: 'Kademe', icon: '\u25A1' },
    { id: 'conflicts' as ViewMode, label: 'Cakismalar', icon: '\u26A0' },
  ];

  onSelect(view: ViewMode): void {
    this.activeView.set(view);
    this.viewChange.emit(view);
  }
}
