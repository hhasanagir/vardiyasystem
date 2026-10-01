import { Component, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import { ScheduleApiService } from '../../services/schedule-api.service';
import { ScheduleCommandService } from '../../services/schedule-command.service';
import { VersionCompareComponent } from '../version-compare/version-compare.component';

@Component({
  selector: 'app-version-panel',
  standalone: true,
  imports: [VersionCompareComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showCompare()) {
      <app-version-compare
        [scheduleId]="store.scheduleId() ?? ''"
        [currentVersion]="store.version()"
        (close)="showCompare.set(false)"
      />
    } @else {
      <div class="panel">
        <div class="panel-header">
          <h4>Sürüm Geçmişi</h4>
          @if (currentVersion > 1) {
            <button class="compare-btn" (click)="showCompare.set(true)">Karşılaştır</button>
          }
        </div>
        <div class="panel-body">
          @if (currentVersion > 0) {
            <div class="current-version">
              <span class="label">Mevcut Sürüm</span>
              <span class="value">v{{ currentVersion }}</span>
            </div>
            <div class="version-timeline">
              @for (v of versionList; track v.num) {
                <div
                  class="version-item"
                  [class.active]="v.num === currentVersion"
                  (click)="onSelectVersion(v.num)"
                >
                  <div class="dot"></div>
                  <div class="version-info">
                    <span class="version-label">v{{ v.num }}</span>
                    <span class="version-meta">{{ v.score }} puan · {{ v.status }}</span>
                  </div>
                  @if (selectedVersion() === v.num && v.num !== currentVersion) {
                    <button class="rollback-btn" (click)="onRollback(v.num, $event)">
                      Geri Al
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="panel-empty">Sürüm bilgisi mevcut değil.</div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .panel {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .panel-header h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .compare-btn {
        padding: 3px 10px;
        border: 1px solid #6366f1;
        border-radius: 4px;
        background: white;
        color: #6366f1;
        font-size: 11px;
        cursor: pointer;
      }
      .panel-body {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }
      .current-version {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background: var(--surface-hover, #f8fafc);
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .current-version .label {
        font-size: 12px;
        color: var(--text-color-secondary, #64748b);
      }
      .current-version .value {
        font-size: 20px;
        font-weight: 700;
        color: #6366f1;
      }
      .version-timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .version-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        font-size: 12px;
        color: var(--text-color-secondary, #94a3b8);
        border-left: 2px solid var(--surface-border, #e2e8f0);
        padding-left: 16px;
        margin-left: 4px;
        cursor: pointer;
      }
      .version-item:hover {
        background: var(--surface-hover, #f8fafc);
      }
      .version-item.active {
        color: #6366f1;
        font-weight: 600;
        border-left-color: #6366f1;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--surface-border, #e2e8f0);
        margin-left: -21px;
        flex-shrink: 0;
      }
      .version-item.active .dot {
        background: #6366f1;
      }
      .version-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
      }
      .version-label {
        font-size: 12px;
        font-weight: 600;
      }
      .version-meta {
        font-size: 10px;
        color: #94a3b8;
      }
      .rollback-btn {
        padding: 2px 8px;
        background: #fef3c7;
        border: 1px solid #fde68a;
        border-radius: 4px;
        font-size: 10px;
        color: #92400e;
        cursor: pointer;
        flex-shrink: 0;
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
export class VersionPanelComponent {
  readonly store = inject(ScheduleStore);
  private readonly api = inject(ScheduleApiService);
  private readonly cmd = inject(ScheduleCommandService);

  readonly showCompare = signal(false);
  readonly selectedVersion = signal<number | null>(null);

  get currentVersion(): number {
    return this.store.version();
  }

  get versionList(): Array<{ num: number; score: string; status: string }> {
    const v = this.currentVersion;
    const list: Array<{ num: number; score: string; status: string }> = [];
    for (let i = v; i >= 1; i--) {
      list.push({
        num: i,
        score: i === v ? `${this.store.overallScore()}` : '—',
        status: i === v ? (this.store.status() ?? 'draft') : '',
      });
    }
    return list;
  }

  onSelectVersion(num: number): void {
    this.selectedVersion.update((current) => (current === num ? null : num));
  }

  onRollback(targetVersion: number, event: Event): void {
    event.stopPropagation();
    const id = this.store.scheduleId();
    if (id && confirm(`v${targetVersion}'e geri almak istediğinize emin misiniz?`)) {
      this.cmd.rollback(id, targetVersion, 'Kullanıcı tarafından geri alındı').subscribe();
    }
  }
}
