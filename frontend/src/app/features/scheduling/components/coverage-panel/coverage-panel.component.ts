import { Component, inject, computed, ChangeDetectionStrategy, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';

interface DeviceCoverageInfo {
  deviceCode: string;
  percent: number;
  filledSlots: number;
  totalSlots: number;
  missingDates: string[];
}

@Component({
  selector: 'app-coverage-panel',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header">
        <h4>Kademe Analizi</h4>
      </div>
      @if (coverageData()) {
        <div class="panel-body">
          <div class="coverage-summary">
            <div class="big-number" [class.complete]="coverageData()!.overall === 100">
              {{ coverageData()!.overall | number: '1.0-1' }}%
            </div>
            <div class="subtitle">
              {{ coverageData()!.filledSlots }} / {{ coverageData()!.totalSlots }} slot dolu
            </div>
          </div>
          <div class="device-breakdown">
            <h5>Cihaz Bazlı Kademe ({{ deviceCoverages().length }})</h5>
            @for (dc of deviceCoverages(); track dc.deviceCode) {
              <div class="device-row">
                <div class="device-header">
                  <span class="device-name">{{ dc.deviceCode }}</span>
                  <span
                    class="device-percent"
                    [class.ok]="dc.percent >= 90"
                    [class.warn]="dc.percent < 90 && dc.percent >= 70"
                    [class.error]="dc.percent < 70"
                  >
                    {{ dc.percent }}%
                  </span>
                </div>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    [style.width.%]="dc.percent"
                    [class.ok]="dc.percent >= 90"
                    [class.warn]="dc.percent < 90 && dc.percent >= 70"
                    [class.error]="dc.percent < 70"
                  ></div>
                </div>
                @if (dc.percent < 100 && expandedDevice() === dc.deviceCode) {
                  <div class="missing-details">
                    @for (date of dc.missingDates.slice(0, 10); track date) {
                      <span class="missing-chip">{{ date }}</span>
                    }
                    @if (dc.missingDates.length > 10) {
                      <span class="missing-more">+{{ dc.missingDates.length - 10 }} daha</span>
                    }
                  </div>
                }
                @if (dc.percent < 100) {
                  <button class="expand-btn" (click)="toggleExpand(dc.deviceCode)">
                    {{ expandedDevice() === dc.deviceCode ? 'Daralt' : 'Eksikleri Göster' }}
                  </button>
                }
              </div>
            }
          </div>
          @if (uncoveredDates().length > 0) {
            <div class="uncovered">
              <h5>Eksik Tarihler ({{ uncoveredDates().length }})</h5>
              <div class="date-chips">
                @for (date of uncoveredDates(); track date) {
                  <span class="date-chip">{{ date }}</span>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="panel-empty">Kademe bilgisi henüz hesaplanmadı.</div>
      }
    </div>
  `,
  styles: [
    `
      .panel {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .panel-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .panel-header h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .panel-body {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }
      .coverage-summary {
        text-align: center;
        margin-bottom: 20px;
      }
      .big-number {
        font-size: 48px;
        font-weight: 700;
        color: var(--text-color, #1e293b);
      }
      .big-number.complete {
        color: #10b981;
      }
      .subtitle {
        font-size: 13px;
        color: var(--text-color-secondary, #64748b);
        margin-top: 4px;
      }
      .device-breakdown h5,
      .uncovered h5 {
        font-size: 12px;
        margin: 0 0 8px;
        color: var(--text-color-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .device-row {
        margin-bottom: 10px;
      }
      .device-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .device-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-color, #1e293b);
      }
      .device-percent {
        font-size: 12px;
        font-weight: 600;
      }
      .device-percent.ok {
        color: #10b981;
      }
      .device-percent.warn {
        color: #f59e0b;
      }
      .device-percent.error {
        color: #ef4444;
      }
      .progress-bar {
        height: 4px;
        background: #e2e8f0;
        border-radius: 2px;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.3s;
      }
      .progress-fill.ok {
        background: #10b981;
      }
      .progress-fill.warn {
        background: #f59e0b;
      }
      .progress-fill.error {
        background: #ef4444;
      }
      .expand-btn {
        background: none;
        border: none;
        font-size: 11px;
        color: #6366f1;
        cursor: pointer;
        padding: 2px 0;
        margin-top: 2px;
      }
      .missing-details {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }
      .missing-chip {
        padding: 2px 6px;
        background: #fef2f2;
        border-radius: 3px;
        font-size: 10px;
        color: #991b1b;
      }
      .missing-more {
        font-size: 10px;
        color: #94a3b8;
        padding: 2px 0;
      }
      .uncovered {
        margin-top: 16px;
      }
      .date-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .date-chip {
        padding: 3px 8px;
        background: #fef2f2;
        border-radius: 4px;
        font-size: 11px;
        color: #991b1b;
      }
      .panel-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--text-color-secondary, #94a3b8);
        font-size: 13px;
      }
    `,
  ],
})
export class CoveragePanelComponent {
  private readonly store = inject(ScheduleStore);
  readonly expandedDevice = signal<string | null>(null);

  readonly coverageData = computed(() => {
    const v = this.store.validationResult()?.coverage;
    if (!v) return null;
    return {
      overall: v.coveragePercent,
      filledSlots: v.filledSlots,
      totalSlots: v.totalSlots,
    };
  });

  readonly deviceCoverages = computed((): DeviceCoverageInfo[] => {
    const assignments = this.store.assignments();
    const devices = this.store.uniqueDevices();
    const v = this.store.validationResult()?.coverage;
    const totalSlots = v?.totalSlots ?? 1;

    return devices
      .map((d) => {
        const deviceAssignments = assignments.filter((a) => a.deviceId === d.id);
        const uniqueDates = new Set(deviceAssignments.map((a) => `${a.date}-${a.shiftType}`));
        const percent = Math.round(
          (uniqueDates.size / Math.max(totalSlots / Math.max(devices.length, 1), 1)) * 100,
        );
        const filledSlots = deviceAssignments.length;
        const deviceTotal = Math.ceil(totalSlots / Math.max(devices.length, 1));
        const missingDates: string[] = [];
        deviceAssignments.forEach((a) => {
          if (!uniqueDates.has(`${a.date}-${a.shiftType}`)) {
            missingDates.push(`${a.date} ${a.shiftType}`);
          }
        });

        return {
          deviceCode: d.code,
          percent: Math.min(percent, 100),
          filledSlots,
          totalSlots: deviceTotal,
          missingDates,
        };
      })
      .sort((a, b) => a.percent - b.percent);
  });

  readonly uncoveredDates = computed(() => {
    const v = this.store.validationResult()?.coverage;
    return v?.uncoveredDates ?? [];
  });

  toggleExpand(deviceCode: string): void {
    this.expandedDevice.update((current) => (current === deviceCode ? null : deviceCode));
  }
}
