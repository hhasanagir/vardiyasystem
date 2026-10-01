import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import {
  getDaysInMonth,
  SHIFT_TYPE_LABELS,
  SHIFT_TYPE_COLORS,
  type GridDay,
} from '../../utils/grid-utils';
import type { AssignmentDTO } from '../../models';

@Component({
  selector: 'app-mobile-day-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mobile-day-view">
      <div class="day-nav">
        <button
          class="nav-btn"
          (click)="prevDay()"
          [disabled]="currentIdx() <= 0"
          aria-label="Onceki gun"
        >
          &#8249;
        </button>
        <span class="day-title">{{ currentDay()?.label }} {{ currentDay()?.dayOfMonth }}</span>
        <button
          class="nav-btn"
          (click)="nextDay()"
          [disabled]="currentIdx() >= days().length - 1"
          aria-label="Sonraki gun"
        >
          &#8250;
        </button>
      </div>
      <div class="day-assignments">
        @for (a of currentDayAssignments(); track a.id) {
          <div class="assignment-card" [style.border-left-color]="getColor(a.shiftType)">
            <div class="card-header">
              <span class="card-name">{{ a.personnelName }}</span>
              <span class="card-shift" [style.background]="getColor(a.shiftType)">{{
                getLabel(a.shiftType)
              }}</span>
            </div>
            @if (a.deviceCode) {
              <div class="card-detail">{{ a.deviceCode }}</div>
            }
            @if (a.startTime && a.endTime) {
              <div class="card-time">{{ a.startTime }} - {{ a.endTime }}</div>
            }
          </div>
        } @empty {
          <div class="empty-day">Bu gun icin atama bulunmuyor.</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .mobile-day-view {
        padding: 0;
      }
      .day-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--surface-card, #fff);
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .nav-btn {
        width: 32px;
        height: 32px;
        border: 1px solid var(--surface-border, #e2e8f0);
        border-radius: 6px;
        background: white;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .day-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--color-text, #1e293b);
      }
      .day-assignments {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .assignment-card {
        padding: 10px 12px;
        background: var(--surface-card, #fff);
        border-radius: 8px;
        border-left: 4px solid;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text, #1e293b);
      }
      .card-shift {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        color: white;
      }
      .card-detail {
        font-size: 12px;
        color: var(--color-text-secondary, #64748b);
        margin-top: 4px;
      }
      .card-time {
        font-size: 11px;
        color: var(--color-text-muted, #94a3b8);
        margin-top: 2px;
      }
      .empty-day {
        text-align: center;
        padding: 40px 16px;
        color: var(--color-text-muted, #94a3b8);
        font-size: 13px;
      }
    `,
  ],
})
export class MobileDayViewComponent {
  private readonly store = inject(ScheduleStore);

  readonly currentIdx = signal(0);

  readonly days = computed(() => {
    const s = this.store.schedule();
    if (!s) return [];
    return getDaysInMonth(s.year, s.month);
  });

  readonly currentDay = computed(() => this.days()[this.currentIdx()] ?? null);

  readonly currentDayAssignments = computed((): AssignmentDTO[] => {
    const day = this.currentDay();
    if (!day) return [];
    return this.store.assignments().filter((a) => a.date === day.date);
  });

  prevDay(): void {
    this.currentIdx.update((i) => Math.max(0, i - 1));
  }

  nextDay(): void {
    this.currentIdx.update((i) => Math.min(this.days().length - 1, i + 1));
  }

  getLabel(type: string): string {
    return SHIFT_TYPE_LABELS[type] ?? type;
  }

  getColor(type: string): string {
    return SHIFT_TYPE_COLORS[type] ?? '#94a3b8';
  }
}
