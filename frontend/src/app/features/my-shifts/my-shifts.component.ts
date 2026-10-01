import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ScheduleService, MyShift, MySummaryResponse } from '../../services/schedule.service';
import { getShiftTypeLabel } from '../../domain/enums';

@Component({
  selector: 'app-my-shifts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page my-shifts-page">
      @if (pulling()) {
        <div class="pull-indicator" [style.height.px]="pullDistance()">
          <div class="pull-spinner" [class.spinning]="pullDistance() > 60"></div>
        </div>
      }
      @if (loading()) {
        <div class="kpi-grid skeleton-grid">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="kpi-card">
              <div class="kpi-skeleton">
                <div
                  class="skeleton-shimmer"
                  style="width:36px;height:36px;border-radius:var(--radius-md)"
                ></div>
                <div style="flex:1">
                  <div
                    class="skeleton-shimmer"
                    style="width:80px;height:22px;margin-bottom:6px"
                  ></div>
                  <div class="skeleton-shimmer" style="width:60px;height:11px"></div>
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="kpi-grid">
          <div class="kpi-card" style="--kpi-color: #3b82f6">
            <div class="kpi-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
            </div>
            <div class="kpi-meta">
              <span class="kpi-value">{{ summary().totalShifts }}</span
              ><span class="kpi-label">Toplam Vardiya</span>
            </div>
            <div class="kpi-glow"></div>
          </div>
          <div class="kpi-card" style="--kpi-color: #22c55e">
            <div class="kpi-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div class="kpi-meta">
              <span class="kpi-value"
                >{{ summary().totalHours }}<span class="kpi-unit">sa</span></span
              ><span class="kpi-label">Toplam Saat</span>
            </div>
            <div class="kpi-glow"></div>
          </div>
          <div class="kpi-card" style="--kpi-color: #8b5cf6">
            <div class="kpi-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
            <div class="kpi-meta">
              <span class="kpi-value">{{ summary().nightShifts }}</span
              ><span class="kpi-label">Gece Vardiyası</span>
            </div>
            <div class="kpi-glow"></div>
          </div>
          <div
            class="kpi-card"
            [style.--kpi-color]="summary().overtimeHours > 5 ? '#ef4444' : '#f59e0b'"
          >
            <div class="kpi-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div class="kpi-meta">
              <span class="kpi-value"
                >{{ summary().overtimeHours }}<span class="kpi-unit">sa</span></span
              ><span class="kpi-label">Fazla Mesai</span>
            </div>
            <div class="kpi-glow"></div>
          </div>
        </div>
      }

      @if (error()) {
        <div class="error-banner">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" /></svg
          ><span>{{ error() }}</span>
        </div>
      }

      @if (!loading() && !error()) {
        <div class="dashboard-grid">
          <!-- Today's Shift -->
          <div class="card today-card">
            <div class="card-header">
              <h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" /></svg
                >Bugünkü Vardiya
              </h3>
            </div>
            <div class="card-body">
              @if (todayShift(); as ts) {
                <div class="today-shift" [class.night-shift]="ts.shiftType === 'night'">
                  <div class="today-time">{{ getShiftTypeLabel(ts.shiftType) }}</div>
                  <div class="today-device">{{ ts.deviceName || ts.deviceCode }}</div>
                  <div class="today-hours">{{ ts.startTime }} - {{ ts.endTime }}</div>
                  <span
                    class="badge"
                    [class.badge-success]="ts.isConfirmed"
                    [class.badge-neutral]="!ts.isConfirmed"
                    >{{ ts.isConfirmed ? 'Onaylı' : 'Planlandı' }}</span
                  >
                </div>
              } @else {
                <div class="empty-card-sm">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Bugün vardiya yok</span>
                </div>
              }
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="card actions-card">
            <div class="card-header">
              <h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" /></svg
                >Hızlı İşlemler
              </h3>
            </div>
            <div class="card-body">
              <div class="quick-actions">
                <a routerLink="/app/leave-management" class="quick-btn">
                  <svg
                    width="18"
                    height="18"
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
                  <span>İzin Talebi</span>
                </a>
                <a routerLink="/app/swap-requests" class="quick-btn">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  <span>Vardiya Değişim</span>
                </a>
                <a routerLink="/app/my-shifts" class="quick-btn">
                  <svg
                    width="18"
                    height="18"
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
                  <span>Aylık Takvim</span>
                </a>
              </div>
            </div>
          </div>

          <!-- This Week -->
          <div class="card week-card wide-card">
            <div class="card-header">
              <h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" /></svg
                >Bu Hafta
              </h3>
              <span class="badge badge-neutral">{{ weekShifts().length }} vardiya</span>
            </div>
            <div class="card-body">
              @if (weekShifts().length === 0) {
                <div class="empty-card-sm"><span>Bu hafta vardiya bulunmuyor</span></div>
              } @else {
                <div class="week-list">
                  @for (s of weekShifts(); track s.id) {
                    <div class="week-row" [class.night]="s.shiftType === 'night'">
                      <span class="week-day">{{ getDayName(s.date) }}</span>
                      <span class="week-badge" [class.night-badge]="s.shiftType === 'night'">{{
                        getShiftTypeLabel(s.shiftType)
                      }}</span>
                      <span class="week-device">{{ s.deviceName || s.deviceCode }}</span>
                      <span class="week-time">{{ s.startTime }}-{{ s.endTime }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Upcoming -->
          <div class="card upcoming-card wide-card">
            <div class="card-header">
              <h3>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg
                >Yaklaşan Vardiyalar
              </h3>
              <span class="badge badge-neutral">{{ upcomingShifts().length }} vardiya</span>
            </div>
            <div class="card-body">
              @if (upcomingShifts().length === 0) {
                <div class="empty-card-sm"><span>Yaklaşan vardiya bulunmuyor</span></div>
              } @else {
                <div class="upcoming-list">
                  @for (s of upcomingShifts(); track s.id) {
                    <div class="upcoming-row" [class.night]="s.shiftType === 'night'">
                      <span class="upcoming-date">{{ formatDate(s.date) }}</span>
                      <span class="upcoming-badge" [class.night-badge]="s.shiftType === 'night'">{{
                        getShiftTypeLabel(s.shiftType)
                      }}</span>
                      <span class="upcoming-device">{{ s.deviceName || s.deviceCode }}</span>
                      <span class="upcoming-time">{{ s.startTime }}-{{ s.endTime }}</span>
                      <span class="upcoming-status" [class.confirmed]="s.isConfirmed">{{
                        s.isConfirmed ? 'Onaylı' : 'Plan'
                      }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .my-shifts-page {
        padding: 16px 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        margin-top: 12px;
        margin-bottom: 12px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }
      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
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
        border-color: var(--border-default);
      }
      .btn-sm {
        padding: 6px 12px;
        font-size: 11px;
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .skeleton-grid .kpi-card {
        min-height: 72px;
      }
      .kpi-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .kpi-skeleton {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
      }
      .kpi-glow {
        position: absolute;
        top: -50%;
        right: -50%;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle, var(--kpi-color) 0%, transparent 70%);
        opacity: 0.04;
        pointer-events: none;
      }
      .kpi-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.04);
        color: var(--kpi-color);
        flex-shrink: 0;
      }
      .kpi-meta {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .kpi-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.3px;
        line-height: 1;
      }
      .kpi-unit {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-muted);
        margin-left: 2px;
      }
      .kpi-label {
        font-size: 10px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-top: 2px;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .card {
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .card-header h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .card-header h3 svg {
        width: 16px;
        height: 16px;
        stroke: var(--text-muted);
        flex-shrink: 0;
      }
      .card-body {
        padding: 12px 16px;
      }
      .wide-card {
        grid-column: 1 / -1;
      }
      .empty-card-sm {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px;
        color: var(--text-muted);
        font-size: 12px;
      }
      .empty-card-sm svg {
        opacity: 0.4;
      }

      .today-shift {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 4px 0;
      }
      .today-shift.night-shift {
        border-left: 3px solid #8b5cf6;
        padding-left: 12px;
      }
      .today-time {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .today-device {
        font-size: 14px;
        color: var(--text-secondary);
      }
      .today-hours {
        font-size: 12px;
        color: var(--text-muted);
      }

      .quick-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .quick-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-secondary);
        text-decoration: none;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        flex: 1;
        min-width: 120px;
      }
      .quick-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-default);
      }
      .quick-btn svg {
        flex-shrink: 0;
      }

      .week-list,
      .upcoming-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .week-row,
      .upcoming-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-sm);
        transition: background var(--transition-fast);
        font-size: 12px;
      }
      .week-row:hover,
      .upcoming-row:hover {
        background: var(--bg-hover);
      }
      .week-row.night,
      .upcoming-row.night {
        border-left: 2px solid #8b5cf6;
      }
      .week-day,
      .upcoming-date {
        min-width: 80px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .week-badge,
      .upcoming-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
        min-width: 48px;
        text-align: center;
      }
      .week-badge.night-badge,
      .upcoming-badge.night-badge {
        background: rgba(139, 92, 246, 0.15);
        color: #c084fc;
      }
      .week-device,
      .upcoming-device {
        flex: 1;
        color: var(--text-secondary);
      }
      .week-time,
      .upcoming-time {
        color: var(--text-muted);
      }
      .upcoming-status {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .upcoming-status.confirmed {
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
      }

      .pull-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: height 0.1s;
      }
      .pull-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--border-subtle);
        border-top-color: var(--accent-mr);
        border-radius: 50%;
      }
      .pull-spinner.spinning {
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 768px) {
        .kpi-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .dashboard-grid {
          grid-template-columns: 1fr;
        }
        .quick-actions {
          flex-direction: column;
        }
        .quick-btn {
          min-width: auto;
        }
      }
    `,
  ],
})
export class MyShiftsComponent implements OnInit {
  private scheduleService = inject(ScheduleService);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected summary = signal<MySummaryResponse['summary']>({
    totalShifts: 0,
    totalHours: 0,
    nightShifts: 0,
    weekendShifts: 0,
    overtimeHours: 0,
  });
  protected todayShift = signal<MyShift | null>(null);
  protected weekShifts = signal<MyShift[]>([]);
  protected upcomingShifts = signal<MyShift[]>([]);

  private dayLabels = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  protected pulling = signal(false);
  protected pullDistance = signal(0);
  private touchStartY = 0;
  private touchMoveY = 0;

  ngOnInit() {
    this.refresh();
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(e: TouchEvent) {
    if (window.scrollY === 0) {
      this.touchStartY = e.touches[0].clientY;
      this.pulling.set(true);
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(e: TouchEvent) {
    if (!this.pulling()) return;
    this.touchMoveY = e.touches[0].clientY;
    const dist = Math.max(0, this.touchMoveY - this.touchStartY);
    this.pullDistance.set(Math.min(dist, 80));
  }

  @HostListener('touchend')
  onTouchEnd() {
    if (this.pulling() && this.pullDistance() > 60) {
      this.refresh();
    }
    this.pulling.set(false);
    this.pullDistance.set(0);
  }

  protected refresh() {
    this.loading.set(true);
    this.error.set(null);
    this.scheduleService.getMySummary().subscribe({
      next: (res: MySummaryResponse) => {
        this.todayShift.set(res.today);
        this.weekShifts.set(res.week || []);
        this.upcomingShifts.set(res.upcoming || []);
        this.summary.set(
          res.summary || {
            totalShifts: 0,
            totalHours: 0,
            nightShifts: 0,
            weekendShifts: 0,
            overtimeHours: 0,
          },
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Veriler yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  protected getShiftTypeLabel(type: string): string {
    return getShiftTypeLabel(type as any);
  }

  protected getDayName(date: string): string {
    const d = new Date(date);
    return this.dayLabels[d.getDay()];
  }

  protected formatDate(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }
}
