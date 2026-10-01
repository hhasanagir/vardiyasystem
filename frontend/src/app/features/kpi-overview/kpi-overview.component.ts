import {
  Component,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import { CardComponent } from '../../ui/card/card.component';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { ApiService } from '../../services/api.service';

interface KpiMetric {
  id: string;
  label: string;
  value: number;
  target: number;
  unit: string;
  format: 'number' | 'percent' | 'hours' | 'ratio';
  trend: number;
  category: 'coverage' | 'efficiency' | 'quality' | 'compliance';
}

interface KpiCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  metrics: KpiMetric[];
}

@Component({
  selector: 'app-kpi-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonComponent, CardComponent, BadgeComponent],
  template: `
    <div class="kpi-page">
      <div class="kpi-header">
        <div>
          <h1>KPI Gösterge Paneli</h1>
          <p class="kpi-subtitle">{{ selectedPeriod() }} dönemi performans metrikleri</p>
        </div>
        <div class="kpi-controls">
          <select
            class="kpi-select"
            [ngModel]="selectedPeriod()"
            (ngModelChange)="selectedPeriod.set($event)"
          >
            <option value="this-month">Bu Ay</option>
            <option value="last-month">Geçen Ay</option>
            <option value="this-quarter">Bu Çeyrek</option>
            <option value="this-year">Bu Yıl</option>
          </select>
          <button class="kpi-refresh" (click)="refresh()">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="16"
              height="16"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
            Yenile
          </button>
        </div>
      </div>

      <!-- Overall Score -->
      <div class="overall-score-card" role="region" aria-label="Genel performans skoru">
        <div class="overall-score-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="var(--border-subtle)"
              stroke-width="8"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="var(--primary)"
              stroke-width="8"
              stroke-dasharray="339.292"
              [attr.stroke-dashoffset]="339.292 - (339.292 * overallScore()) / 100"
              stroke-linecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="overall-score-value">
            {{ overallScore() }}<span class="overall-score-unit">%</span>
          </div>
        </div>
        <div class="overall-score-info">
          <div class="overall-score-label">Genel Performans</div>
          <div
            class="overall-score-trend"
            [class.trend-up]="overallTrend() > 0"
            [class.trend-down]="overallTrend() < 0"
          >
            {{ overallTrend() > 0 ? '+' : '' }}{{ overallTrend() }}% geçen döneme göre
          </div>
        </div>
      </div>

      <!-- Category Grid -->
      <div class="category-grid">
        @for (cat of categories(); track cat.id) {
          <app-card [header]="cat.label" [class]="'cat-card'">
            <div class="category-metrics">
              @for (m of cat.metrics; track m.id) {
                <div class="metric-row">
                  <div class="metric-header">
                    <span class="metric-label">{{ m.label }}</span>
                    <app-badge [severity]="getMetricSeverity(m)" [dot]="true">{{
                      getMetricStatus(m)
                    }}</app-badge>
                  </div>
                  <div class="metric-values">
                    <span class="metric-current">{{ formatValue(m) }}</span>
                    <span class="metric-target">hedef: {{ formatTarget(m) }}</span>
                  </div>
                  <div class="metric-bar">
                    <div
                      class="metric-bar-fill"
                      [style.width.%]="getMetricPercent(m)"
                      [style.background]="getMetricBarColor(m)"
                    ></div>
                  </div>
                  @if (m.trend !== 0) {
                    <div
                      class="metric-trend"
                      [class.trend-up]="m.trend > 0"
                      [class.trend-down]="m.trend < 0"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        width="12"
                        height="12"
                      >
                        @if (m.trend > 0) {
                          <polyline points="18 15 12 9 6 15" />
                        }
                        @if (m.trend < 0) {
                          <polyline points="6 9 12 15 18 9" />
                        }
                      </svg>
                      {{ m.trend > 0 ? '+' : '' }}{{ m.trend }}%
                    </div>
                  }
                </div>
              }
            </div>
          </app-card>
        } @empty {
          <div class="kpi-loading-grid">
            @for (s of [1, 2, 3, 4]; track s) {
              <app-skeleton variant="card" style="min-height: 16rem;" />
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .kpi-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .kpi-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .kpi-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }
      .kpi-subtitle {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin: 0.25rem 0 0;
      }
      .kpi-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .kpi-select {
        padding: 0.5rem 2rem 0.5rem 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.8rem;
        appearance: auto;
      }
      .kpi-refresh {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
      }
      .kpi-refresh:hover {
        background: var(--bg-hover);
      }

      .overall-score-card {
        display: flex;
        align-items: center;
        gap: 2rem;
        padding: 1.5rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
      }
      .overall-score-ring {
        position: relative;
        width: 120px;
        height: 120px;
        flex-shrink: 0;
      }
      .overall-score-ring svg {
        display: block;
      }
      .overall-score-value {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      .overall-score-unit {
        font-size: 1rem;
        color: var(--text-muted);
      }
      .overall-score-label {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
      }
      .overall-score-trend {
        font-size: 0.8rem;
        margin-top: 0.25rem;
      }
      .trend-up {
        color: var(--status-success);
      }
      .trend-down {
        color: var(--status-danger);
      }

      .category-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
        gap: 1rem;
      }
      @media (max-width: 640px) {
        .category-grid {
          grid-template-columns: 1fr;
        }
      }

      .category-metrics {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .metric-row {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .metric-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .metric-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--text-primary);
      }
      .metric-values {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
      }
      .metric-current {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
      }
      .metric-target {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .metric-bar {
        height: 0.375rem;
        background: var(--bg-secondary);
        border-radius: 9999px;
        overflow: hidden;
      }
      .metric-bar-fill {
        height: 100%;
        border-radius: 9999px;
        transition: width 0.5s ease;
      }
      .metric-trend {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.7rem;
        font-weight: 600;
      }
      .trend-up {
        color: var(--status-success);
      }
      .trend-down {
        color: var(--status-danger);
      }

      .kpi-loading-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
        gap: 1rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiOverviewComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private api = inject(ApiService);
  private destroy$ = new Subject<void>();

  protected selectedPeriod = signal<string>('this-month');
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  protected readonly overallScore = computed(() => {
    const cats = this.categories();
    const metrics = cats.flatMap((c) => c.metrics);
    if (metrics.length === 0) return 0;
    const pcts = metrics.map((m) => Math.min(100, Math.round((m.value / m.target) * 100)));
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  });

  protected readonly overallTrend = computed(() => {
    const cats = this.categories();
    const metrics = cats.flatMap((c) => c.metrics);
    if (metrics.length === 0) return 0;
    return Math.round(metrics.reduce((a, m) => a + m.trend, 0) / metrics.length);
  });

  protected readonly categories = signal<KpiCategory[]>([]);

  ngOnInit(): void {
    this.loadKpis();
    effect(() => {
      this.selectedPeriod();
      queueMicrotask(() => this.loadKpis());
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.loadKpis();
  }

  private loadKpis(): void {
    this.loading.set(true);
    this.error.set(null);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    this.api
      .get<any>(`/analytics/overview?month=${month}&year=${year}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const totalShifts = res?.totalShifts || 0;
          const missingShifts = res?.missingShifts || 0;
          const nightRatio = res?.nightShiftRatio || 0;
          const totalPersonnel = res?.totalPersonnel || 0;
          const totalSlots = totalShifts + missingShifts;
          const coveragePercent = totalSlots > 0 ? Math.round((totalShifts / totalSlots) * 100) : 0;
          const occupancy = (res?.unitOccupancy || []) as Array<{ rate: number }>;
          const avgOccupancy = occupancy.length
            ? Math.round(occupancy.reduce((s, u) => s + (u.rate || 0), 0) / occupancy.length)
            : 0;
          const overtimeHours = res?.monthlyOvertime || 0;

          this.categories.set([
            {
              id: 'coverage',
              label: 'Kapsama',
              icon: '',
              color: '#3b82f6',
              metrics: [
                {
                  id: 'shift-fill',
                  label: 'Vardiya Doluluk',
                  value: coveragePercent,
                  target: 95,
                  unit: '%',
                  format: 'percent',
                  trend: 0,
                  category: 'coverage',
                },
                {
                  id: 'unit-occupancy',
                  label: 'Ort. Ünite Doluluk',
                  value: avgOccupancy,
                  target: 85,
                  unit: '%',
                  format: 'percent',
                  trend: 0,
                  category: 'coverage',
                },
                {
                  id: 'missing-shifts',
                  label: 'Boş Vardiya',
                  value: missingShifts,
                  target: 0,
                  unit: '',
                  format: 'number',
                  trend: 0,
                  category: 'coverage',
                },
              ],
            },
            {
              id: 'efficiency',
              label: 'Verimlilik',
              icon: '',
              color: '#14b8a6',
              metrics: [
                {
                  id: 'overtime',
                  label: 'Fazla Mesai (saat)',
                  value: overtimeHours,
                  target: 100,
                  unit: 'sa',
                  format: 'hours',
                  trend: 0,
                  category: 'efficiency',
                },
                {
                  id: 'avg-hours',
                  label: 'Ort. Saat/Personel',
                  value: totalPersonnel > 0 ? Math.round((totalShifts * 8) / totalPersonnel) : 0,
                  target: 160,
                  unit: 'sa',
                  format: 'hours',
                  trend: 0,
                  category: 'efficiency',
                },
              ],
            },
            {
              id: 'quality',
              label: 'Kalite',
              icon: '',
              color: '#8b5cf6',
              metrics: [
                {
                  id: 'night-ratio',
                  label: 'Gece Vardiya Oranı',
                  value: nightRatio,
                  target: 33,
                  unit: '%',
                  format: 'percent',
                  trend: 0,
                  category: 'quality',
                },
              ],
            },
            {
              id: 'compliance',
              label: 'Uyumluluk',
              icon: '',
              color: '#f97316',
              metrics: [
                {
                  id: 'total-personnel',
                  label: 'Aktif Personel',
                  value: totalPersonnel,
                  target: totalPersonnel || 1,
                  unit: '',
                  format: 'number',
                  trend: 0,
                  category: 'compliance',
                },
              ],
            },
          ]);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'KPI verileri yüklenemedi');
          this.loading.set(false);
        },
      });
  }

  formatValue(m: KpiMetric): string {
    if (m.format === 'percent') return `%${m.value}`;
    if (m.format === 'hours') return `${m.value}sa`;
    return String(m.value);
  }

  formatTarget(m: KpiMetric): string {
    if (m.format === 'percent') return `%${m.target}`;
    if (m.format === 'hours') return `${m.target}sa`;
    return String(m.target);
  }

  getMetricPercent(m: KpiMetric): number {
    return Math.min(100, Math.round((m.value / m.target) * 100));
  }

  getMetricSeverity(m: KpiMetric): 'success' | 'warning' | 'danger' {
    const pct = this.getMetricPercent(m);
    if (pct >= 90) return 'success';
    if (pct >= 70) return 'warning';
    return 'danger';
  }

  getMetricStatus(m: KpiMetric): string {
    const pct = this.getMetricPercent(m);
    if (pct >= 90) return 'Hedefe Yakın';
    if (pct >= 70) return 'İyileştirilebilir';
    return 'Kritik';
  }

  getMetricBarColor(m: KpiMetric): string {
    const pct = this.getMetricPercent(m);
    if (pct >= 90) return 'var(--status-success)';
    if (pct >= 70) return 'var(--status-warning)';
    return 'var(--status-danger)';
  }
}
