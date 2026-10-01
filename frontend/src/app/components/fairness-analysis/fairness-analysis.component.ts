import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface PersonnelFairness {
  id: string;
  name: string;
  unit: string;
  nightShifts: number;
  weekendShifts: number;
  totalHours: number;
  avgFatigue: number;
  fairnessScore: number;
  deviation: number;
}

@Component({
  selector: 'app-fairness-analysis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fairness-page">
      <header class="page-header">
        <div class="header-left">
          <h1>Adalet Analizi</h1>
          <p class="subtitle">Vardiya dağılımı eşitliği ve personnel performansı</p>
        </div>
        <div class="header-right">
          <select class="unit-filter" [(ngModel)]="selectedUnit">
            <option value="all">Tüm Birimler</option>
            <option value="mr">MR</option>
            <option value="bt">BT</option>
            <option value="rontgen">Röntgen</option>
            <option value="nukleer">Nükleer Tıp</option>
            <option value="onkoloji">Radyasyon Onkolojisi</option>
          </select>
        </div>
      </header>

      <div class="fairness-overview">
        <div class="overview-card main">
          <div class="overview-header">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
            Genel Adalet Skoru
          </div>
          <div class="score-display" [class]="getScoreClass(overallScore())">
            {{ overallScore() }}%
          </div>
          <div class="score-label">{{ getScoreLabel(overallScore()) }}</div>
        </div>
        <div class="overview-card">
          <div class="overview-header">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
            </svg>
            Personel Sayısı
          </div>
          <div class="stat-value">{{ personnel().length }}</div>
          <div class="stat-label">Aktif Personel</div>
        </div>
        <div class="overview-card">
          <div class="overview-header">
            <svg
              width="24"
              height="24"
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
            Gece Vardiyası
          </div>
          <div class="stat-value">{{ avgNightShifts() }}</div>
          <div class="stat-label">Ortalama/Personel</div>
        </div>
        <div class="overview-card">
          <div class="overview-header">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
            </svg>
            Hafta Sonu
          </div>
          <div class="stat-value">{{ avgWeekendShifts() }}</div>
          <div class="stat-label">Ortalama/Personel</div>
        </div>
      </div>

      <div class="distribution-chart">
        <h3>Vardiya Dağılımı</h3>
        <div class="chart-container">
          <div class="distribution-bars">
            @for (item of distributionData(); track item.name) {
              <div
                class="dist-item"
                [class.negative]="item.deviation < -10"
                [class.positive]="item.deviation > 10"
              >
                <div class="personnel-name">{{ item.name }}</div>
                <div class="bar-container">
                  <div class="bar-center"></div>
                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      [style.width.%]="Math.abs(item.value)"
                      [class.negative]="item.value < 0"
                    ></div>
                  </div>
                </div>
                <div class="deviation" [class]="getDeviationClass(item.deviation)">
                  {{ item.deviation > 0 ? '+' : '' }}{{ item.deviation }}%
                </div>
              </div>
            }
          </div>
          <div class="chart-legend">
            <span class="legend-item"><span class="dot"></span> Referans: 50%</span>
          </div>
        </div>
      </div>

      <div class="personnel-table scroll-container scroll-sticky-head">
        <table>
          <thead>
            <tr>
              <th>Personel</th>
              <th>Birim</th>
              <th>Gece</th>
              <th>Hafta Sonu</th>
              <th>Toplam Saat</th>
              <th>Yorgunluk</th>
              <th>Adalet Skoru</th>
              <th>Sapma</th>
            </tr>
          </thead>
          <tbody>
            @for (person of filteredPersonnel(); track person.id) {
              <tr>
                <td>
                  <div class="personnel-cell">
                    <span
                      class="avatar"
                      [style.background]="getAvatarColor(person.fairnessScore)"
                      >{{ person.name.charAt(0) }}</span
                    >
                    <span>{{ person.name }}</span>
                  </div>
                </td>
                <td>
                  <span class="unit-badge" [class]="person.unit">{{
                    getUnitLabel(person.unit)
                  }}</span>
                </td>
                <td>{{ person.nightShifts }}</td>
                <td>{{ person.weekendShifts }}</td>
                <td>{{ person.totalHours }}s</td>
                <td>
                  <div class="fatigue-cell">
                    <div class="fatigue-bar">
                      <div
                        class="fatigue-fill"
                        [style.width.%]="person.avgFatigue"
                        [class.high]="person.avgFatigue > 70"
                      ></div>
                    </div>
                    <span>{{ person.avgFatigue }}%</span>
                  </div>
                </td>
                <td>
                  <span class="score-badge" [class]="getScoreClass(person.fairnessScore)"
                    >{{ person.fairnessScore }}%</span
                  >
                </td>
                <td>
                  <span class="deviation-badge" [class]="getDeviationClass(person.deviation)">
                    {{ person.deviation > 0 ? '+' : '' }}{{ person.deviation }}%
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      .fairness-page {
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

      .unit-filter {
        padding: 10px 16px;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 0.875rem;
      }

      .fairness-overview {
        display: grid;
        grid-template-columns: 2fr repeat(3, 1fr);
        gap: 1rem;
      }

      .overview-card {
        padding: 1.5rem;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
      }

      .overview-card.main {
        border-top: 3px solid #8b5cf6;
      }

      .overview-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: #94a3b8;
        margin-bottom: 1rem;
      }

      .overview-header svg {
        color: #8b5cf6;
      }

      .score-display {
        font-size: 3rem;
        font-weight: 700;
        color: #f8fafc;
      }

      .score-display.good {
        color: #34d399;
      }
      .score-display.warning {
        color: #fbbf24;
      }
      .score-display.critical {
        color: #f87171;
      }

      .score-label {
        font-size: 0.875rem;
        color: #64748b;
        margin-top: 0.25rem;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: #f8fafc;
      }

      .stat-label {
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 0.25rem;
      }

      .distribution-chart {
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        padding: 1.5rem;
      }

      .distribution-chart h3 {
        font-size: 1rem;
        font-weight: 600;
        color: #e2e8f0;
        margin: 0 0 1.5rem;
      }

      .chart-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .distribution-bars {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-height: 300px;
        overflow-y: auto;
      }

      .dist-item {
        display: grid;
        grid-template-columns: 120px 1fr 60px;
        align-items: center;
        gap: 1rem;
      }

      .personnel-name {
        font-size: 0.8125rem;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bar-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .bar-center {
        position: absolute;
        left: 50%;
        width: 1px;
        height: 100%;
        background: rgba(255, 255, 255, 0.2);
      }

      .bar-track {
        width: 100%;
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }

      .bar-fill {
        height: 100%;
        background: #8b5cf6;
        border-radius: 4px;
      }

      .bar-fill.negative {
        background: #f87171;
        margin-left: auto;
      }

      .deviation {
        font-size: 0.75rem;
        font-weight: 600;
        text-align: right;
      }

      .deviation.good {
        color: #34d399;
      }
      .deviation.warning {
        color: #fbbf24;
      }
      .deviation.critical {
        color: #f87171;
      }

      .chart-legend {
        display: flex;
        justify-content: center;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: #64748b;
      }

      .dot {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
      }

      .personnel-table {
        flex: 1;
        min-height: 0;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 12px 16px;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      th {
        background: rgba(15, 23, 42, 0.5);
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
      }

      td {
        font-size: 0.875rem;
        color: #e2e8f0;
      }

      .personnel-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .avatar {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .unit-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 500;
      }

      .unit-badge.mr {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .unit-badge.bt {
        background: rgba(20, 184, 166, 0.15);
        color: #2dd4bf;
      }
      .unit-badge.rontgen {
        background: rgba(249, 115, 22, 0.15);
        color: #fb923c;
      }
      .unit-badge.nukleer {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .unit-badge.onkoloji {
        background: rgba(236, 72, 153, 0.15);
        color: #f472b6;
      }

      .fatigue-cell {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .fatigue-bar {
        width: 60px;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }

      .fatigue-fill {
        height: 100%;
        background: #10b981;
        border-radius: 3px;
      }

      .fatigue-fill.high {
        background: #f59e0b;
      }

      .score-badge,
      .deviation-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .score-badge.good,
      .deviation-badge.good {
        background: rgba(52, 211, 153, 0.15);
        color: #34d399;
      }
      .score-badge.warning,
      .deviation-badge.warning {
        background: rgba(251, 191, 36, 0.15);
        color: #fbbf24;
      }
      .score-badge.critical,
      .deviation-badge.critical {
        background: rgba(248, 113, 113, 0.15);
        color: #f87171;
      }
    `,
  ],
})
export class FairnessAnalysisComponent {
  private api = inject(ApiService);

  selectedUnit = 'all';
  Math = Math;

  personnel = signal<PersonnelFairness[]>([
    {
      id: '1',
      name: 'Ahmet Yılmaz',
      unit: 'mr',
      nightShifts: 12,
      weekendShifts: 8,
      totalHours: 1680,
      avgFatigue: 45,
      fairnessScore: 92,
      deviation: 5,
    },
    {
      id: '2',
      name: 'Ayşe Demir',
      unit: 'mr',
      nightShifts: 8,
      weekendShifts: 6,
      totalHours: 1580,
      avgFatigue: 38,
      fairnessScore: 95,
      deviation: -2,
    },
    {
      id: '3',
      name: 'Mehmet Kaya',
      unit: 'bt',
      nightShifts: 15,
      weekendShifts: 10,
      totalHours: 1820,
      avgFatigue: 72,
      fairnessScore: 68,
      deviation: 18,
    },
    {
      id: '4',
      name: 'Fatma Şahin',
      unit: 'bt',
      nightShifts: 10,
      weekendShifts: 7,
      totalHours: 1620,
      avgFatigue: 52,
      fairnessScore: 88,
      deviation: 0,
    },
    {
      id: '5',
      name: 'Ali Öztürk',
      unit: 'rontgen',
      nightShifts: 6,
      weekendShifts: 4,
      totalHours: 1480,
      avgFatigue: 35,
      fairnessScore: 96,
      deviation: -8,
    },
    {
      id: '6',
      name: 'Zeynep Arslan',
      unit: 'nukleer',
      nightShifts: 9,
      weekendShifts: 5,
      totalHours: 1550,
      avgFatigue: 48,
      fairnessScore: 90,
      deviation: 2,
    },
    {
      id: '7',
      name: 'Burak Kaya',
      unit: 'onkoloji',
      nightShifts: 11,
      weekendShifts: 8,
      totalHours: 1700,
      avgFatigue: 65,
      fairnessScore: 78,
      deviation: 12,
    },
    {
      id: '8',
      name: 'Elif Yıldırım',
      unit: 'rontgen',
      nightShifts: 7,
      weekendShifts: 9,
      totalHours: 1600,
      avgFatigue: 42,
      fairnessScore: 91,
      deviation: -1,
    },
  ]);

  filteredPersonnel = computed(() => {
    const unit = this.selectedUnit;
    if (unit === 'all') return this.personnel();
    return this.personnel().filter((p) => p.unit === unit);
  });

  overallScore = computed(() =>
    Math.round(
      this.personnel().reduce((sum, p) => sum + p.fairnessScore, 0) / this.personnel().length,
    ),
  );
  avgNightShifts = computed(() =>
    Math.round(
      this.personnel().reduce((sum, p) => sum + p.nightShifts, 0) / this.personnel().length,
    ),
  );
  avgWeekendShifts = computed(() =>
    Math.round(
      this.personnel().reduce((sum, p) => sum + p.weekendShifts, 0) / this.personnel().length,
    ),
  );

  distributionData = computed(() => {
    return this.personnel()
      .map((p) => ({
        name: p.name,
        value: p.deviation,
        deviation: p.deviation,
      }))
      .sort((a, b) => b.deviation - a.deviation);
  });

  getScoreClass(score: number): string {
    if (score >= 85) return 'good';
    if (score >= 70) return 'warning';
    return 'critical';
  }

  getScoreLabel(score: number): string {
    if (score >= 85) return 'Mükemmel - Dağılım dengeli';
    if (score >= 70) return 'İyi - Küçük düzeltmeler gerekebilir';
    return 'Düzeltme gerekli - Adaletsiz dağılım';
  }

  getDeviationClass(dev: number): string {
    if (Math.abs(dev) <= 10) return 'good';
    if (Math.abs(dev) <= 20) return 'warning';
    return 'critical';
  }

  getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'RÖ',
      nukleer: 'NT',
      onkoloji: 'RÖO',
    };
    return labels[unit] || unit;
  }

  getAvatarColor(score: number): string {
    if (score >= 85) return 'linear-gradient(135deg, #10b981, #059669)';
    if (score >= 70) return 'linear-gradient(135deg, #f59e0b, #d97706)';
    return 'linear-gradient(135deg, #ef4444, #dc2626)';
  }
}
