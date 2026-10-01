import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface PerformanceMetric {
  unit: string;
  coverage: number;
  efficiency: number;
  avgFatigue: number;
  fairness: number;
  compliance: number;
  totalScore: number;
}

interface TrendData {
  date: string;
  coverage: number;
  efficiency: number;
  fairness: number;
}

@Component({
  selector: 'app-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="performance-page">
      <header class="page-header">
        <div class="header-left">
          <h1>Performans Analizi</h1>
          <p class="subtitle">Birim bazlı performans metrikleri ve trendler</p>
        </div>
        <div class="header-right">
          <select class="period-select" [(ngModel)]="selectedPeriod">
            <option value="week">Son 7 Gün</option>
            <option value="month">Son 30 Gün</option>
            <option value="quarter">Son 3 Ay</option>
          </select>
        </div>
      </header>

      <div class="overall-score">
        <div class="score-ring">
          <svg viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="8"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#6366f1"
              stroke-width="8"
              stroke-dasharray="339.3"
              [attr.stroke-dashoffset]="339.3 - (339.3 * overallScore()) / 100"
              stroke-linecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="score-value">{{ overallScore() }}</div>
        </div>
        <div class="score-details">
          <h2>Genel Performans Skoru</h2>
          <div class="score-breakdown">
            <div class="breakdown-item">
              <span class="label">Kapsama</span>
              <span class="value">{{ avgCoverage() }}%</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Verimlilik</span>
              <span class="value">{{ avgEfficiency() }}%</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Adalet</span>
              <span class="value">{{ avgFairness() }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="metrics-grid">
        @for (metric of metrics(); track metric.unit) {
          <div class="metric-card" [style.--metric-color]="getUnitColor(metric.unit)">
            <div class="metric-header">
              <span class="unit-name">{{ getUnitLabel(metric.unit) }}</span>
              <span class="total-score">{{ metric.totalScore }}</span>
            </div>
            <div class="metric-bars">
              <div class="bar-item">
                <div class="bar-label">
                  <span>Kapsama</span>
                  <span>{{ metric.coverage }}%</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="metric.coverage"></div>
                </div>
              </div>
              <div class="bar-item">
                <div class="bar-label">
                  <span>Verimlilik</span>
                  <span>{{ metric.efficiency }}%</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="metric.efficiency"></div>
                </div>
              </div>
              <div class="bar-item">
                <div class="bar-label">
                  <span>Yorgunluk</span>
                  <span>{{ metric.avgFatigue }}%</span>
                </div>
                <div class="bar-track fatigue">
                  <div class="bar-fill" [style.width.%]="metric.avgFatigue"></div>
                </div>
              </div>
              <div class="bar-item">
                <div class="bar-label">
                  <span>Adalet</span>
                  <span>{{ metric.fairness }}%</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="metric.fairness"></div>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="trend-section">
        <h3>Performans Trendleri</h3>
        <div class="trend-chart">
          <div class="chart-labels">
            @for (day of trendDays; track day) {
              <span>{{ day }}</span>
            }
          </div>
          <div class="chart-bars">
            @for (day of trendData(); track day.date; let i = $index) {
              <div class="day-bars">
                <div
                  class="bar-column"
                  [style.height.%]="day.coverage"
                  title="Kapsama: {{ day.coverage }}%"
                >
                  <div class="coverage-bar"></div>
                </div>
                <div
                  class="bar-column"
                  [style.height.%]="day.efficiency"
                  title="Verimlilik: {{ day.efficiency }}%"
                >
                  <div class="efficiency-bar"></div>
                </div>
                <div
                  class="bar-column"
                  [style.height.%]="day.fairness"
                  title="Adalet: {{ day.fairness }}%"
                >
                  <div class="fairness-bar"></div>
                </div>
              </div>
            }
          </div>
          <div class="chart-legend">
            <div class="legend-item"><span class="dot coverage"></span>Kapsama</div>
            <div class="legend-item"><span class="dot efficiency"></span>Verimlilik</div>
            <div class="legend-item"><span class="dot fairness"></span>Adalet</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .performance-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .page-header h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
      }

      .subtitle {
        font-size: 0.875rem;
        color: #64748b;
        margin: 0.25rem 0 0;
      }

      .period-select {
        padding: 10px 16px;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 0.875rem;
        cursor: pointer;
      }

      .overall-score {
        display: flex;
        align-items: center;
        gap: 2rem;
        padding: 2rem;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 16px;
      }

      .score-ring {
        width: 120px;
        height: 120px;
        position: relative;
      }

      .score-ring svg {
        width: 100%;
        height: 100%;
      }

      .score-ring circle:last-child {
        transition: stroke-dashoffset 1s ease;
      }

      .score-value {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 700;
        color: #f8fafc;
      }

      .score-details h2 {
        font-size: 1.125rem;
        font-weight: 600;
        color: #e2e8f0;
        margin: 0 0 1rem;
      }

      .score-breakdown {
        display: flex;
        gap: 2rem;
      }

      .breakdown-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .breakdown-item .label {
        font-size: 0.75rem;
        color: #64748b;
      }

      .breakdown-item .value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #a5b4fc;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
      }

      .metric-card {
        padding: 1.25rem;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        border-top: 3px solid var(--metric-color);
      }

      .metric-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .unit-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: #e2e8f0;
      }

      .total-score {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--metric-color);
      }

      .metric-bars {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }

      .bar-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .bar-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.6875rem;
        color: #64748b;
      }

      .bar-track {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        background: var(--metric-color);
        border-radius: 3px;
      }

      .bar-track.fatigue .bar-fill {
        background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444);
      }

      .trend-section {
        flex: 1;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        padding: 1.5rem;
        min-height: 300px;
      }

      .trend-section h3 {
        font-size: 1rem;
        font-weight: 600;
        color: #e2e8f0;
        margin: 0 0 1.5rem;
      }

      .trend-chart {
        height: calc(100% - 60px);
        display: flex;
        flex-direction: column;
      }

      .chart-labels {
        display: flex;
        justify-content: space-around;
        padding: 0 2rem;
        margin-bottom: 0.5rem;
      }

      .chart-labels span {
        font-size: 0.6875rem;
        color: #64748b;
        width: 40px;
        text-align: center;
      }

      .chart-bars {
        flex: 1;
        display: flex;
        justify-content: space-around;
        align-items: flex-end;
        padding: 0 2rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .day-bars {
        display: flex;
        gap: 4px;
        align-items: flex-end;
        height: 100%;
      }

      .bar-column {
        width: 16px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 4px;
      }

      .coverage-bar,
      .efficiency-bar,
      .fairness-bar {
        width: 100%;
        border-radius: 2px;
      }

      .coverage-bar {
        background: #3b82f6;
      }
      .efficiency-bar {
        background: #10b981;
      }
      .fairness-bar {
        background: #8b5cf6;
      }

      .chart-legend {
        display: flex;
        justify-content: center;
        gap: 2rem;
        padding-top: 1rem;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: #94a3b8;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }

      .dot.coverage {
        background: #3b82f6;
      }
      .dot.efficiency {
        background: #10b981;
      }
      .dot.fairness {
        background: #8b5cf6;
      }
    `,
  ],
})
export class PerformanceComponent {
  private api = inject(ApiService);

  selectedPeriod = 'week';
  trendDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  metrics = signal<PerformanceMetric[]>([
    {
      unit: 'mr',
      coverage: 94,
      efficiency: 87,
      avgFatigue: 42,
      fairness: 91,
      compliance: 96,
      totalScore: 92,
    },
    {
      unit: 'bt',
      coverage: 91,
      efficiency: 89,
      avgFatigue: 48,
      fairness: 88,
      compliance: 94,
      totalScore: 90,
    },
    {
      unit: 'rontgen',
      coverage: 88,
      efficiency: 85,
      avgFatigue: 38,
      fairness: 85,
      compliance: 92,
      totalScore: 87,
    },
    {
      unit: 'nukleer',
      coverage: 95,
      efficiency: 91,
      avgFatigue: 45,
      fairness: 93,
      compliance: 97,
      totalScore: 94,
    },
    {
      unit: 'onkoloji',
      coverage: 97,
      efficiency: 93,
      avgFatigue: 52,
      fairness: 89,
      compliance: 98,
      totalScore: 96,
    },
  ]);

  trendData = signal<TrendData[]>([
    { date: '2026-05-01', coverage: 92, efficiency: 88, fairness: 90 },
    { date: '2026-05-02', coverage: 89, efficiency: 85, fairness: 88 },
    { date: '2026-05-03', coverage: 91, efficiency: 87, fairness: 92 },
    { date: '2026-05-04', coverage: 94, efficiency: 90, fairness: 89 },
    { date: '2026-05-05', coverage: 93, efficiency: 88, fairness: 91 },
    { date: '2026-05-06', coverage: 90, efficiency: 86, fairness: 87 },
    { date: '2026-05-07', coverage: 92, efficiency: 89, fairness: 90 },
  ]);

  overallScore = computed(() =>
    Math.round(this.metrics().reduce((sum, m) => sum + m.totalScore, 0) / this.metrics().length),
  );
  avgCoverage = computed(() =>
    Math.round(this.metrics().reduce((sum, m) => sum + m.coverage, 0) / this.metrics().length),
  );
  avgEfficiency = computed(() =>
    Math.round(this.metrics().reduce((sum, m) => sum + m.efficiency, 0) / this.metrics().length),
  );
  avgFairness = computed(() =>
    Math.round(this.metrics().reduce((sum, m) => sum + m.fairness, 0) / this.metrics().length),
  );

  getUnitColor(unit: string): string {
    const colors: Record<string, string> = {
      mr: '#3b82f6',
      bt: '#14b8a6',
      rontgen: '#f97316',
      nukleer: '#22c55e',
      onkoloji: '#ec4899',
    };
    return colors[unit] || '#6366f1';
  }

  getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      nukleer: 'Nükleer Tıp',
      onkoloji: 'Radyasyon Onkolojisi',
    };
    return labels[unit] || unit;
  }
}
