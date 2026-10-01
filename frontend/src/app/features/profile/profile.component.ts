import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { AttendanceService, MonthlyStats } from '../../services/attendance.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page profile-page">
      <div class="hero-section glass animate-in">
        <div class="profile-header">
          <div class="avatar">{{ initials() }}</div>
          <div class="profile-meta">
            <h1 class="profile-name">{{ currentUser()?.name || 'Kullanıcı' }}</h1>
            <p class="profile-role">{{ roleLabel() }}</p>
            <p class="profile-email">{{ currentUser()?.email }}</p>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="stats-grid">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="stat-card">
              <div class="skeleton-shimmer" style="width:48px;height:28px;margin:0 auto"></div>
              <div class="skeleton-shimmer" style="width:64px;height:10px;margin:4px auto 0"></div>
            </div>
          }
        </div>
        <div class="stats-grid secondary-stats">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="stat-card-sm">
              <div class="skeleton-shimmer" style="width:36px;height:24px;margin:0 auto"></div>
              <div class="skeleton-shimmer" style="width:48px;height:10px;margin:4px auto 0"></div>
            </div>
          }
        </div>
        <div class="stats-grid secondary-stats">
          <div class="stat-card-wide">
            <div class="skeleton-shimmer" style="width:120px;height:20px;margin:0 auto"></div>
            <div class="skeleton-shimmer" style="width:100px;height:10px;margin:4px auto 0"></div>
          </div>
        </div>
      } @else {
        <div class="stats-grid">
          <div class="stat-card" style="--stat-color: #3b82f6">
            <span class="stat-value">{{ stats().totalDays }}</span>
            <span class="stat-label">Bu Ay</span>
          </div>
          <div class="stat-card" style="--stat-color: #22c55e">
            <span class="stat-value"
              >{{ stats().totalHours }}<span class="stat-unit">sa</span></span
            >
            <span class="stat-label">Toplam Saat</span>
          </div>
          <div class="stat-card" style="--stat-color: #8b5cf6">
            <span class="stat-value"
              >{{ stats().overtimeHours || 0 }}<span class="stat-unit">sa</span></span
            >
            <span class="stat-label">Fazla Mesai</span>
          </div>
          <div class="stat-card" style="--stat-color: #f59e0b">
            <span class="stat-value">{{ stats().completedShifts || 0 }}</span>
            <span class="stat-label">Tamamlanan</span>
          </div>
        </div>

        <div class="stats-grid secondary-stats">
          <div class="stat-card-sm" style="--stat-color: #06b6d4">
            <span class="stat-value">{{ stats().nightShifts || 0 }}</span>
            <span class="stat-label">Gece</span>
          </div>
          <div class="stat-card-sm" style="--stat-color: #e11d48">
            <span class="stat-value">{{ stats().weekendShifts || 0 }}</span>
            <span class="stat-label">Hafta Sonu</span>
          </div>
          <div class="stat-card-sm" style="--stat-color: #a855f7">
            <span class="stat-value"
              >{{ stats().avgHoursPerDay }}<span class="stat-unit">sa</span></span
            >
            <span class="stat-label">Günlük Ort.</span>
          </div>
          <div class="stat-card-sm" style="--stat-color: #22c55e">
            <span class="stat-value">%{{ stats().onTimeRate }}</span>
            <span class="stat-label">Zamanında</span>
          </div>
        </div>

        <div class="stats-grid secondary-stats">
          <div class="stat-card-wide" style="--stat-color: #3b82f6">
            <span class="stat-value">{{ stats().mostUsedDevice || '—' }}</span>
            <span class="stat-label">En Çok Kullanılan Cihaz</span>
          </div>
        </div>
      }

      <div class="card info-card">
        <div class="card-header"><h3>Hesap Bilgileri</h3></div>
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">Rol</span><span class="info-value">{{ roleLabel() }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">E-posta</span
            ><span class="info-value">{{ currentUser()?.email }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Birim</span
            ><span class="info-value">{{ currentUser()?.unitId || '—' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .profile-page {
        padding: 16px 20px;
        max-width: 800px;
        margin: 0 auto;
      }
      .hero-section {
        padding: 24px 28px;
        margin-bottom: 16px;
        border-radius: var(--radius-xl);
      }
      .profile-header {
        display: flex;
        align-items: center;
        gap: 20px;
      }
      .avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--accent-gradient);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: 700;
        color: #fff;
        flex-shrink: 0;
      }
      .profile-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .profile-name {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }
      .profile-role {
        font-size: 13px;
        color: var(--accent-mr);
        margin: 0;
      }
      .profile-email {
        font-size: 12px;
        color: var(--text-muted);
        margin: 0;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 12px;
      }
      .secondary-stats {
        margin-bottom: 12px;
      }
      .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 16px;
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
      }
      .stat-card-sm {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 12px;
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
      }
      .stat-card-wide {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 14px;
        grid-column: 1 / -1;
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
      }
      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--stat-color);
        line-height: 1;
      }
      .stat-card-wide .stat-value {
        font-size: 18px;
      }
      .stat-unit {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-muted);
      }
      .stat-label {
        font-size: 10px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .card {
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .card-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .card-header h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .card-body {
        padding: 16px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .info-row:last-child {
        border-bottom: none;
      }
      .info-label {
        font-size: 12px;
        color: var(--text-muted);
      }
      .info-value {
        font-size: 13px;
        color: var(--text-primary);
        font-weight: 500;
      }
      @media (max-width: 768px) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private attendanceService = inject(AttendanceService);

  protected currentUser = this.authService.user;
  protected loading = signal(true);
  protected stats = signal<MonthlyStats>({
    totalDays: 0,
    totalHours: 0,
    avgHoursPerDay: 0,
    onTimeRate: 0,
  });

  ngOnInit() {
    const now = new Date();
    this.attendanceService.getStats(now.getMonth() + 1, now.getFullYear()).subscribe({
      next: (s) => {
        this.stats.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected initials(): string {
    const name = this.currentUser()?.name || '?';
    return name
      .split(' ')
      .map((s: string) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  protected roleLabel(): string {
    const map: Record<string, string> = {
      system_admin: 'Sistem Yöneticisi',
      hospital_admin: 'Hastane Yöneticisi',
      imaging_director: 'Görüntüleme Hiz. Müdürü',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
      senior_technician: 'Sorumlu Tekniker',
      technician: 'Tekniker',
      assistant_technician: 'Yardımcı Tekniker',
      secretary: 'Sekreter',
      guest: 'Misafir',
    };
    return map[this.currentUser()?.role || ''] || this.currentUser()?.role || '';
  }
}
