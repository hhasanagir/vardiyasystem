import {
  Component,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { CardComponent } from '../../ui/card/card.component';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { fadeAnimation } from '../../core/animations/route-transitions';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

interface DashboardKpi {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
  color: string;
  route?: string;
  hint?: string;
}

interface DashboardAlert {
  id: string;
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  description: string;
  time: string;
  action?: { label: string; route: string };
}

interface DashboardUnit {
  id: string;
  label: string;
  color: string;
  icon: string;
  activeDevices: number;
  staffCount: number;
  occupancy: number;
  missingAssignments: number;
  route: string;
}

const SHIFT_TYPE_LABELS: Record<string, string> = {
  day: 'Gündüz Vardiyası',
  evening: 'Akşam Vardiyası',
  night: 'Gece Vardiyası',
  morning: 'Sabah Vardiyası',
  off: 'İzin',
  leave: 'Yıllık İzin',
  sick: 'Rapor',
  training: 'Eğitim',
  backup: 'Yedek',
};

const AUTO_REFRESH_MS = 60000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    CardComponent,
    SkeletonComponent,
    BadgeComponent,
    EmptyStateComponent,
    SafeHtmlPipe,
  ],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1 class="dashboard-greeting">{{ greeting() }}, {{ user()?.name || 'Kullanıcı' }}</h1>
          <p class="dashboard-date">{{ today() }}</p>
        </div>
        <div class="dashboard-header-actions">
          @if (lastUpdated()) {
            <span class="last-updated" [class.last-updated-error]="errorMessage()">
              @if (errorMessage()) {
                Veriler güncellenemedi · Son başarılı veri: {{ lastUpdated() }}
              } @else {
                Son güncelleme: {{ lastUpdated() }}
              }
            </span>
          }
          <button class="dh-btn" (click)="refresh()" [disabled]="isLoading()" aria-label="Yenile">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="16"
              height="16"
              [class.spinning]="isLoading()"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
            {{ isLoading() ? 'Yükleniyor…' : 'Yenile' }}
          </button>
        </div>
      </div>

      @if (errorMessage() && !dashboardData()) {
        <div class="error-state">
          <div class="error-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="28"
              height="28"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 class="error-title">Veri alınamadı</h3>
          <p class="error-desc">{{ errorMessage() }}</p>
          <button class="retry-btn" (click)="refresh()">Tekrar dene</button>
        </div>
      } @else {
        <!-- KPI Grid -->
        <div class="kpi-grid" role="region" aria-label="Temel metrikler">
          @for (kpi of kpis(); track kpi.id) {
            <div
              class="kpi-card"
              [class.clickable]="!!kpi.route"
              (click)="kpi.route && navigate(kpi.route)"
              [@fadeAnimation]
            >
              <div class="kpi-card-header">
                <span
                  class="kpi-icon"
                  [style.background]="kpi.color + '15'"
                  [style.color]="kpi.color"
                  [innerHTML]="kpi.icon | safeHtml"
                ></span>
                @if (kpi.change !== 0) {
                  <span
                    class="kpi-change"
                    [class.kpi-change-up]="kpi.trend === 'up'"
                    [class.kpi-change-down]="kpi.trend === 'down'"
                  >
                    {{ kpi.change > 0 ? '+' : '' }}{{ kpi.change }}%
                  </span>
                }
              </div>
              <div class="kpi-value">
                {{ kpi.value }}<span class="kpi-unit">{{ kpi.unit }}</span>
              </div>
              <div class="kpi-label">{{ kpi.label }}</div>
              @if (kpi.hint) {
                <div class="kpi-hint">{{ kpi.hint }}</div>
              }
            </div>
          } @empty {
            @for (s of [1, 2, 3, 4, 5, 6, 7, 8]; track s) {
              <app-skeleton variant="kpi" style="min-height: 8rem;" />
            }
          }
        </div>

        <!-- Main grid: Alerts + Quick actions + Upcoming -->
        <div class="dashboard-grid-2col">
          <!-- Alerts -->
          <app-card header="Aktif Uyarılar" subtitle="Dikkat gerektiren durumlar">
            <div class="alerts-list" role="list">
              @for (alert of alerts(); track alert.id) {
                <div class="alert-item" [class]="'alert-' + alert.type" role="listitem">
                  <div class="alert-icon">
                    @if (alert.type === 'danger') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        width="18"
                        height="18"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    } @else if (alert.type === 'warning') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        width="18"
                        height="18"
                      >
                        <path
                          d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                        />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    } @else {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        width="18"
                        height="18"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    }
                  </div>
                  <div class="alert-content">
                    <div class="alert-title">{{ alert.title }}</div>
                    <div class="alert-desc">{{ alert.description }}</div>
                  </div>
                  <div class="alert-right">
                    <span class="alert-time">{{ alert.time }}</span>
                    @if (alert.action) {
                      <button class="alert-action" (click)="navigate(alert.action!.route)">
                        {{ alert.action.label }}
                      </button>
                    }
                  </div>
                </div>
              } @empty {
                <app-empty-state
                  title="Uyarı bulunmuyor"
                  description="Tüm sistem normal çalışıyor"
                />
              }
            </div>
          </app-card>

          <!-- Quick Access -->
          <app-card header="Hızlı Erişim">
            <div class="quick-grid">
              @for (action of quickActions(); track action.id) {
                <button class="quick-item" (click)="navigate(action.route)">
                  <span
                    class="quick-icon"
                    [style.background]="action.color + '15'"
                    [style.color]="action.color"
                    [innerHTML]="action.icon | safeHtml"
                  ></span>
                  <span class="quick-label">{{ action.label }}</span>
                </button>
              }
            </div>
          </app-card>
        </div>

        <!-- Upcoming shifts -->
        <div class="dashboard-section">
          <app-card header="Yaklaşan Vardiyalar">
            <div class="upcoming-list" role="list">
              @for (shift of upcomingShifts(); track shift.id) {
                <div class="upcoming-item" role="listitem">
                  <div class="upcoming-date">
                    <span class="upcoming-day">{{ shift.day }}</span>
                    <span class="upcoming-month">{{ shift.month }}</span>
                  </div>
                  <div class="upcoming-info">
                    <span class="upcoming-role">{{ shift.role }}</span>
                    <span class="upcoming-time"
                      >{{ shift.shiftLabel }} · {{ shift.start }} - {{ shift.end }}</span
                    >
                  </div>
                  <app-badge [severity]="shift.status" [dot]="true">{{
                    shift.statusLabel
                  }}</app-badge>
                </div>
              } @empty {
                <app-empty-state
                  title="Yaklaşan vardiya yok"
                  description="İlerleyen günlerde planlanmış vardiya bulunmuyor"
                />
              }
            </div>
          </app-card>
        </div>

        <!-- Unit summary -->
        <div class="dashboard-grid-3col">
          @for (unit of unitSummary(); track unit.id) {
            <app-card [clickable]="true" (click)="navigate(unit.route)">
              <div class="unit-summary">
                <div class="unit-summary-top">
                  <div
                    class="unit-summary-icon"
                    [style.background]="unit.color + '15'"
                    [style.color]="unit.color"
                    [innerHTML]="unit.icon | safeHtml"
                  ></div>
                  <span class="unit-summary-name">{{ unit.label }}</span>
                  @if (unit.missingAssignments > 0) {
                    <span class="unit-missing">{{ unit.missingAssignments }} eksik</span>
                  }
                </div>
                <div class="unit-summary-stats">
                  <div class="us-stat">
                    <span class="us-value">{{ unit.activeDevices }}</span>
                    <span class="us-label">Cihaz</span>
                  </div>
                  <div class="us-stat">
                    <span class="us-value">{{ unit.staffCount }}</span>
                    <span class="us-label">Personel</span>
                  </div>
                  <div class="us-stat">
                    <span class="us-value">{{ unit.occupancy }}%</span>
                    <span class="us-label">Doluluk</span>
                  </div>
                </div>
              </div>
            </app-card>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .dashboard {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .dashboard-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }
      .dashboard-greeting {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }
      .dashboard-date {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin: 0.25rem 0 0;
      }
      .dashboard-header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
      }
      .last-updated {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .last-updated-error {
        color: var(--status-danger);
      }
      .dh-btn {
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
      .dh-btn:hover {
        background: var(--bg-hover);
      }
      .dh-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .spinning {
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 3rem 1rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-primary);
        text-align: center;
      }
      .error-icon {
        color: var(--status-danger);
      }
      .error-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }
      .error-desc {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin: 0;
      }
      .retry-btn {
        padding: 0.5rem 1.25rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-hover);
        color: var(--text-primary);
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
      }
      .retry-btn:hover {
        background: var(--bg-secondary);
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
        gap: 1rem;
      }
      .kpi-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        transition:
          border-color 0.15s,
          transform 0.15s;
      }
      .kpi-card.clickable {
        cursor: pointer;
      }
      .kpi-card.clickable:hover {
        border-color: var(--primary);
        transform: translateY(-1px);
      }
      .kpi-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
      }
      .kpi-icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .kpi-icon svg {
        width: 1.25rem;
        height: 1.25rem;
      }
      .kpi-change {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
      }
      .kpi-change-up {
        background: color-mix(in srgb, var(--status-success) 15%, transparent);
        color: var(--status-success);
      }
      .kpi-change-down {
        background: color-mix(in srgb, var(--status-danger) 15%, transparent);
        color: var(--status-danger);
      }
      .kpi-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
      }
      .kpi-unit {
        font-size: 0.875rem;
        font-weight: 400;
        color: var(--text-muted);
        margin-left: 0.25rem;
      }
      .kpi-label {
        font-size: 0.8rem;
        color: var(--text-muted);
      }
      .kpi-hint {
        font-size: 0.7rem;
        color: var(--text-muted);
        opacity: 0.8;
        line-height: 1.3;
      }

      .dashboard-grid-2col {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: 1.5rem;
      }
      @media (max-width: 1024px) {
        .dashboard-grid-2col {
          grid-template-columns: 1fr;
        }
      }
      .dashboard-grid-3col {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 1rem;
      }
      @media (max-width: 640px) {
        .dashboard-grid-3col {
          grid-template-columns: 1fr;
        }
      }

      .alerts-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .alert-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }
      .alert-danger {
        border-left: 3px solid var(--status-danger);
      }
      .alert-warning {
        border-left: 3px solid var(--status-warning);
      }
      .alert-info {
        border-left: 3px solid var(--status-info);
      }
      .alert-success {
        border-left: 3px solid var(--status-success);
      }
      .alert-icon {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .alert-danger .alert-icon {
        color: var(--status-danger);
      }
      .alert-warning .alert-icon {
        color: var(--status-warning);
      }
      .alert-content {
        flex: 1;
        min-width: 0;
      }
      .alert-title {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-primary);
      }
      .alert-desc {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .alert-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.25rem;
        flex-shrink: 0;
      }
      .alert-time {
        font-size: 0.7rem;
        color: var(--text-muted);
      }
      .alert-action {
        font-size: 0.75rem;
        color: var(--primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-weight: 500;
      }

      .quick-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }
      .quick-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        cursor: pointer;
        transition: all 0.15s;
      }
      .quick-item:hover {
        background: var(--bg-hover);
        border-color: var(--border-default);
      }
      .quick-icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .quick-icon svg {
        width: 1.25rem;
        height: 1.25rem;
      }
      .quick-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--text-primary);
        text-align: center;
      }

      .upcoming-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .upcoming-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem;
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }
      .upcoming-date {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 2.5rem;
      }
      .upcoming-day {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
      }
      .upcoming-month {
        font-size: 0.65rem;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .upcoming-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .upcoming-role {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-primary);
      }
      .upcoming-time {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .unit-summary {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .unit-summary-top {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .unit-summary-icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .unit-summary-icon svg {
        width: 1.25rem;
        height: 1.25rem;
      }
      .unit-summary-name {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        flex: 1;
      }
      .unit-missing {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--status-warning);
        background: color-mix(in srgb, var(--status-warning) 15%, transparent);
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
      }
      .unit-summary-stats {
        display: flex;
        gap: 1rem;
      }
      .us-stat {
        flex: 1;
        text-align: center;
      }
      .us-value {
        display: block;
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      .us-label {
        font-size: 0.7rem;
        color: var(--text-muted);
      }

      .dashboard-section {
        margin-top: 0.5rem;
      }
    `,
  ],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private dashboardService = inject(DashboardService);
  private autoRefresh?: ReturnType<typeof setInterval>;

  readonly user = computed(() => this.auth.user());
  readonly today = computed(() =>
    new Date().toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın';
    if (h < 18) return 'İyi günler';
    return 'İyi akşamlar';
  });

  readonly dashboardData = computed(() => this.dashboardService.dashboard());
  readonly isLoading = computed(() => this.dashboardService.isLoading());
  readonly errorMessage = computed(() => this.dashboardService.error());
  readonly lastUpdated = computed(() => {
    const iso = this.dashboardService.lastUpdated();
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });

  readonly kpis = computed<DashboardKpi[]>(() => {
    const k = this.dashboardData()?.kpis;
    if (!k) return [];
    return [
      {
        id: 'active-devices',
        label: 'Aktif Cihaz',
        value: k.activeDevices,
        unit: '',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
        color: '#3b82f6',
        route: '/app/device-incidents',
      },
      {
        id: 'personnel',
        label: 'Aktif Personel',
        value: k.totalPersonnel,
        unit: 'kişi',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        color: '#14b8a6',
        route: '/app/employees',
      },
      {
        id: 'on-duty',
        label: 'Görev Başında',
        value: k.onDutyPersonnel,
        unit: 'kişi',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        color: '#8b5cf6',
        route: '/app/live-tracking',
        hint:
          k.onDutyPersonnel === 0
            ? 'Şu anda aktif vardiya bulunmuyor'
            : `Bugün ${k.todayAssignments} atama planlandı`,
      },
      {
        id: 'pending-shifts',
        label: 'Onay Bekleyen Vardiya',
        value: k.pendingShifts,
        unit: '',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>',
        color: '#f59e0b',
        route: '/app/approval-center',
        hint: k.pendingShifts === 0 ? 'Onay bekleyen vardiya yok' : undefined,
      },
      {
        id: 'incidents',
        label: 'Aktif Arıza',
        value: k.activeIncidents,
        unit: '',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        color: '#ef4444',
        route: '/app/device-incidents',
        hint: k.activeIncidents === 0 ? 'Açık arıza kaydı yok' : undefined,
      },
      {
        id: 'training-expiry',
        label: 'Sertifika Uyarısı',
        value: k.trainingExpiries,
        unit: 'kişi',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
        color: '#f97316',
        route: '/app/employees',
        hint:
          k.trainingExpiries === 0
            ? 'Sertifika uyarısı yok'
            : `${k.trainingExpired} süresi geçti · ${k.trainingDue30} 30 gün içinde`,
      },
      {
        id: 'missing-shifts',
        label: 'Boş Vardiya',
        value: k.totalMissing,
        unit: '',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        color: '#eab308',
        route: '/app/approval-center',
        hint: k.totalMissing === 0 ? 'Boş vardiya yok' : 'Bugün için atanmamış slotlar',
      },
      {
        id: 'swaps',
        label: 'Bekleyen Takas',
        value: k.pendingSwaps,
        unit: '',
        change: 0,
        trend: 'neutral',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
        color: '#06b6d4',
        route: '/app/swap-requests',
        hint: k.pendingSwaps === 0 ? 'Bekleyen takas yok' : undefined,
      },
    ];
  });

  readonly alerts = computed<DashboardAlert[]>(() => {
    const data = this.dashboardData();
    if (!data) return [];
    return data.alerts.map((a, i) => ({
      id: `alert-${i}`,
      type: a.type,
      title: a.title,
      description: a.description,
      time: a.time,
      action: a.action,
    }));
  });

  readonly upcomingShifts = computed(() => {
    const data = this.dashboardData();
    if (!data || !data.upcomingShifts.length) return [];
    return data.upcomingShifts.map((s) => ({
      id: s.id,
      day: s.day,
      month: new Date(s.date + 'T00:00:00')
        .toLocaleDateString('tr-TR', { month: 'short' })
        .replace('.', ''),
      role: `${s.personnelName}${s.unitName ? ` · ${s.unitName}` : ''}`,
      start: s.startTime,
      end: s.endTime,
      status: s.isConfirmed ? ('success' as const) : ('warning' as const),
      statusLabel: s.isConfirmed ? 'Onaylandı' : 'Onay Bekliyor',
      shiftLabel: SHIFT_TYPE_LABELS[s.shiftType] || s.shiftType,
    }));
  });

  readonly quickActions = computed(() => [
    {
      id: 'report',
      label: 'Arıza Bildir',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      color: '#ef4444',
      route: '/app/device-incidents',
    },
    {
      id: 'swap',
      label: 'Vardiya Takas',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
      color: '#8b5cf6',
      route: '/app/swap-requests',
    },
    {
      id: 'leave',
      label: 'İzin Talebi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      color: '#14b8a6',
      route: '/app/leave-management',
    },
    {
      id: 'handover',
      label: 'Devir Teslim',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      color: '#f97316',
      route: '/app/handover-notes',
    },
    {
      id: 'employees',
      label: 'Personel',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      color: '#3b82f6',
      route: '/app/employees',
    },
    {
      id: 'reports',
      label: 'Raporlar',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      color: '#06b6d4',
      route: '/app/reports',
    },
  ]);

  readonly unitSummary = computed<DashboardUnit[]>(() => {
    const data = this.dashboardData();
    if (!data) return [];
    const config: Record<string, { label: string; color: string; icon: string; route: string }> = {
      mr: {
        label: 'MR',
        color: '#3b82f6',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        route: '/app/mr-plan',
      },
      bt: {
        label: 'BT',
        color: '#14b8a6',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>',
        route: '/app/bt-plan',
      },
      rontgen: {
        label: 'Röntgen',
        color: '#f97316',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/></svg>',
        route: '/app/rontgen-plan',
      },
      nukleer: {
        label: 'Nükleer Tıp',
        color: '#22c55e',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/></svg>',
        route: '/app/nukleer-tip-plan',
      },
      onkoloji: {
        label: 'Radyasyon Onkolojisi',
        color: '#ec4899',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>',
        route: '/app/onkoloji-plan',
      },
      supervizor: {
        label: 'Süpervizör',
        color: '#64748b',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
        route: '/app/supervizor-plan',
      },
    };
    return data.unitSummary
      .filter((u) => config[u.type])
      .map((u) => ({
        id: u.unitId,
        label: config[u.type].label,
        color: config[u.type].color,
        icon: config[u.type].icon,
        activeDevices: u.activeDevices,
        staffCount: u.staffCount,
        occupancy: u.occupancy,
        missingAssignments: u.missingAssignments,
        route: config[u.type].route,
      }));
  });

  ngOnInit(): void {
    this.refresh();
    this.autoRefresh = setInterval(() => {
      if (!this.isLoading()) this.refresh();
    }, AUTO_REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.autoRefresh) clearInterval(this.autoRefresh);
  }

  refresh(): void {
    this.dashboardService.loadDashboard().subscribe();
  }

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }
}
