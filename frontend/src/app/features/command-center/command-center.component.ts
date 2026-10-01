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
import { ApiService } from '../../core/api/api.service';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

interface SnapshotData {
  timestamp: string;
  activeStaff: { count: number; total: number };
  devices: { online: number; offline: number; total: number };
  openIncidents: { count: number };
  criticalAlerts: {
    count: number;
    items: Array<{ id: string; issueType: string; description: string; reportedAt: string }>;
  };
  missingStaffing: { count: number };
  pendingSwapRequests: { count: number };
  attendance: { clockedIn: number; clockedOut: number; notClocked: number; total: number };
  coveragePercent: number;
}

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cmd-base" [class.fullscreen]="isFullscreen()">
      <header class="cmd-header">
        <div class="header-left">
          <h1>Radyoloji Komuta Merkezi</h1>
          <span class="live-badge">
            <span class="live-dot"></span>
            <span class="live-text">CANLI</span>
          </span>
        </div>
        <div class="header-center">
          <span class="header-time">{{ currentTime() }}</span>
          <span class="header-date">{{ currentDate() }}</span>
          <span class="header-org">{{ orgName() }}</span>
        </div>
        <div class="header-right">
          @if (lastUpdate(); as lu) {
            <span class="update-time">Son güncelleme: {{ lu }}</span>
          }
          <button class="header-btn" (click)="toggleFullscreen()" title="Tam Ekran">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button class="header-btn" (click)="refresh()" title="Yenile">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </header>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (loading() && !data()) {
        <div class="loading-screen">
          <div class="spinner"></div>
          <span>Komuta merkezi başlatılıyor...</span>
        </div>
      }

      @if (data(); as d) {
        <main class="cmd-grid">
          <!-- 1 — Active Staff -->
          <div class="widget staff-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F465;</span
              ><span class="widget-label">Aktif Personel</span>
            </div>
            <div class="widget-body">
              <span class="widget-value">{{ d.activeStaff.count }}</span>
              <span class="widget-sub">/ {{ d.activeStaff.total }} toplam</span>
            </div>
            <div class="widget-bar">
              <div class="bar-fill" [style.width.%]="staffPercent()"></div>
            </div>
          </div>

          <!-- 2 — Devices -->
          <div class="widget devices-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F4F1;</span><span class="widget-label">Cihazlar</span>
            </div>
            <div class="widget-body split">
              <div class="stat">
                <span class="stat-value online">{{ d.devices.online }}</span
                ><span class="stat-label">Çevrimiçi</span>
              </div>
              <div class="stat">
                <span class="stat-value offline">{{ d.devices.offline }}</span
                ><span class="stat-label">Çevrimdışı</span>
              </div>
            </div>
            <div class="widget-sub-label">Toplam {{ d.devices.total }} cihaz</div>
          </div>

          <!-- 3 — Open Incidents -->
          <div class="widget incidents-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x26A0;</span
              ><span class="widget-label">Açık Arızalar</span>
            </div>
            <div class="widget-body">
              <span class="widget-value" [class.high]="d.openIncidents.count > 0">{{
                d.openIncidents.count
              }}</span>
            </div>
            @if (d.openIncidents.count > 0) {
              <div class="widget-footer warn">Müdahale gerekiyor</div>
            } @else {
              <div class="widget-footer ok">Tüm sistemler normal</div>
            }
          </div>

          <!-- 4 — Critical Alerts -->
          <div class="widget alerts-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F514;</span
              ><span class="widget-label">Kritik Uyarılar</span>
            </div>
            <div class="widget-body">
              <span class="widget-value critical" [class.pulse-warn]="d.criticalAlerts.count > 0">{{
                d.criticalAlerts.count
              }}</span>
            </div>
            @if (d.criticalAlerts.count > 0) {
              <div class="alert-ticker">
                @for (a of d.criticalAlerts.items.slice(0, 3); track a.id) {
                  <div class="alert-item">{{ a.issueType }}</div>
                }
              </div>
            } @else {
              <div class="widget-footer ok">Uyarı yok</div>
            }
          </div>

          <!-- 5 — Missing Staffing -->
          <div class="widget missing-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x2757;</span
              ><span class="widget-label">Eksik Personel</span>
            </div>
            <div class="widget-body">
              <span class="widget-value" [class.high]="d.missingStaffing.count > 0">{{
                d.missingStaffing.count
              }}</span>
              <span class="widget-sub">eksik kadro</span>
            </div>
            @if (d.missingStaffing.count === 0) {
              <div class="widget-footer ok">Tam kadro</div>
            } @else {
              <div class="widget-footer warn">Kadro açığı var</div>
            }
          </div>

          <!-- 6 — Swap Requests -->
          <div class="widget swap-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F504;</span
              ><span class="widget-label">Vardiya Değişim</span>
            </div>
            <div class="widget-body">
              <span class="widget-value" [class.high]="d.pendingSwapRequests.count > 0">{{
                d.pendingSwapRequests.count
              }}</span>
              <span class="widget-sub">onay bekleyen</span>
            </div>
            @if (d.pendingSwapRequests.count === 0) {
              <div class="widget-footer ok">Bekleyen talep yok</div>
            }
          </div>

          <!-- 7 — Attendance -->
          <div class="widget attendance-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F4CB;</span
              ><span class="widget-label">Devam Durumu</span>
            </div>
            <div class="widget-rows">
              <div class="row-item">
                <span class="row-value ok">{{ d.attendance.clockedIn }}</span
                ><span class="row-label">Giriş Yaptı</span>
              </div>
              <div class="row-item">
                <span class="row-value warn">{{ d.attendance.notClocked }}</span
                ><span class="row-label">Giriş Yapmadı</span>
              </div>
              <div class="row-item">
                <span class="row-value muted">{{ d.attendance.clockedOut }}</span
                ><span class="row-label">Çıkış Yaptı</span>
              </div>
            </div>
          </div>

          <!-- 8 — Coverage -->
          <div class="widget coverage-widget">
            <div class="widget-header">
              <span class="widget-icon">&#x1F4CA;</span
              ><span class="widget-label">Vardiya Doluluk</span>
            </div>
            <div class="widget-body">
              <div class="coverage-ring">
                <svg viewBox="0 0 36 36" class="ring-svg">
                  <path
                    class="ring-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    class="ring-fill"
                    [attr.stroke-dasharray]="d.coveragePercent + ', 100'"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span class="ring-value">{{ d.coveragePercent }}%</span>
              </div>
            </div>
          </div>
        </main>
      }

      <footer class="cmd-footer">
        <span class="footer-status online">&#x25CF; Sistem Çevrimiçi</span>
        <span class="footer-refresh">Otomatik yenileme: {{ autoRefreshInterval }}s</span>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .cmd-base {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #070b15;
        color: #e2e8f0;
        font-family: 'Inter', 'Segoe UI', sans-serif;
      }
      .fullscreen {
      }
      @media (max-width: 768px) {
        .cmd-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 8px !important;
          padding: 8px !important;
        }
      }

      .cmd-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 24px;
        background: rgba(13, 19, 32, 0.95);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .header-left h1 {
        font-size: 16px;
        font-weight: 700;
        margin: 0;
        color: #f1f5f9;
        letter-spacing: 0.3px;
      }
      .live-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 10px;
        border-radius: 20px;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.3);
      }
      .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
        animation: pulse 1.5s infinite;
      }
      .live-text {
        font-size: 10px;
        font-weight: 700;
        color: #4ade80;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
      .header-center {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .header-time {
        font-size: 22px;
        font-weight: 700;
        color: #f8fafc;
        font-variant-numeric: tabular-nums;
        letter-spacing: 1px;
      }
      .header-date {
        font-size: 12px;
        color: #94a3b8;
      }
      .header-org {
        font-size: 11px;
        color: #64748b;
        background: rgba(255, 255, 255, 0.04);
        padding: 4px 10px;
        border-radius: 6px;
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .update-time {
        font-size: 10px;
        color: #64748b;
      }
      .header-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        padding: 6px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        transition: all 0.15s;
      }
      .header-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
      }

      .error-banner {
        padding: 8px 24px;
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
        font-size: 12px;
      }

      .loading-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 16px;
        color: #64748b;
        font-size: 13px;
      }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(255, 255, 255, 0.08);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
      @keyframes ticker {
        0% {
          transform: translateY(0);
        }
        100% {
          transform: translateY(-100%);
        }
      }

      .cmd-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        padding: 12px 24px;
        flex: 1;
        min-height: 0;
        align-content: start;
      }
      @media (max-width: 1200px) {
        .cmd-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (max-width: 900px) {
        .cmd-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .widget {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.6));
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 130px;
      }
      .widget-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .widget-icon {
        font-size: 16px;
      }
      .widget-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .widget-body.split {
        flex-direction: row;
        gap: 16px;
      }
      .widget-value {
        font-size: 38px;
        font-weight: 700;
        color: #f1f5f9;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .widget-value.high {
        color: #f97316;
      }
      .widget-value.critical {
        color: #ef4444;
      }
      .widget-sub {
        font-size: 11px;
        color: #64748b;
        margin-top: 4px;
      }
      .widget-sub-label {
        font-size: 10px;
        color: #475569;
      }
      .widget-bar {
        height: 4px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #6366f1);
        border-radius: 4px;
      }
      .widget-footer {
        font-size: 10px;
        font-weight: 600;
        padding-top: 4px;
      }
      .widget-footer.ok {
        color: #4ade80;
      }
      .widget-footer.warn {
        color: #fbbf24;
      }
      .pulse-warn {
        animation: pulse 1.5s infinite;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .stat-value {
        font-size: 32px;
        font-weight: 700;
        line-height: 1;
      }
      .stat-value.online {
        color: #22c55e;
      }
      .stat-value.offline {
        color: #ef4444;
      }
      .stat-label {
        font-size: 9px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
      }

      .alert-ticker {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 40px;
        overflow: hidden;
      }
      .alert-item {
        font-size: 10px;
        color: #fca5a5;
        padding: 2px 6px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .widget-rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        justify-content: center;
      }
      .row-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .row-value {
        font-size: 20px;
        font-weight: 700;
        width: 32px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .row-value.ok {
        color: #22c55e;
      }
      .row-value.warn {
        color: #f59e0b;
      }
      .row-value.muted {
        color: #64748b;
      }
      .row-label {
        font-size: 11px;
        color: #94a3b8;
      }

      .coverage-ring {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ring-svg {
        width: 80px;
        height: 80px;
        transform: rotate(-90deg);
      }
      .ring-bg {
        fill: none;
        stroke: rgba(255, 255, 255, 0.06);
        stroke-width: 3;
      }
      .ring-fill {
        fill: none;
        stroke: #3b82f6;
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dasharray 0.6s ease;
      }
      .ring-value {
        position: absolute;
        font-size: 18px;
        font-weight: 700;
        color: #f1f5f9;
      }

      .cmd-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 24px;
        background: rgba(13, 19, 32, 0.8);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        flex-shrink: 0;
        font-size: 10px;
        color: #475569;
      }
      .footer-status.online {
        color: #22c55e;
      }
      .footer-refresh {
        color: #64748b;
      }

      .staff-widget {
        border-left: 3px solid #3b82f6;
      }
      .devices-widget {
        border-left: 3px solid #22c55e;
      }
      .incidents-widget {
        border-left: 3px solid #f59e0b;
      }
      .alerts-widget {
        border-left: 3px solid #ef4444;
      }
      .missing-widget {
        border-left: 3px solid #f97316;
      }
      .swap-widget {
        border-left: 3px solid #a855f7;
      }
      .attendance-widget {
        border-left: 3px solid #06b6d4;
      }
      .coverage-widget {
        border-left: 3px solid #6366f1;
      }
    `,
  ],
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private ws = inject(WebSocketService);
  private auth = inject(AuthService);
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private wsSubs: Subscription[] = [];

  protected data = signal<SnapshotData | null>(null);
  protected loading = signal(true);
  protected error = signal<string | null>(null);
  protected isFullscreen = signal(false);
  protected lastUpdate = signal<string | null>(null);
  protected currentTime = signal('');
  protected currentDate = signal('');
  protected orgName = signal('');

  protected readonly autoRefreshInterval = 15;

  protected staffPercent = computed(() => {
    const d = this.data();
    if (!d || d.activeStaff.total === 0) return 0;
    return Math.round((d.activeStaff.count / d.activeStaff.total) * 100);
  });

  ngOnInit() {
    this.setOrgName();
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 15000);
    this.loadSnapshot();
    this.refreshInterval = setInterval(() => this.loadSnapshot(), this.autoRefreshInterval * 1000);
    this.watchWebSocket();
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.wsSubs.forEach((s) => s.unsubscribe());
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private setOrgName() {
    const user = this.auth.user();
    this.orgName.set(user?.organization?.name || user?.organizationId || '');
  }

  private updateClock() {
    const now = new Date();
    this.currentTime.set(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    this.currentDate.set(
      now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    );
  }

  private watchWebSocket() {
    this.wsSubs.push(this.ws.notification$.subscribe(() => this.loadSnapshot()));
    const updateEvents = ['alert$', 'presenceUpdates$'] as const;
    for (const key of updateEvents) {
      const obs = (this.ws as any)[key];
      if (obs) {
        this.wsSubs.push(obs.subscribe(() => this.loadSnapshot()));
      }
    }
  }

  protected loadSnapshot() {
    const orgId = this.getOrgId();
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.api.get<SnapshotData>(`/command-center/snapshot`).subscribe({
      next: (res) => {
        this.data.set(res);
        this.lastUpdate.set(
          new Date().toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        );
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        this.error.set('Snapshot yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  protected refresh() {
    this.loadSnapshot();
  }

  protected toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  private onFullscreenChange = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  private getOrgId(): string {
    const user = this.auth.user();
    if (user?.organizationId) return user.organizationId;
    try {
      const token = this.auth.getToken();
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload?.organizationId || '';
      }
    } catch {
      /* ignore */
    }
    return '';
  }
}
