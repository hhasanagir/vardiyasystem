import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import { SHIFT_TYPE_LABELS, SHIFT_TYPE_COLORS } from '../../utils/grid-utils';

interface DeviceSummary {
  deviceId: string;
  deviceCode: string;
  totalAssignments: number;
  shifts: Record<string, number>;
  personnel: Set<string>;
}

@Component({
  selector: 'app-device-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="device-view">
      @for (d of deviceSummaries(); track d.deviceId) {
        <div class="device-card">
          <div class="card-header">
            <span class="card-name">{{ d.deviceCode }}</span>
            <span class="card-meta"
              >{{ d.totalAssignments }} atama, {{ d.personnel.size }} personel</span
            >
          </div>
          <div class="shift-bar">
            @for (entry of getShiftEntries(d); track entry[0]) {
              <div
                class="shift-segment"
                [style.flex]="entry[1]"
                [style.background]="getColor(entry[0])"
              ></div>
            }
          </div>
          <div class="shift-legend">
            @for (entry of getShiftEntries(d); track entry[0]) {
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
      .device-view {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .device-card {
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
      .card-meta {
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
export class DeviceViewComponent {
  private readonly store = inject(ScheduleStore);

  readonly deviceSummaries = computed((): DeviceSummary[] => {
    const assignments = this.store.assignments();
    const map = new Map<string, DeviceSummary>();

    for (const a of assignments) {
      if (!a.deviceId) continue;
      if (!map.has(a.deviceId)) {
        map.set(a.deviceId, {
          deviceId: a.deviceId,
          deviceCode: a.deviceCode ?? a.deviceId,
          totalAssignments: 0,
          shifts: {},
          personnel: new Set(),
        });
      }
      const d = map.get(a.deviceId)!;
      d.totalAssignments++;
      d.shifts[a.shiftType] = (d.shifts[a.shiftType] ?? 0) + 1;
      d.personnel.add(a.personnelId);
    }

    return Array.from(map.values()).sort((a, b) => a.deviceCode.localeCompare(b.deviceCode));
  });

  getShiftEntries(d: DeviceSummary): [string, number][] {
    return Object.entries(d.shifts).sort((a, b) => b[1] - a[1]);
  }

  getLabel(type: string): string {
    return SHIFT_TYPE_LABELS[type] ?? type;
  }
  getColor(type: string): string {
    return SHIFT_TYPE_COLORS[type] ?? '#94a3b8';
  }
}
