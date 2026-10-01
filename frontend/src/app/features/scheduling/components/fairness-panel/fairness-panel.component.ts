import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-fairness-panel',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header">
        <h4>Adalet Analizi</h4>
      </div>
      @if (fairness) {
        <div class="panel-body">
          <div class="scores">
            <div class="score-row">
              <span class="score-label">Genel</span>
              <div class="score-bar">
                <div
                  class="fill"
                  [style.width.%]="fairness.overallScore"
                  [style.background]="getBarColor(fairness.overallScore)"
                ></div>
              </div>
              <span class="score-value">{{ fairness.overallScore | number: '1.0-1' }}</span>
            </div>
            <div class="score-row">
              <span class="score-label">Gece</span>
              <div class="score-bar">
                <div
                  class="fill"
                  [style.width.%]="fairness.nightScore"
                  [style.background]="getBarColor(fairness.nightScore)"
                ></div>
              </div>
              <span class="score-value">{{ fairness.nightScore | number: '1.0-1' }}</span>
            </div>
            <div class="score-row">
              <span class="score-label">Hafta Sonu</span>
              <div class="score-bar">
                <div
                  class="fill"
                  [style.width.%]="fairness.weekendScore"
                  [style.background]="getBarColor(fairness.weekendScore)"
                ></div>
              </div>
              <span class="score-value">{{ fairness.weekendScore | number: '1.0-1' }}</span>
            </div>
            <div class="score-row">
              <span class="score-label">Tatil</span>
              <div class="score-bar">
                <div
                  class="fill"
                  [style.width.%]="fairness.holidayScore"
                  [style.background]="getBarColor(fairness.holidayScore)"
                ></div>
              </div>
              <span class="score-value">{{ fairness.holidayScore | number: '1.0-1' }}</span>
            </div>
            <div class="score-row">
              <span class="score-label">İş Yükü</span>
              <div class="score-bar">
                <div
                  class="fill"
                  [style.width.%]="fairness.workloadScore"
                  [style.background]="getBarColor(fairness.workloadScore)"
                ></div>
              </div>
              <span class="score-value">{{ fairness.workloadScore | number: '1.0-1' }}</span>
            </div>
          </div>
          @if (fairness.details.length > 0) {
            <details class="details-section">
              <summary>Personel Detayları ({{ fairness.details.length }})</summary>
              <table class="detail-table">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>Gece</th>
                    <th>H.Sonu</th>
                    <th>Tatil</th>
                    <th>Saat</th>
                    <th>Puan</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of fairness.details; track d.personnelId) {
                    <tr>
                      <td class="name">{{ d.personnelName }}</td>
                      <td>{{ d.nightCount }}</td>
                      <td>{{ d.weekendCount }}</td>
                      <td>{{ d.holidayCount }}</td>
                      <td>{{ d.totalHours | number: '1.0-0' }}</td>
                      <td [style.color]="getBarColor(d.score)">{{ d.score | number: '1.0-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          }
        </div>
      } @else {
        <div class="panel-empty">Adalet analizi henüz hesaplanmadı.</div>
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
      .scores {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .score-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .score-label {
        width: 72px;
        font-size: 11px;
        color: var(--text-color-secondary, #64748b);
      }
      .score-bar {
        flex: 1;
        height: 8px;
        background: var(--surface-hover, #f1f5f9);
        border-radius: 4px;
        overflow: hidden;
      }
      .fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s;
      }
      .score-value {
        width: 36px;
        text-align: right;
        font-size: 12px;
        font-weight: 600;
      }
      .details-section {
        margin-top: 16px;
      }
      .details-section summary {
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-color-secondary, #64748b);
        margin-bottom: 8px;
      }
      .detail-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .detail-table th {
        text-align: left;
        padding: 6px 8px;
        font-weight: 600;
        color: var(--text-color-secondary, #64748b);
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .detail-table td {
        padding: 5px 8px;
        border-bottom: 1px solid var(--surface-border, #f1f5f9);
      }
      .detail-table .name {
        font-weight: 500;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
export class FairnessPanelComponent {
  private readonly store = inject(ScheduleStore);
  get fairness() {
    return this.store.validationResult()?.fairness ?? this.store.fairnessResult();
  }

  getBarColor(score: number): string {
    if (score >= 90) return '#10b981';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  }
}
