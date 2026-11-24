import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { AttendanceService, MonthlyStats } from '../../services/attendance.service';
import { ApiService } from '../../core/api/api.service';

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
            @if (scopeLabel()) {
              <p class="profile-scope">{{ scopeLabel() }}</p>
            }
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="stats-grid">
          @for (i of [1,2,3,4]; track i) {
            <div class="stat-card">
              <div class="skeleton-shimmer" style="width:48px;height:28px;margin:0 auto"></div>
              <div class="skeleton-shimmer" style="width:64px;height:10px;margin:4px auto 0"></div>
            </div>
          }
        </div>
        <div class="stats-grid secondary-stats">
          @for (i of [1,2,3,4]; track i) {
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
          <span class="stat-value">{{ stats().totalHours }}<span class="stat-unit">sa</span></span>
          <span class="stat-label">Toplam Saat</span>
        </div>
        <div class="stat-card" style="--stat-color: #8b5cf6">
          <span class="stat-value">{{ stats().overtimeHours || 0 }}<span class="stat-unit">sa</span></span>
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
          <span class="stat-value">{{ stats().avgHoursPerDay }}<span class="stat-unit">sa</span></span>
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
          <div class="info-row"><span class="info-label">Rol</span><span class="info-value">{{ roleLabel() }}</span></div>
          <div class="info-row"><span class="info-label">Yetki Kapsamı</span><span class="info-value">{{ scopeLabel() }}</span></div>
          <div class="info-row"><span class="info-label">Birim</span><span class="info-value">{{ unitName() || currentUser()?.unit?.name || (currentUser()?.unitId ? 'Birim atanmış (adı yüklenemedi)' : '—') }}</span></div>
          <div class="info-row"><span class="info-label">E-posta</span><span class="info-value">{{ currentUser()?.email }}</span></div>
          <div class="info-row"><span class="info-label">Organizasyon</span><span class="info-value">{{ currentUser()?.organization?.name || 'Organizasyon' }}</span></div>
        </div>
      </div>

      <div class="card info-card">
        <div class="card-header"><h3>Kurum Yapısı</h3></div>
        <div class="card-body">
          @if (orgLoading()) {
            <p class="info-label">Yükleniyor…</p>
          } @else if (orgTree().length === 0) {
            <p class="info-label">Birim verisi bulunamadı.</p>
          } @else {
            @for (group of orgTree(); track group.orgId) {
              <div class="org-group">
                <p class="org-title">{{ group.orgName }}</p>
                @for (u of group.units; track u.id) {
                  <div class="org-unit" [class.org-unit-own]="u.id === currentUser()?.unitId">
                    <span class="org-unit-name">{{ u.name }} <span class="org-unit-code">({{ u.code }})</span></span>
                    <span class="org-unit-meta">tip: {{ u.type }} · cihaz: {{ u._count?.devices ?? 0 }} · personel: {{ u._count?.personnel ?? 0 }}</span>
                  </div>
                }
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profile-page { padding: 16px 20px; max-width: 800px; margin: 0 auto; }
    .hero-section { padding: 24px 28px; margin-bottom: 16px; border-radius: var(--radius-xl); }
    .profile-header { display: flex; align-items: center; gap: 20px; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; background: var(--accent-gradient); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #fff; flex-shrink: 0; }
    .profile-meta { display: flex; flex-direction: column; gap: 2px; }
    .profile-name { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; }
    .profile-role { font-size: 13px; color: var(--accent-mr); margin: 0; }
    .profile-email { font-size: 12px; color: var(--text-muted); margin: 0; }
    .profile-scope { font-size: 12px; color: var(--accent-mr); background: var(--bg-glass-light); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 2px 8px; margin: 6px 0 0; width: fit-content; }
    .org-group { margin-bottom: 14px; }
    .org-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0 0 6px; }
    .org-unit { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 6px; background: var(--bg-glass-light); }
    .org-unit-own { border-color: var(--accent-mr); background: color-mix(in srgb, var(--accent-mr) 8%, transparent); }
    .org-unit-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .org-unit-code { font-size: 11px; color: var(--text-muted); }
    .org-unit-meta { font-size: 11px; color: var(--text-muted); }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .secondary-stats { margin-bottom: 12px; }
    .stat-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; background: var(--bg-glass-light); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
    .stat-card-sm { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px; background: var(--bg-glass-light); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
    .stat-card-wide { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px; grid-column: 1 / -1; background: var(--bg-glass-light); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--stat-color); line-height: 1; }
    .stat-card-wide .stat-value { font-size: 18px; }
    .stat-unit { font-size: 13px; font-weight: 500; color: var(--text-muted); }
    .stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
    .card { background: var(--bg-glass-light); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; }
    .card-header { padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
    .card-header h3 { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .card-body { padding: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-size: 12px; color: var(--text-muted); }
    .info-value { font-size: 13px; color: var(--text-primary); font-weight: 500; }
    @media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private attendanceService = inject(AttendanceService);
  private api = inject(ApiService);

  protected currentUser = this.authService.user;
  protected loading = signal(true);
  protected stats = signal<MonthlyStats>({ totalDays: 0, totalHours: 0, avgHoursPerDay: 0, onTimeRate: 0 });
  protected units = signal<any[]>([]);
  protected orgLoading = signal(true);

  /** Real unit list from the backend (/units) — drives unit-name + scope + org tree. */
  protected readonly unitName = computed(() => {
    const uid = this.currentUser()?.unitId;
    if (!uid) return null;
    return this.units().find((u: any) => u?.id === uid)?.name ?? null;
  });

  /** Data-driven scope classification. Only field_supervisor is unit-confined. */
  protected readonly scopeLabel = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    const unit = this.unitName();
    if (user.role === 'field_supervisor') {
      return unit ? `Saha sorumlusu — yetki kapsamı yalnızca: ${unit}` : 'Saha sorumlusu — yetki kapsamı: atanmış birim';
    }
    return 'Kurum geneli (kendi organizasyonu çapında)';
  });

  /** Grouped org tree fed purely by the real /units response. */
  protected readonly orgTree = computed(() => {
    const list = this.units();
    const byOrg = new Map<string, any[]>();
    for (const u of list) {
      const key = u?.organizationId || 'other';
      if (!byOrg.has(key)) byOrg.set(key, []);
      byOrg.get(key)!.push(u);
    }
    return [...byOrg.entries()].map(([orgId, units]) => ({
      orgId,
      orgName: orgId === this.currentUser()?.organizationId ? (this.currentUser()?.organization?.name ?? 'Organizasyon') : 'Organizasyon',
      units,
    }));
  });

  ngOnInit() {
    const now = new Date();
    this.attendanceService.getStats(now.getMonth() + 1, now.getFullYear())
      .subscribe({
        next: (s) => { this.stats.set(s); this.loading.set(false); },
        error: () => this.loading.set(false),
      });

    // Read-only: fetch the real unit tree to power the scope + org display.
    this.api.get<any[]>('/units', { silent: true }).subscribe({
      next: (units) => { this.units.set(Array.isArray(units) ? units : []); this.orgLoading.set(false); },
      error: () => { this.orgLoading.set(false); },
    });
  }

  protected initials(): string {
    const name = this.currentUser()?.name || '?';
    return name.split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();
  }

  protected roleLabel(): string {
    const map: Record<string, string> = {
      system_admin: 'Sistem Yöneticisi', hospital_admin: 'Hastane Yöneticisi', imaging_director: 'Görüntüleme Hiz. Müdürü',
      supervisor: 'Süpervizör', medical_engineer: 'Medikal Mühendis', senior_technician: 'Sorumlu Tekniker',
      technician: 'Tekniker', assistant_technician: 'Yardımcı Tekniker', secretary: 'Sekreter', guest: 'Misafir',
      project_manager: 'Proje Yöneticisi', chief_technician: 'Baş Tekniker', hr: 'İK (İnsan Kaynakları)',
      field_supervisor: 'Saha Sorumlusu',
    };
    return map[this.currentUser()?.role || ''] || this.currentUser()?.role || '';
  }
}
