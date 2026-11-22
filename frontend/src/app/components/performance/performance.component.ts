import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ScheduleService } from '../../services/schedule.service';

interface OverviewUnit {
  unit: string;
  name: string;
  rate: number;
  assigned: number;
  total: number;
  night: number;
  day: number;
  evening: number;
}

interface OverviewResponse {
  period: string;
  totalPersonnel: number;
  totalShifts: number;
  monthlyOvertime: number;
  nightShiftRatio: number;
  missingShifts: number;
  busiestUnit: string;
  unitOccupancy: { unit: string; name: string; rate: number; assigned: number; total: number }[];
  nightDistribution: { unit: string; name: string; night: number; day: number; evening: number }[];
  daysInMonth: number;
}

interface UnitMetric {
  unit: string;
  name: string;
  coverage: number;
  assigned: number;
  total: number;
  night: number;
  day: number;
  evening: number;
}

@Component({
  selector: 'app-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="performance-page">
      <header class="page-header">
        <div class="header-left">
          <h1>Performans Analizi</h1>
          <p class="subtitle">Analiz servisinden alınan gerçek vardiya metrikleri</p>
        </div>
        <div class="header-right">
          <span class="period-label">{{ periodLabel() }}</span>
        </div>
      </header>

      @if (loadError()) {
        <div class="note note-error">Metrikler yüklenemedi: {{ loadError() }}</div>
      }
      @if (loading()) {
        <div class="note">Metrikler yükleniyor...</div>
      }

      <div class="overall-score">
        <div class="score-ring">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="8"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="#6366f1" stroke-width="8"
              stroke-dasharray="339.3" [attr.stroke-dashoffset]="339.3 - (339.3 * avgCoverage() / 100)"
              stroke-linecap="round" transform="rotate(-90 60 60)"/>
          </svg>
          <div class="score-value">{{ avgCoverage() }}</div>
        </div>
        <div class="score-details">
          <h2>Ortalama Kapsama</h2>
          <div class="score-breakdown">
            <div class="breakdown-item">
              <span class="label">Personel</span>
              <span class="value">{{ overview()?.totalPersonnel ?? 0 }}</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Toplam Vardiya</span>
              <span class="value">{{ overview()?.totalShifts ?? 0 }}</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Eksik Vardiya</span>
              <span class="value">{{ overview()?.missingShifts ?? 0 }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="metrics-grid">
        @for (metric of metrics(); track metric.unit) {
          <div class="metric-card" [style.--metric-color]="getUnitColor(metric.unit)">
            <div class="metric-header">
              <span class="unit-name">{{ metric.name }}</span>
              <span class="total-score">{{ metric.coverage }}%</span>
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
                  <span>Atanan / Toplam</span>
                  <span>{{ metric.assigned }} / {{ metric.total }}</span>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="trend-section">
        <h3>Gece Vardiyası Dağılımı</h3>
        <div class="trend-chart">
          <div class="chart-labels">
            @for (m of metrics(); track m.unit) {
              <span>{{ m.name }}</span>
            }
          </div>
          <div class="chart-bars">
            @for (m of metrics(); track m.unit) {
              <div class="day-bars">
                <div class="bar-column" [style.height.%]="barHeight(m.night)">
                  <div class="night-bar"></div>
                </div>
                <div class="bar-column" [style.height.%]="barHeight(m.day)">
                  <div class="day-bar"></div>
                </div>
                <div class="bar-column" [style.height.%]="barHeight(m.evening)">
                  <div class="evening-bar"></div>
                </div>
              </div>
            }
          </div>
          <div class="chart-legend">
            <div class="legend-item"><span class="dot night"></span>Gece ({{ overview()?.nightShiftRatio ?? 0 }}%)</div>
            <div class="legend-item"><span class="dot day"></span>Gündüz</div>
            <div class="legend-item"><span class="dot evening"></span>Akşam</div>
          </div>
        </div>
      </div>

      <div class="summary-line">
        <span>Gece vardiyası oranı: <b>{{ overview()?.nightShiftRatio ?? 0 }}%</b></span>
        <span>Fazla mesai: <b>{{ overview()?.monthlyOvertime ?? 0 }}</b></span>
        <span>En yoğun birim: <b>{{ overview()?.busiestUnit || '-' }}</b></span>
      </div>
    </div>
  `,
  styles: [`
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

    .period-label {
      padding: 8px 14px;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(71, 85, 105, 0.2);
      border-radius: 8px;
      color: #94a3b8;
      font-size: 0.875rem;
    }

    .note {
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(71, 85, 105, 0.2);
      font-size: 0.875rem;
      color: #94a3b8;
    }

    .note-error {
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
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
      width: 60px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

    .night-bar, .day-bar, .evening-bar {
      width: 100%;
      border-radius: 2px;
    }

    .night-bar { background: #8b5cf6; }
    .day-bar { background: #3b82f6; }
    .evening-bar { background: #f59e0b; }

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

    .dot.night { background: #8b5cf6; }
    .dot.day { background: #3b82f6; }
    .dot.evening { background: #f59e0b; }

    .summary-line {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
      color: #64748b;
    }

    .summary-line b {
      color: #e2e8f0;
    }
  `]
})
export class PerformanceComponent implements OnInit, OnDestroy {
  private readonly scheduleApi = inject(ScheduleService);
  private readonly destroy$ = new Subject<void>();

  protected readonly overview = signal<OverviewResponse | null>(null);
  protected readonly metrics = signal<UnitMetric[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly periodLabel = computed(() => {
    const p = this.overview()?.period;
    return p ? `Dönem: ${p}` : 'Metrik yüklenmedi';
  });

  protected readonly avgCoverage = computed(() => {
    const list = this.metrics();
    if (list.length === 0) return 0;
    return Math.round(list.reduce((sum, m) => sum + m.coverage, 0) / list.length);
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    const now = new Date();
    this.loading.set(true);
    this.loadError.set(null);
    this.scheduleApi.getAnalyticsOverview({ month: now.getMonth() + 1, year: now.getFullYear() }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        const d = this.toOverview(res);
        this.overview.set(d);
        this.metrics.set(this.buildMetrics(d));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.message || 'Analiz verisi alınamadı.');
        this.overview.set(null);
        this.metrics.set([]);
      }
    });
  }

  private toOverview(raw: any): OverviewResponse {
    const occupied = Array.isArray(raw?.unitOccupancy) ? raw.unitOccupancy : [];
    const night = Array.isArray(raw?.nightDistribution) ? raw.nightDistribution : [];
    const u = new Map<string, OverviewUnit>();
    for (const o of occupied) {
      const key = o.unit || o.name || '';
      if (!key) continue;
      u.set(key, {
        unit: key,
        name: o.name || key,
        rate: Number(o.rate) || 0,
        assigned: Number(o.assigned) || 0,
        total: Number(o.total) || 0,
        night: 0,
        day: 0,
        evening: 0,
      });
    }
    for (const n of night) {
      const key = n.unit || n.name || '';
      const entry = u.get(key) || {
        unit: key,
        name: n.name || key,
        rate: 0,
        assigned: 0,
        total: 0,
        night: 0,
        day: 0,
        evening: 0,
      };
      entry.night = Number(n.night) || 0;
      entry.day = Number(n.day) || 0;
      entry.evening = Number(n.evening) || 0;
      u.set(key, entry);
    }
    return {
      period: raw?.period || '',
      totalPersonnel: Number(raw?.totalPersonnel) || 0,
      totalShifts: Number(raw?.totalShifts) || 0,
      monthlyOvertime: Number(raw?.monthlyOvertime) || 0,
      nightShiftRatio: Number(raw?.nightShiftRatio) || 0,
      missingShifts: Number(raw?.missingShifts) || 0,
      busiestUnit: raw?.busiestUnit || '',
      unitOccupancy: occupied,
      nightDistribution: night,
      daysInMonth: Number(raw?.daysInMonth) || 0,
    };
  }

  private buildMetrics(d: OverviewResponse): UnitMetric[] {
    const u = new Map<string, UnitMetric>();
    for (const o of d.unitOccupancy) {
      const key = o.unit || o.name || '';
      if (!key) continue;
      u.set(key, { unit: key, name: o.name || key, coverage: Number(o.rate) || 0, assigned: Number(o.assigned) || 0, total: Number(o.total) || 0, night: 0, day: 0, evening: 0 });
    }
    for (const n of d.nightDistribution) {
      const key = n.unit || n.name || '';
      if (!key) continue;
      const entry = u.get(key) || { unit: key, name: n.name || key, coverage: 0, assigned: 0, total: 0, night: 0, day: 0, evening: 0 };
      entry.night = Number(n.night) || 0;
      entry.day = Number(n.day) || 0;
      entry.evening = Number(n.evening) || 0;
      u.set(key, entry);
    }
    return [...u.values()];
  }

  protected barHeight(count: number): number {
    const max = Math.max(1, ...this.metrics().flatMap(m => [m.night, m.day, m.evening]));
    if (max <= 0) return 0;
    return Math.round((count / max) * 100);
  }

  protected getUnitColor(unit: string): string {
    const colors: Record<string, string> = { mr: '#3b82f6', bt: '#14b8a6', rontgen: '#f97316', nukleer: '#22c55e', onkoloji: '#ec4899' };
    return colors[unit] || '#6366f1';
  }
}