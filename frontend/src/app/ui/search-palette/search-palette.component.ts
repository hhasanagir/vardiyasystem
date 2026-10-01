import {
  Component,
  signal,
  computed,
  inject,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';

interface SearchItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
  category: string;
  keywords: string[];
}

@Component({
  selector: 'app-search-palette',
  standalone: true,
  imports: [FormsModule],
  animations: [
    trigger('overlay', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('150ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('100ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('panel', [
      transition(':enter', [
        style({ opacity: 0, scale: 0.95 }),
        animate('150ms ease-out', style({ opacity: 1, scale: 1 })),
      ]),
    ]),
  ],
  template: `
    @if (visible()) {
      <div class="search-overlay" (click)="close()" (keydown.escape)="close()"></div>
      <div class="search-panel" role="dialog" aria-label="Hızlı arama" aria-modal="true">
        <div class="search-input-wrapper">
          <svg
            class="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="20"
            height="20"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            #searchInput
            [(ngModel)]="query"
            (keydown.arrowdown)="moveSelection(1)"
            (keydown.arrowup)="moveSelection(-1)"
            (keydown.enter)="select(selectedIndex())"
            placeholder="Sayfaları, kişileri ve işlemleri ara... (Ctrl+K)"
            class="search-input"
            aria-label="Arama"
            autofocus
          />
          <kbd class="search-hint">ESC</kbd>
        </div>
        @if (query()) {
          @if (filteredItems().length > 0) {
            <div class="search-results" role="listbox">
              @for (item of filteredItems(); track item.id; let i = $index) {
                <button
                  class="search-item"
                  [class.search-item-active]="i === selectedIndex()"
                  (click)="select(i)"
                  (mouseenter)="selectedIndex.set(i)"
                  role="option"
                  [attr.aria-selected]="i === selectedIndex()"
                >
                  <span class="search-item-icon" [innerHTML]="item.icon"></span>
                  <div class="search-item-content">
                    <span class="search-item-label">{{ item.label }}</span>
                    <span class="search-item-desc">{{ item.description }}</span>
                  </div>
                  <kbd class="search-item-shortcut">↵</kbd>
                </button>
              }
            </div>
          } @else {
            <div class="search-empty">Sonuç bulunamadı</div>
          }
        } @else {
          <div class="search-categories">
            @for (cat of categories(); track cat.name) {
              <div class="search-category">
                <div class="search-category-title">{{ cat.name }}</div>
                <div class="search-category-items">
                  @for (item of cat.items; track item.id) {
                    <button class="search-item" (click)="navigate(item.route); close()">
                      <span class="search-item-icon" [innerHTML]="item.icon"></span>
                      <div class="search-item-content">
                        <span class="search-item-label">{{ item.label }}</span>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .search-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
      }
      .search-panel {
        position: fixed;
        top: 15%;
        left: 50%;
        transform: translateX(-50%);
        width: min(640px, calc(100vw - 2rem));
        max-height: 60vh;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-2xl);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--border-subtle);
      }
      .search-icon {
        flex-shrink: 0;
        color: var(--text-muted);
      }
      .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 1rem;
        background: transparent;
        color: var(--text-primary);
      }
      .search-input::placeholder {
        color: var(--text-muted);
      }
      .search-hint {
        font-size: 0.7rem;
        padding: 0.2rem 0.4rem;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
      }
      .search-results {
        overflow-y: auto;
        padding: 0.5rem;
      }
      .search-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s;
        color: var(--text-primary);
      }
      .search-item-active,
      .search-item:hover {
        background: var(--bg-hover);
      }
      .search-item-icon {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .search-item-icon svg {
        width: 1.25rem;
        height: 1.25rem;
      }
      .search-item-content {
        flex: 1;
        min-width: 0;
      }
      .search-item-label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
      }
      .search-item-desc {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .search-item-shortcut {
        font-size: 0.7rem;
        padding: 0.15rem 0.3rem;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
      }
      .search-empty {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.875rem;
      }
      .search-categories {
        overflow-y: auto;
        padding: 0.5rem;
      }
      .search-category {
        margin-bottom: 0.5rem;
      }
      .search-category-title {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        padding: 0.5rem 0.75rem;
      }
      .search-category-items {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPaletteComponent {
  private router = inject(Router);

  readonly visible = signal(false);
  readonly query = signal('');
  readonly selectedIndex = signal(0);

  private items: SearchItem[] = [
    {
      id: 'dashboard',
      label: 'Kontrol Paneli',
      description: 'Ana sayfa ve özet görünüm',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
      route: '/app/dashboard',
      category: 'Sayfalar',
      keywords: ['ana sayfa', 'panel', 'kontrol'],
    },
    {
      id: 'my-day',
      label: 'Bugünkü Vardiyam',
      description: 'Günlük görevler ve vardiya detayı',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      route: '/app/my-day',
      category: 'Sayfalar',
      keywords: ['bugün', 'vardiya', 'görev'],
    },
    {
      id: 'employees',
      label: 'Personel',
      description: 'Personel yönetimi ve listeleme',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      route: '/app/employees',
      category: 'Sayfalar',
      keywords: ['çalışan', 'kişi', 'ekip'],
    },
    {
      id: 'schedules',
      label: 'Vardiya Planları',
      description: 'MR, BT, Röntgen ve diğer birim planları',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      route: '/app/mr-plan',
      category: 'Sayfalar',
      keywords: ['plan', 'çizelge', 'mr', 'bt', 'röntgen'],
    },
    {
      id: 'notifications',
      label: 'Bildirimler',
      description: 'Bildirim merkezi ve geçmiş',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
      route: '/app/notifications',
      category: 'Sayfalar',
      keywords: ['uyarı', 'mesaj', 'alert'],
    },
    {
      id: 'reports',
      label: 'Raporlar',
      description: 'Analitik raporlar ve istatistikler',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      route: '/app/reports',
      category: 'Sayfalar',
      keywords: ['analiz', 'grafik', 'istatistik'],
    },
    {
      id: 'leave',
      label: 'İzin Yönetimi',
      description: 'İzin talepleri ve takibi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      route: '/app/leave-management',
      category: 'Sayfalar',
      keywords: ['izin', 'tatil', 'rapor'],
    },
    {
      id: 'swap',
      label: 'Vardiya Takas',
      description: 'Vardiya değişim talepleri',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
      route: '/app/swap-requests',
      category: 'Sayfalar',
      keywords: ['takas', 'değişim', 'değiştir'],
    },
    {
      id: 'approvals',
      label: 'Onay Merkezi',
      description: 'Bekleyen onaylar ve iş akışları',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
      route: '/app/approval-center',
      category: 'Sayfalar',
      keywords: ['onay', 'bekleyen', 'workflow'],
    },
    {
      id: 'skills',
      label: 'Yetkinlik Matrisi',
      description: 'Personel yetkinlik ve sertifika takibi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
      route: '/app/skills',
      category: 'Sayfalar',
      keywords: ['yetkinlik', 'beceri', 'sertifika'],
    },
    {
      id: 'settings',
      label: 'Ayarlar',
      description: 'Sistem ayarları ve tercihler',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
      route: '/app/settings',
      category: 'Sayfalar',
      keywords: ['tercih', 'konfigürasyon', 'yapılandırma'],
    },
    {
      id: 'kpi-overview',
      label: 'KPI Göstergeleri',
      description: 'Performans metrikleri ve hedef takibi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      route: '/app/kpi-overview',
      category: 'Sayfalar',
      keywords: ['kpi', 'performans', 'metrik', 'gösterge', 'hedef'],
    },
  ];

  readonly filteredItems = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return [];
    return this.items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q)),
    );
  });

  readonly categories = computed(() => {
    const map = new Map<string, SearchItem[]>();
    for (const item of this.items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  });

  @HostListener('document:keydown.meta.k', ['$event'])
  @HostListener('document:keydown.control.k', ['$event'])
  onKeydown(event: Event): void {
    event.preventDefault();
    this.toggle();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.close();
  }

  toggle(): void {
    this.visible.update((v) => !v);
    if (!this.visible()) this.query.set('');
    this.selectedIndex.set(0);
  }

  close(): void {
    this.visible.set(false);
    this.query.set('');
  }

  moveSelection(dir: number): void {
    const items = this.filteredItems();
    if (items.length === 0) return;
    this.selectedIndex.update((i) => {
      const next = i + dir;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  }

  select(index: number): void {
    const items = this.filteredItems();
    if (items[index]) {
      this.navigate(items[index].route);
      this.close();
    }
  }

  navigate(route: string): void {
    this.router.navigateByUrl(route);
  }
}
