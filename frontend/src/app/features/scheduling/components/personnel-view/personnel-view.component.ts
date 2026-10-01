import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import { SHIFT_TYPE_LABELS, SHIFT_TYPE_COLORS } from '../../utils/grid-utils';
import type { AssignmentDTO } from '../../models';

interface PersonnelDay {
  date: string;
  shiftType: string;
  deviceCode: string | null;
  startTime: string;
  endTime: string;
}

interface PersonnelSummary {
  personnelId: string;
  personnelName: string;
  totalDays: number;
  shifts: Record<string, number>;
  days: PersonnelDay[];
}

@Component({
  selector: 'app-personnel-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="personnel-view">
      @for (p of personnelSummaries(); track p.personnelId) {
        <div class="personnel-card">
          <div class="card-header">
            <span class="card-name">{{ p.personnelName }}</span>
            <span class="card-total">{{ p.totalDays }} gun</span>
          </div>
          <div class="shift-bar">
            @for (entry of getShiftEntries(p); track entry[0]) {
              <div
                class="shift-segment"
                [style.flex]="entry[1]"
                [style.background]="getColor(entry[0])"
                [attr.aria-label]="getLabel(entry[0]) + ': ' + entry[1] + ' gun'"
              ></div>
            }
          </div>
          <div class="shift-legend">
            @for (entry of getShiftEntries(p); track entry[0]) {
              <span class="legend-item">
                <span class="legend-dot" [style.background]="getColor(entry[0])"></span>
                {{ getLabel(entry[0]) }}: {{ entry[1] }}
              </span>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .personnel-view {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .personnel-card {
        padding: 12px 16px;
        background: var(--surface-card, #fff);
        border-radius: 8px;
        border: 1px solid var(--surface-border, #e2e8f0);
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .card-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text, #1e293b);
      }
      .card-total {
        font-size: 11px;
        color: var(--color-text-muted, #94a3b8);
      }
      .shift-bar {
        display: flex;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        gap: 1px;
      }
      .shift-segment {
        min-width: 2px;
      }
      .shift-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--color-text-secondary, #64748b);
      }
      .legend-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
    `,
  ],
})
export class PersonnelViewComponent {
  private readonly store = inject(ScheduleStore);

  readonly personnelSummaries = computed((): PersonnelSummary[] => {
    const assignments = this.store.assignments();
    const map = new Map<string, PersonnelSummary>();

    for (const a of assignments) {
      if (!map.has(a.personnelId)) {
        map.set(a.personnelId, {
          personnelId: a.personnelId,
          personnelName: a.personnelName ?? a.personnelId,
          totalDays: 0,
          shifts: {},
          days: [],
        });
      }
      const s = map.get(a.personnelId)!;
      s.totalDays++;
      s.shifts[a.shiftType] = (s.shifts[a.shiftType] ?? 0) + 1;
      s.days.push({
        date: a.date,
        shiftType: a.shiftType,
        deviceCode: a.deviceCode ?? null,
        startTime: a.startTime,
        endTime: a.endTime,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.personnelName.localeCompare(b.personnelName, 'tr'),
    );
  });

  getShiftEntries(p: PersonnelSummary): [string, number][] {
    return Object.entries(p.shifts).sort((a, b) => b[1] - a[1]);
  }

  getLabel(type: string): string {
    return SHIFT_TYPE_LABELS[type] ?? type;
  }

  getColor(type: string): string {
    return SHIFT_TYPE_COLORS[type] ?? '#94a3b8';
  }
}
