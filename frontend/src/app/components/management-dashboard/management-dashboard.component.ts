import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ScheduleService } from '../../services/schedule.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-management-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page md-page">
      <div class="hero-section glass animate-in">
        <div class="hero-top">
          <div class="hero-brand">
            <h1 class="hero-title">Yönetim Paneli</h1>
            <p class="hero-subtitle">Operasyonel görünürlük ve analitik</p>
          </div>
          <div class="hero-actions">
            <div class="filter-group">
              <select class="filter-select" [(ngModel)]="selectedMonth" (change)="loadAll()">
                @for (m of months; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
              <select class="filter-select" [(ngModel)]="selectedYear" (change)="loadAll()">
                @for (y of years; track y) {
                  <option [value]="y">{{ y }}</option>
                }
              </select>
              <select class="filter-select" [(ngModel)]="selectedUnit" (change)="loadAll()">
                <option value="">Tüm Birimler</option>
                @for (u of units; track u.value) {
                  <option [value]="u.value">{{ u.label }}</option>
                }
              </select>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="loadAll()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg
              >Yenile
            </button>
          </div>
        </div>
      </div>

      @if (error()) {
        <div class="error-banner">
          <span>{{ error() }}</span>
        </div>
      }

      @if (loading()) {
        <div class="loading-grid">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="skeleton-card">
              <div
                class="skeleton-shimmer"
                style="height:120px;border-radius:var(--radius-lg)"
              ></div>
            </div>
          }
        </div>
      } @else {
        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(59,130,246,0.1);color:#60a5fa">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value">{{ overview()?.totalPersonnel || 0 }}</span>
              <span class="kpi-label">Toplam Personel</span>
            </div>
          </div>

          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(16,185,129,0.1);color:#34d399">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value">{{ overview()?.totalShifts || 0 }}</span>
              <span class="kpi-label">Toplam Vardiya</span>
            </div>
          </div>

          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(245,158,11,0.1);color:#fbbf24">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 20V10" />
                <path d="M18 20V4" />
                <path d="M6 20v-4" />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value"
                >{{ overview()?.monthlyOvertime || 0 }}<span class="kpi-unit">sa</span></span
              >
              <span class="kpi-label">Aylık Fazla Mesai</span>
            </div>
          </div>

          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(139,92,246,0.1);color:#a78bfa">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value">{{ overview()?.missingShifts || 0 }}</span>
              <span class="kpi-label">Eksik Vardiya</span>
            </div>
          </div>

          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(239,68,68,0.1);color:#f87171">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value"
                >{{ overview()?.nightShiftRatio || 0 }}<span class="kpi-unit">%</span></span
              >
              <span class="kpi-label">Gece Vardiyası Oranı</span>
            </div>
          </div>

          <div class="kpi-card glass">
            <div class="kpi-icon" style="background:rgba(6,182,212,0.1);color:#22d3ee">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div class="kpi-body">
              <span class="kpi-value">{{ overview()?.busiestUnit || '-' }}</span>
              <span class="kpi-label">En Yoğun Birim</span>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-grid">
          <!-- Night Distribution Pie -->
          <div class="chart-card glass">
            <div class="chart-header">
              <h3>Gece Vardiyası Dağılımı</h3>
            </div>
            <div class="chart-body chart-pie-container">
              @if (overview()?.nightDistribution?.length) {
                <svg viewBox="0 0 200 200" class="pie-svg">
                  @for (s of pieSlices(); track s.unit) {
                    <path
                      [attr.d]="s.path"
                      [attr.fill]="s.color"
                      stroke="var(--bg-primary)"
                      stroke-width="2"
                    >
                      <title>
                        {{ s.unit }}: Gece={{ s.night }}, Gündüz={{ s.day }}, Akşam={{ s.evening }}
                      </title>
                    </path>
                  }
                  @if (!hasNightData()) {
                    <text
                      x="100"
                      y="100"
                      text-anchor="middle"
                      fill="var(--text-muted)"
                      font-size="12"
                    >
                      Gece verisi yok
                    </text>
                  }
                </svg>
                <div class="pie-legend">
                  @for (s of pieSlices(); track s.unit) {
                    <div class="legend-item">
                      <span class="legend-dot" [style.background]="s.color"></span>
                      <span class="legend-label">{{ s.unit }}</span>
                      <span class="legend-value">{{ s.night }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="chart-empty">Gece vardiyası verisi bulunamadı</div>
              }
            </div>
          </div>

          <!-- Unit Occupancy Bar Chart -->
          <div class="chart-card glass">
            <div class="chart-header">
              <h3>Birim Doluluk Oranları</h3>
            </div>
            <div class="chart-body">
              @if (overview()?.unitOccupancy?.length) {
                <div class="bar-chart">
                  @for (u of overview()?.unitOccupancy; track u.unit) {
                    <div class="bar-row">
                      <span class="bar-label">{{ u.unit }}</span>
                      <div class="bar-track">
                        <div
                          class="bar-fill"
                          [style.width.%]="u.rate"
                          [style.background]="getBarColor(u.rate)"
                        ></div>
                      </div>
                      <span class="bar-value">{{ u.rate }}%</span>
                      <span class="bar-detail">({{ u.assigned }}/{{ u.total }})</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="chart-empty">Doluluk verisi bulunamadı</div>
              }
            </div>
          </div>
        </div>

        <!-- Overtime Ranking -->
        <div class="chart-card glass">
          <div class="chart-header">
            <h3>Fazla Mesai Sıralaması</h3>
          </div>
          <div class="chart-body">
            @if (overtimeData().length) {
              <div class="overtime-chart">
                @for (p of overtimeData().slice(0, 10); track p.personnelId) {
                  <div class="bar-row">
                    <span class="bar-label">{{ p.personnelName }}</span>
                    <div class="bar-track">
                      <div
                        class="bar-fill overtime-fill"
                        [style.width.%]="getOvertimePct(p.overtimeHours, maxOvertime())"
                        [style.background]="getOvertimeColor(p.overtimePercent)"
                      ></div>
                    </div>
                    <span class="bar-value">{{ p.overtimeHours }}sa</span>
                    <span class="bar-detail">({{ p.totalShifts }} vardiya)</span>
                  </div>
                }
              </div>
            } @else {
              <div class="chart-empty">Fazla mesai verisi bulunamadı</div>
            }
          </div>
        </div>

        <!-- Device Utilization + Staff Workload side by side -->
        <div class="charts-grid">
          <!-- Device Utilization -->
          <div class="chart-card glass">
            <div class="chart-header">
              <h3>Cihaz Kullanımı</h3>
            </div>
            <div class="chart-body">
              @if (deviceUtilData().length) {
                <div class="device-list">
                  @for (d of deviceUtilData().slice(0, 8); track d.deviceId) {
                    <div class="device-item">
                      <div class="device-top">
                        <span class="device-name">{{ d.deviceName }}</span>
                        <span class="device-code">{{ d.deviceCode }}</span>
                        <span class="device-unit">{{ d.unitName }}</span>
                      </div>
                      <div class="device-util-bar">
                        <div
                          class="device-fill"
                          [style.width.%]="d.utilizationRate"
                          [style.background]="getUtilColor(d.utilizationRate)"
                        ></div>
                      </div>
                      <div class="device-stats">
                        <span
                          >Kullanım: <strong>{{ d.utilizationRate }}%</strong></span
                        >
                        <span>Atama: {{ d.totalAssignments }} / {{ d.maxSlots }}</span>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="chart-empty">Cihaz verisi bulunamadı</div>
              }
            </div>
          </div>

          <!-- Staff Workload Table -->
          <div class="chart-card glass">
            <div class="chart-header">
              <h3>Personel İş Yükü</h3>
            </div>
            <div class="chart-body p-0">
              @if (workloadData().length) {
                <div class="workload-table-wrapper scroll-container scroll-sticky-head">
                  <table class="workload-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Toplam</th>
                        <th>Gündüz</th>
                        <th>Gece</th>
                        <th>Saat</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of workloadData().slice(0, 12); track p.personnelId) {
                        <tr>
                          <td>
                            <span class="wl-name">{{ p.personnelName }}</span>
                          </td>
                          <td>
                            <strong>{{ p.totalShifts }}</strong>
                          </td>
                          <td>{{ p.dayShifts }}</td>
                          <td>
                            <span class="night-count">{{ p.nightShifts }}</span>
                          </td>
                          <td>{{ p.totalHours }}sa</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <div class="chart-empty">İş yükü verisi bulunamadı</div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .md-page {
        padding: 16px 20px;
        max-width: 1400px;
        margin: 0 auto;
      }
      .hero-section {
        padding: 20px 24px;
        margin-bottom: 16px;
        border-radius: var(--radius-xl);
      }
      .hero-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
      }
      .hero-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.4px;
      }
      .hero-subtitle {
        font-size: 13px;
        color: var(--text-muted);
        margin: 4px 0 0;
      }
      .hero-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .filter-group {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .filter-select {
        padding: 7px 10px;
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: 12px;
        cursor: pointer;
      }
      .filter-select:focus {
        outline: none;
        border-color: var(--accent-mr);
      }
      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn-ghost:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .btn-sm {
        padding: 6px 12px;
        font-size: 11px;
      }
      .error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        margin-bottom: 12px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }

      .loading-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .kpi-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 20px;
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-subtle);
      }
      .kpi-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--radius-lg);
        flex-shrink: 0;
      }
      .kpi-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .kpi-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
      }
      .kpi-unit {
        font-size: 12px;
        font-weight: 400;
        color: var(--text-muted);
        margin-left: 2px;
      }
      .kpi-label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .charts-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }
      @media (max-width: 900px) {
        .charts-grid {
          grid-template-columns: 1fr;
        }
      }

      .chart-card {
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-subtle);
        overflow: hidden;
      }
      .chart-header {
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .chart-header h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .chart-body {
        padding: 16px 18px;
      }
      .chart-body.p-0 {
        padding: 0;
      }
      .chart-empty {
        padding: 32px;
        text-align: center;
        font-size: 12px;
        color: var(--text-muted);
      }

      .pie-svg {
        width: 160px;
        height: 160px;
        flex-shrink: 0;
      }
      .chart-pie-container {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .pie-legend {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-secondary);
      }
      .legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .legend-value {
        margin-left: auto;
        font-weight: 600;
        color: var(--text-primary);
      }

      .bar-chart,
      .overtime-chart {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bar-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .bar-label {
        width: 80px;
        font-size: 11px;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
      }
      .bar-track {
        flex: 1;
        height: 18px;
        background: var(--bg-glass);
        border-radius: 4px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s;
        min-width: 2px;
      }
      .overtime-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s;
      }
      .bar-value {
        width: 50px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-primary);
        text-align: right;
        flex-shrink: 0;
      }
      .bar-detail {
        font-size: 10px;
        color: var(--text-muted);
        width: 70px;
        flex-shrink: 0;
      }

      .device-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .device-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .device-top {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
      }
      .device-name {
        font-weight: 600;
        color: var(--text-primary);
      }
      .device-code {
        color: var(--text-muted);
        font-size: 10px;
      }
      .device-unit {
        margin-left: auto;
        color: var(--text-muted);
        font-size: 10px;
      }
      .device-util-bar {
        height: 8px;
        background: var(--bg-glass);
        border-radius: 4px;
        overflow: hidden;
      }
      .device-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s;
      }
      .device-stats {
        display: flex;
        gap: 12px;
        font-size: 10px;
        color: var(--text-muted);
      }
      .device-stats strong {
        color: var(--text-secondary);
      }

      .workload-table-wrapper {
        overflow-x: auto;
        max-height: 340px;
      }
      .workload-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        font-size: 11px;
      }
      .workload-table th {
        position: sticky;
        top: 0;
        background: var(--bg-surface);
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        font-size: 9px;
        letter-spacing: 0.3px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .workload-table td {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-subtle);
        color: var(--text-secondary);
      }
      .workload-table tr:last-child td {
        border-bottom: none;
      }
      .wl-name {
        font-weight: 500;
        color: var(--text-primary);
      }
      .night-count {
        color: #a78bfa;
        font-weight: 600;
      }

      @media (max-width: 768px) {
        .hero-top {
          flex-direction: column;
        }
        .hero-actions {
          width: 100%;
        }
        .filter-group {
          width: 100%;
        }
        .filter-group select {
          flex: 1;
        }
        .kpi-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
})
export class ManagementDashboardComponent implements OnInit, OnDestroy {
  private scheduleService = inject(ScheduleService);
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();

  protected months = [
    { value: 1, label: 'Ocak' },
    { value: 2, label: 'Şubat' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' },
    { value: 5, label: 'Mayıs' },
    { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' },
    { value: 8, label: 'Ağustos' },
    { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' },
    { value: 11, label: 'Kasım' },
    { value: 12, label: 'Aralık' },
  ];

  protected years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  protected units = [
    { value: 'mr', label: 'MR' },
    { value: 'bt', label: 'BT' },
    { value: 'rontgen', label: 'Röntgen' },
    { value: 'nukleer', label: 'Nükleer Tıp' },
    { value: 'onkoloji', label: 'RONK' },
  ];

  protected selectedMonth = new Date().getMonth() + 1;
  protected selectedYear = new Date().getFullYear();
  protected selectedUnit = '';

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected overview = signal<any>(null);
  protected workloadData = signal<any[]>([]);
  protected overtimeData = signal<any[]>([]);
  protected deviceUtilData = signal<any[]>([]);

  ngOnInit() {
    this.loadAll();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected loadAll() {
    this.loading.set(true);
    this.error.set(null);

    const params: any = { month: this.selectedMonth, year: this.selectedYear };
    if (this.selectedUnit) params.unitType = this.selectedUnit;

    Promise.all([
      this.fetchOverview(params),
      this.fetchWorkload(params),
      this.fetchOvertime(params),
      this.fetchDeviceUtil(params),
    ])
      .catch(() => {})
      .finally(() => this.loading.set(false));
  }

  private fetchOverview(params: any): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleService
        .getAnalyticsOverview(params)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.overview.set(data);
            resolve();
          },
          error: (err) => {
            this.error.set(err.message || 'Veri yüklenemedi');
            resolve();
          },
        });
    });
  }

  private fetchWorkload(params: any): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleService
        .getAnalyticsWorkload(params)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.workloadData.set(data);
            resolve();
          },
          error: () => resolve(),
        });
    });
  }

  private fetchOvertime(params: any): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleService
        .getAnalyticsOvertime(params)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.overtimeData.set(data);
            resolve();
          },
          error: () => resolve(),
        });
    });
  }

  private fetchDeviceUtil(params: any): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleService
        .getAnalyticsDeviceUtilization(params)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.deviceUtilData.set(data);
            resolve();
          },
          error: () => resolve(),
        });
    });
  }

  // ---- Pie chart computation ----

  protected pieSlices = computed(() => {
    const dist = this.overview()?.nightDistribution || [];
    const total = dist.reduce((s: number, d: any) => s + d.night, 0);
    if (total === 0) return [];

    const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#22c55e', '#a78bfa', '#06b6d4', '#ec4899'];
    let currentAngle = 0;
    const cx = 100,
      cy = 100,
      r = 85;

    return dist.map((d: any, i: number) => {
      const sliceAngle = (d.night / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;

      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);

      const largeArc = sliceAngle > 180 ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      return { ...d, path, color: colors[i % colors.length], night: d.night };
    });
  });

  protected hasNightData = computed(() => {
    const dist = this.overview()?.nightDistribution || [];
    return dist.some((d: any) => d.night > 0);
  });

  // ---- Color helpers ----

  protected getBarColor(rate: number): string {
    if (rate >= 90) return '#22c55e';
    if (rate >= 70) return '#3b82f6';
    if (rate >= 50) return '#f59e0b';
    return '#ef4444';
  }

  protected getUtilColor(rate: number): string {
    if (rate >= 80) return '#22c55e';
    if (rate >= 50) return '#3b82f6';
    if (rate >= 30) return '#f59e0b';
    return '#6b7280';
  }

  protected getOvertimeColor(pct: number): string {
    if (pct >= 50) return '#ef4444';
    if (pct >= 25) return '#f59e0b';
    return '#3b82f6';
  }

  protected getOvertimePct(hours: number, max: number): number {
    if (max === 0) return 0;
    return Math.min(100, (hours / max) * 100);
  }

  protected maxOvertime = computed(() => {
    const data = this.overtimeData();
    if (!data?.length) return 0;
    return Math.max(...data.map((d: any) => d.overtimeHours));
  });
}
