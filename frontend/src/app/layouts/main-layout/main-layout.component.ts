import { Component, signal, computed, inject, ChangeDetectionStrategy, HostListener, effect } from '@angular/core';
import { Router, RouterOutlet, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { RbacService } from '../../services/rbac.service';
import { ThemeService } from '../../core/services/theme.service';
import { SearchPaletteComponent } from '../../ui/search-palette/search-palette.component';
import { QuickActionsComponent } from '../../ui/quick-actions/quick-actions.component';
import { trigger, transition, style, query, group, animate } from '@angular/animations';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';
import { getRoleLabel, hasMinRole } from '../../shared/utils/role-hierarchy';

export const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    style({ position: 'relative' }),
    query(':enter, :leave', [style({ position: 'absolute', top: 0, left: 0, width: '100%' })], { optional: true }),
    group([
      query(':leave', [animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-8px)' }))], { optional: true }),
      query(':enter', [style({ opacity: 0, transform: 'translateY(8px)' }), animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))], { optional: true }),
    ]),
  ]),
]);

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, SearchPaletteComponent, QuickActionsComponent, SafeHtmlPipe],
  template: `
    <div class="app-shell" [class.sidebar-collapsed]="!sidebarExpanded()" [class.mobile-view]="isMobile()">
      <!-- Skip link for accessibility -->
      <a href="#main-content" class="skip-link" (click)="$event.preventDefault(); mainContent.focus()">
        İçeriğe geç
      </a>

      <!-- Sidebar -->
      <aside class="sidebar" role="navigation" aria-label="Ana navigasyon" [class.sidebar-open]="mobileSidebarOpen()">
        <div class="sidebar-header">
          <div class="sidebar-logo">
            <svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="8" fill="var(--primary)"/><text x="20" y="26" text-anchor="middle" fill="white" font-size="18" font-weight="bold">V</text></svg>
            @if (sidebarExpanded()) {
              <span class="sidebar-brand">VardiyaOS</span>
            }
          </div>
          <button class="sidebar-close-btn" (click)="mobileSidebarOpen.set(false)" aria-label="Menüyü kapat">&times;</button>
        </div>

        <nav class="sidebar-nav" aria-label="Birimler">
          <div class="sidebar-section-title" [class.sr-only]="!sidebarExpanded()">Birimler</div>
          @for (unit of units(); track unit.id) {
            <a class="sidebar-item" [class.sidebar-item-active]="activeUnit() === unit.id" [routerLink]="unit.route" (click)="mobileSidebarOpen.set(false)">
              <span class="sidebar-item-icon" [style.color]="unit.color" [innerHTML]="unit.icon | safeHtml"></span>
              @if (sidebarExpanded()) {
                <span class="sidebar-item-label">{{ unit.label }}</span>
              }
            </a>
          }
        </nav>

        <div class="sidebar-divider"></div>

        <nav class="sidebar-nav" aria-label="Ana menü">
          @for (item of mainNav(); track item.id) {
            @if (item.visible) {
              @if (item.isSection) {
                <div class="sidebar-section-title" [class.sr-only]="!sidebarExpanded()">{{ item.label }}</div>
              } @else {
                <a class="sidebar-item" [class.sidebar-item-active]="activeRoute() === item.route || activeRoute().startsWith(item.route + '/')" [routerLink]="item.route" (click)="mobileSidebarOpen.set(false)">
                  <span class="sidebar-item-icon" [innerHTML]="item.icon | safeHtml"></span>
                  @if (sidebarExpanded()) {
                    <span class="sidebar-item-label">{{ item.label }}</span>
                    @if (item.badge) {
                      <span class="sidebar-badge">{{ item.badge }}</span>
                    }
                  }
                </a>
              }
            }
          }
        </nav>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-footer">
          <button class="sidebar-item" (click)="toggleSidebar()" aria-label="Kenar çubuğunu daralt/genişlet">
            <span class="sidebar-item-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </span>
            @if (sidebarExpanded()) {
              <span class="sidebar-item-label">Daralt</span>
            }
          </button>
        </div>
      </aside>

      <!-- Mobile sidebar overlay -->
      @if (mobileSidebarOpen()) {
        <div class="sidebar-overlay" (click)="mobileSidebarOpen.set(false)"></div>
      }

      <!-- Main content area -->
      <div class="main-area">
        <!-- Topbar -->
        <header class="topbar" role="banner">
          <div class="topbar-left">
            <button class="topbar-menu-btn" (click)="mobileSidebarOpen.set(true)" aria-label="Menüyü aç">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div class="topbar-search" (click)="search.toggle()" role="button" tabindex="0" (keydown.enter)="search.toggle()" aria-label="Aramayı aç">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span class="topbar-search-text">Ara...</span>
              <kbd class="topbar-search-kbd">Ctrl+K</kbd>
            </div>
          </div>

          <div class="topbar-right">
            <button class="topbar-btn" (click)="theme.toggle()" [attr.aria-label]="'Temayı değiştir: ' + (theme.isDark() ? 'Açık' : 'Koyu')">
              @if (theme.isDark()) {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              }
            </button>

            <a class="topbar-btn" routerLink="/app/notifications" aria-label="Bildirimler">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            </a>

            <div class="topbar-profile" (click)="profileOpen.set(!profileOpen())" role="button" tabindex="0" (keydown.enter)="profileOpen.set(!profileOpen())" aria-label="Kullanıcı menüsü">
              <div class="topbar-avatar">{{ userInitials() }}</div>
              <div class="topbar-user-info">
                <span class="topbar-user-name">{{ user()?.name }}</span>
                <span class="topbar-user-role">{{ userRoleLabel() }}</span>
              </div>
            </div>

            @if (profileOpen()) {
              <div class="profile-dropdown" role="menu">
                <a class="profile-dropdown-item" routerLink="/app/profile" (click)="profileOpen.set(false)" role="menuitem">Profilim</a>
                <a class="profile-dropdown-item" routerLink="/app/settings" (click)="profileOpen.set(false)" role="menuitem">Ayarlar</a>
                <div class="profile-dropdown-divider"></div>
                <button class="profile-dropdown-item" (click)="logout()" role="menuitem">Çıkış Yap</button>
              </div>
            }
          </div>
        </header>

        <!-- Page content -->
        <main id="main-content" #mainContent class="page-content" tabindex="-1" [@routeAnimations]="getAnimationState()">
          <router-outlet/>
        </main>
      </div>

      <!-- Bottom navigation for mobile -->
      @if (isMobile()) {
        <nav class="bottom-nav" role="navigation" aria-label="Alt navigasyon">
          @for (item of bottomNav(); track item.id) {
            <a class="bottom-nav-item" [class.bottom-nav-active]="activeRoute() === item.route" [routerLink]="item.route">
              <span class="bottom-nav-icon" [innerHTML]="item.icon | safeHtml"></span>
              <span class="bottom-nav-label">{{ item.label }}</span>
            </a>
          }
        </nav>
      }

      <!-- Global search palette -->
      <app-search-palette #search/>

      <!-- Quick action FAB -->
      @if (!isMobile()) {
        <app-quick-actions/>
      }
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .app-shell { display: flex; height: 100vh; overflow: hidden; background: var(--bg-secondary); }
    .skip-link { position: fixed; top: -100%; left: 1rem; padding: 0.5rem 1rem; background: var(--primary); color: white; border-radius: var(--radius-md); z-index: 9999; font-size: 0.875rem; text-decoration: none; }
    .skip-link:focus { top: 1rem; }

    /* Sidebar */
    .sidebar { width: 16rem; min-width: 16rem; background: var(--bg-primary); border-right: 1px solid var(--border-default); display: flex; flex-direction: column; transition: width 0.25s ease, min-width 0.25s ease; overflow-y: auto; overflow-x: hidden; z-index: 100; }
    .sidebar-collapsed .sidebar { width: 4rem; min-width: 4rem; }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem; height: 4rem; border-bottom: 1px solid var(--border-subtle); }
    .sidebar-logo { display: flex; align-items: center; gap: 0.75rem; }
    .sidebar-brand { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; }
    .sidebar-close-btn { display: none; width: 2rem; height: 2rem; border: none; background: var(--bg-hover); border-radius: var(--radius-sm); cursor: pointer; font-size: 1.25rem; color: var(--text-muted); }
    .sidebar-nav { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.125rem; }
    .sidebar-section-title { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 0.75rem 0.75rem 0.375rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
    .sidebar-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; border: none; background: none; width: 100%; text-align: left; font-size: 0.875rem; }
    .sidebar-item:hover { background: var(--bg-hover); color: var(--text-primary); }
    .sidebar-item-active { background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary) !important; font-weight: 500; }
    .sidebar-item-icon { flex-shrink: 0; width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center; }
    .sidebar-item-icon svg { width: 1.25rem; height: 1.25rem; }
    .sidebar-item-label { flex: 1; }
    .sidebar-badge { font-size: 0.7rem; background: var(--status-danger); color: white; padding: 0.1rem 0.4rem; border-radius: 9999px; }
    .sidebar-divider { height: 1px; background: var(--border-subtle); margin: 0.5rem; }
    .sidebar-spacer { flex: 1; }
    .sidebar-footer { padding: 0.5rem; border-top: 1px solid var(--border-subtle); }

    /* Mobile sidebar */
    @media (max-width: 768px) {
      .sidebar { position: fixed; inset: 0; width: 18rem !important; min-width: 18rem !important; z-index: 200; transform: translateX(-100%); transition: transform 0.3s ease; }
      .sidebar-open { transform: translateX(0); }
      .sidebar-close-btn { display: flex; align-items: center; justify-content: center; }
      .sidebar-collapsed .sidebar { width: 18rem !important; min-width: 18rem !important; }
    }
    .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199; }

    /* Main area */
    .main-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    /* Topbar */
    .topbar { display: flex; align-items: center; justify-content: space-between; height: 4rem; padding: 0 1.5rem; background: var(--bg-primary); border-bottom: 1px solid var(--border-subtle); gap: 1rem; flex-shrink: 0; }
    .topbar-left { display: flex; align-items: center; gap: 1rem; flex: 1; }
    .topbar-menu-btn { display: none; width: 2.25rem; height: 2.25rem; border: none; background: var(--bg-hover); border-radius: var(--radius-md); cursor: pointer; color: var(--text-secondary); align-items: center; justify-content: center; }
    @media (max-width: 768px) { .topbar-menu-btn { display: flex; } }
    .topbar-search { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; background: var(--bg-hover); border-radius: var(--radius-md); cursor: pointer; min-width: 16rem; transition: background 0.15s; }
    .topbar-search:hover { background: var(--bg-secondary); }
    .topbar-search svg { color: var(--text-muted); flex-shrink: 0; }
    .topbar-search-text { font-size: 0.8rem; color: var(--text-muted); flex: 1; }
    .topbar-search-kbd { font-size: 0.65rem; padding: 0.1rem 0.3rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-muted); }
    @media (max-width: 640px) { .topbar-search-text, .topbar-search-kbd { display: none; } .topbar-search { min-width: 2.25rem; padding: 0.375rem; justify-content: center; } }
    .topbar-right { display: flex; align-items: center; gap: 0.5rem; }
    .topbar-btn { width: 2.25rem; height: 2.25rem; border: none; background: transparent; border-radius: var(--radius-md); cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: background 0.15s; text-decoration: none; }
    .topbar-btn:hover { background: var(--bg-hover); }
    .topbar-profile { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; border-radius: var(--radius-md); cursor: pointer; position: relative; }
    .topbar-profile:hover { background: var(--bg-hover); }
    .topbar-avatar { width: 2rem; height: 2rem; border-radius: 9999px; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; }
    .topbar-user-info { line-height: 1.3; }
    .topbar-user-name { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-primary); }
    .topbar-user-role { display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: capitalize; }
    @media (max-width: 640px) { .topbar-user-info { display: none; } }

    /* Profile dropdown */
    .profile-dropdown { position: absolute; top: 100%; right: 0; margin-top: 0.5rem; min-width: 12rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); z-index: 300; padding: 0.375rem; }
    .profile-dropdown-item { display: block; width: 100%; padding: 0.5rem 0.75rem; border: none; border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: 0.8rem; color: var(--text-primary); text-align: left; text-decoration: none; }
    .profile-dropdown-item:hover { background: var(--bg-hover); }
    .profile-dropdown-divider { height: 1px; background: var(--border-subtle); margin: 0.25rem 0.5rem; }

    /* Page content */
    .page-content { flex: 1; overflow: auto; padding: 1.5rem; position: relative; }
    .page-content:focus { outline: none; }
    @media (max-width: 768px) { .page-content { padding: 1rem; } }

    /* Bottom navigation */
    .bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 4rem; background: var(--bg-primary); border-top: 1px solid var(--border-default); z-index: 100; }
    @media (max-width: 768px) { .bottom-nav { display: flex; } }
    .bottom-nav { display: flex; align-items: center; justify-content: space-around; }
    .bottom-nav-item { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; padding: 0.375rem 0.75rem; text-decoration: none; color: var(--text-muted); transition: color 0.15s; }
    .bottom-nav-active { color: var(--primary) !important; }
    .bottom-nav-icon { width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center; }
    .bottom-nav-icon svg { width: 1.25rem; height: 1.25rem; }
    .bottom-nav-label { font-size: 0.65rem; font-weight: 500; }
  `],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
  private router = inject(Router);
  private auth = inject(AuthService);
  private rbac = inject(RbacService);
  readonly theme = inject(ThemeService);

  readonly sidebarExpanded = signal(true);
  readonly mobileSidebarOpen = signal(false);
  readonly profileOpen = signal(false);

  readonly user = computed(() => this.auth.user());
  readonly userRoleLabel = computed(() => getRoleLabel(this.user()?.role || ''));
  readonly userInitials = computed(() => {
    const u = this.user();
    if (!u?.name) return '?';
    return u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  });

  readonly isMobile = signal(false);

  /** Route-guard-consistent visibility for supervisor-surface nav items (matches the `minRole: 'supervisor'` route guards). */
  readonly hasSupervisorSurfaces = computed(() => hasMinRole(this.user()?.role || '', 'supervisor'));

  private readonly activeRouteEvent = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ),
  );
  readonly activeRoute = computed(() => (this.activeRouteEvent()?.url) || this.router.url);

  readonly activeUnit = computed(() => {
    const route = this.activeRoute();
    const unitMap: Record<string, string> = {
      'mr-plan': 'mr', 'bt-plan': 'bt', 'rontgen-plan': 'rontgen',
      'nukleer-tip-plan': 'nukleer', 'onkoloji-plan': 'onkoloji',
      'supervizor-plan': 'supervizor',
    };
    return unitMap[route.split('/').pop() || ''] || '';
  });

  private readonly allUnits = [
    { id: 'mr', label: 'MR', route: '/app/mr-plan', color: '#3b82f6', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
    { id: 'bt', label: 'BT', route: '/app/bt-plan', color: '#14b8a6', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
    { id: 'rontgen', label: 'Röntgen', route: '/app/rontgen-plan', color: '#f97316', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>' },
    { id: 'nukleer', label: 'Nükleer Tıp', route: '/app/nukleer-tip-plan', color: '#22c55e', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' },
    { id: 'onkoloji', label: 'Radyasyon Onkolojisi', route: '/app/onkoloji-plan', color: '#ec4899', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2v20M2 12h20"/></svg>' },
    { id: 'supervizor', label: 'Süpervizör', route: '/app/supervizor-plan', color: '#8b5cf6', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' },
  ];

  /** Sidebar unit links. */
  readonly units = computed(() => this.allUnits);

  readonly mainNav = computed(() => [
    { id: 'dashboard', label: 'Kontrol Paneli', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="4"/><rect x="14" y="10" width="7" height="11"/><rect x="3" y="13" width="7" height="8"/></svg>', route: '/app/dashboard', visible: true, badge: '' },
    { id: 'my-day', label: 'Bugünkü Vardiyam', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', route: '/app/my-day', visible: true, badge: '' },
    { id: 'duty-roster', label: 'Nöbetçi Listesi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="18"/></svg>', route: '/app/duty-roster', visible: true, badge: '' },
    { id: 'employees', label: 'Personel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>', route: '/app/employees', visible: true, badge: '' },
    { id: 'reports', label: 'Raporlar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', route: '/app/reports', visible: true, badge: '' },
    { id: 'settings', label: 'Ayarlar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>', route: '/app/settings', visible: true, badge: '' },
    { id: 'ops-center', label: 'Operasyon Merkezi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>', route: '/app/command-center', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'section-enterprise', label: 'Isletme', icon: '', route: '', visible: this.hasSupervisorSurfaces(), badge: '', isSection: true },
    { id: 'assets', label: 'Cihaz Yönetimi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', route: '/app/assets', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-biomedical', label: 'Biyomedikal', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>', route: '/app/enterprise/biomedical', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-consumables', label: 'Sarf Malzeme', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', route: '/app/enterprise/consumables', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-procurement', label: 'Satın Alma', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>', route: '/app/enterprise/procurement', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-contracts', label: 'Sözleşmeler', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', route: '/app/enterprise/contracts', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-suppliers', label: 'Tedarikçiler', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>', route: '/app/enterprise/suppliers', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-quality', label: 'Kalite', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>', route: '/app/enterprise/quality', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-radiation', label: 'Radyasyon Güv.', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>', route: '/app/enterprise/radiation-safety', visible: this.hasSupervisorSurfaces(), badge: '' },
    { id: 'enterprise-inventory', label: 'Envanter', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', route: '/app/enterprise/inventory', visible: this.hasSupervisorSurfaces(), badge: '' },
  ]);

  readonly bottomNav = computed(() => [
    { id: 'dashboard', label: 'Panel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="4"/><rect x="14" y="10" width="7" height="11"/><rect x="3" y="13" width="7" height="8"/></svg>', route: '/app/dashboard' },
    { id: 'my-day', label: 'Bugün', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', route: '/app/my-day' },
    { id: 'employees', label: 'Personel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', route: '/app/employees' },
    { id: 'notifications', label: 'Bildirim', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>', route: '/app/notifications' },
    { id: 'reports', label: 'Raporlar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', route: '/app/reports' },
  ]);

  constructor() {
    const mq = window.matchMedia('(max-width: 768px)');
    this.isMobile.set(mq.matches);
    mq.addEventListener('change', e => this.isMobile.set(e.matches));

    void this.rbac.ensureLoaded();

    effect(() => {
      if (!this.isMobile()) this.mobileSidebarOpen.set(false);
    });
  }

  getAnimationState(): string {
    return this.activeRoute();
  }

  toggleSidebar(): void {
    this.sidebarExpanded.update(v => !v);
  }

  logout(): void {
    this.auth.logout();
  }
}
