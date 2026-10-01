import {
  Component,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScheduleApiService } from '../../services/schedule-api.service';
import type { VersionSnapshot, VersionDiff } from '../../models';

@Component({
  selector: 'app-version-compare',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="compare-panel">
      <div class="compare-header">
        <h4>Sürüm Karşılaştırması</h4>
        <div class="compare-selectors">
          <select [ngModel]="fromVersion()" (ngModelChange)="fromVersion.set($event)">
            @for (v of availableVersions(); track v) {
              <option [value]="v">v{{ v }}</option>
            }
          </select>
          <span class="arrow">→</span>
          <select [ngModel]="toVersion()" (ngModelChange)="toVersion.set($event)">
            @for (v of availableVersions(); track v) {
              <option [value]="v">v{{ v }}</option>
            }
          </select>
          <button class="btn-compare" (click)="onCompare()" [disabled]="loading()">
            Karşılaştır
          </button>
        </div>
      </div>
      @if (loading()) {
        <div class="compare-loading">Yükleniyor...</div>
      } @else if (diff()) {
        <div class="compare-body">
          <div class="diff-summary">
            <span class="diff-stat added">+{{ diff()!.added.length }} eklendi</span>
            <span class="diff-stat removed">-{{ diff()!.removed.length }} kaldırıldı</span>
            <span class="diff-stat changed">~{{ diff()!.modified.length }} değiştirildi</span>
          </div>
          @if (diff()!.modified.length > 0) {
            <div class="diff-section">
              <h5>Değişiklikler</h5>
              @for (item of diff()!.modified; track item.assignmentId) {
                <div class="diff-item changed">
                  <span class="diff-label">{{ item.personnelName }}</span>
                  <span class="diff-detail">{{ item.date }}</span>
                  <span class="diff-change"
                    >{{ item.field }}: {{ item.oldValue }} → {{ item.newValue }}</span
                  >
                </div>
              }
            </div>
          }
          @if (diff()!.added.length > 0) {
            <div class="diff-section">
              <h5>Eklenen Atamalar</h5>
              @for (item of diff()!.added; track item.id) {
                <div class="diff-item added">
                  <span class="diff-label">{{ item.personnelName }}</span>
                  <span class="diff-detail">{{ item.date }} {{ item.shiftType }}</span>
                </div>
              }
            </div>
          }
          @if (diff()!.removed.length > 0) {
            <div class="diff-section">
              <h5>Kaldırılan Atamalar</h5>
              @for (item of diff()!.removed; track item.id) {
                <div class="diff-item removed">
                  <span class="diff-label">{{ item.personnelName }}</span>
                  <span class="diff-detail">{{ item.date }} {{ item.shiftType }}</span>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="compare-empty">Karşılaştırmak için iki sürüm seçin.</div>
      }
    </div>
  `,
  styles: [
    `
      .compare-panel {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .compare-header {
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
      }
      .compare-header h4 {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 600;
      }
      .compare-selectors {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .compare-selectors select {
        padding: 4px 8px;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 12px;
      }
      .arrow {
        color: #94a3b8;
        font-size: 12px;
      }
      .btn-compare {
        padding: 4px 10px;
        background: #6366f1;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      }
      .btn-compare:disabled {
        opacity: 0.5;
      }
      .compare-loading,
      .compare-empty {
        padding: 40px 16px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      .compare-body {
        padding: 12px 16px;
        overflow-y: auto;
        flex: 1;
      }
      .diff-summary {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }
      .diff-stat {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
      }
      .diff-stat.added {
        background: #d1fae5;
        color: #065f46;
      }
      .diff-stat.removed {
        background: #fee2e2;
        color: #991b1b;
      }
      .diff-stat.changed {
        background: #fef3c7;
        color: #92400e;
      }
      .diff-section {
        margin-bottom: 12px;
      }
      .diff-section h5 {
        font-size: 11px;
        color: #64748b;
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .diff-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px;
        border-radius: 4px;
        margin-bottom: 4px;
        font-size: 12px;
      }
      .diff-item.added {
        background: #f0fdf4;
        border-left: 3px solid #10b981;
      }
      .diff-item.removed {
        background: #fef2f2;
        border-left: 3px solid #ef4444;
      }
      .diff-item.changed {
        background: #fffbeb;
        border-left: 3px solid #f59e0b;
      }
      .diff-item.moved {
        background: #eff6ff;
        border-left: 3px solid #3b82f6;
      }
      .diff-label {
        font-weight: 600;
        color: #1e293b;
      }
      .diff-detail {
        color: #64748b;
      }
      .diff-change {
        color: #6366f1;
        font-size: 11px;
      }
    `,
  ],
})
export class VersionCompareComponent implements OnInit {
  private readonly api = inject(ScheduleApiService);
  readonly scheduleId = input.required<string>();
  readonly currentVersion = input.required<number>();
  readonly close = output<void>();

  readonly fromVersion = signal(0);
  readonly toVersion = signal(0);
  readonly loading = signal(false);
  readonly diff = signal<VersionDiff | null>(null);
  readonly availableVersions = signal<number[]>([]);

  ngOnInit(): void {
    const v = this.currentVersion();
    const versions: number[] = [];
    for (let i = v; i >= 1; i--) versions.push(i);
    this.availableVersions.set(versions);
    if (versions.length >= 2) {
      this.fromVersion.set(versions[1]);
      this.toVersion.set(versions[0]);
    }
  }

  onCompare(): void {
    const id = this.scheduleId();
    const from = this.fromVersion();
    const to = this.toVersion();
    if (!id || from === to) return;

    this.loading.set(true);
    let fromData: VersionSnapshot | null = null;
    let toData: VersionSnapshot | null = null;

    this.api.getVersion(id, from).subscribe({
      next: (data) => {
        fromData = data;
        this.api.getVersion(id, to).subscribe({
          next: (data2) => {
            toData = data2;
            this.diff.set(this.computeDiff(fromData!, toData!));
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  private computeDiff(from: VersionSnapshot, to: VersionSnapshot): VersionDiff {
    const fromAssignments = from.data.assignments;
    const toAssignments = to.data.assignments;

    const fromMap = new Map(fromAssignments.map((a) => [a.id, a]));
    const toMap = new Map(toAssignments.map((a) => [a.id, a]));

    const added = toAssignments.filter((a) => !fromMap.has(a.id));
    const removed = fromAssignments.filter((a) => !toMap.has(a.id));
    const modified: VersionDiff['modified'] = [];

    for (const [id, toA] of toMap) {
      const fromA = fromMap.get(id);
      if (!fromA) continue;
      if (fromA.shiftType !== toA.shiftType) {
        modified.push({
          assignmentId: id,
          personnelName: toA.personnelName,
          date: toA.date,
          field: 'shiftType',
          oldValue: fromA.shiftType,
          newValue: toA.shiftType,
        });
      }
      if (fromA.deviceId !== toA.deviceId) {
        modified.push({
          assignmentId: id,
          personnelName: toA.personnelName,
          date: toA.date,
          field: 'deviceId',
          oldValue: fromA.deviceCode ?? '',
          newValue: toA.deviceCode ?? '',
        });
      }
      if (fromA.date !== toA.date) {
        modified.push({
          assignmentId: id,
          personnelName: toA.personnelName,
          date: toA.date,
          field: 'date',
          oldValue: fromA.date,
          newValue: toA.date,
        });
      }
    }

    return {
      fromVersion: from.version,
      toVersion: to.version,
      added,
      removed,
      modified,
      totalChanges: added.length + removed.length + modified.length,
    };
  }
}
