import { Injectable, signal, computed, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageContext } from '../../shared/page-header';
import { KpiCardData } from '../../shared/kpi';

@Injectable({ providedIn: 'root' })
export class PageContextService {
  private router = inject(Router);

  private routeUrl = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    { initialValue: { urlAfterRedirects: this.router.url } as NavigationEnd },
  );

  readonly config = signal<PageContext | null>(null);
  readonly kpis = signal<KpiCardData[]>([]);
  readonly kpiLoading = signal(false);
  readonly kpiError = signal<string | null>(null);

  readonly lastUpdated = signal<Date>(new Date());

  private configMap = new Map<string, PageContext>();

  registerRoute(path: string, config: PageContext): void {
    this.configMap.set(path, config);
  }

  updateConfig(path: string, updates: Partial<PageContext>): void {
    const existing = this.configMap.get(path);
    if (existing) {
      this.configMap.set(path, { ...existing, ...updates });
    }
  }

  setKpis(kpis: KpiCardData[]): void {
    this.kpis.set(kpis);
    this.kpiLoading.set(false);
    this.kpiError.set(null);
    this.lastUpdated.set(new Date());
  }

  setKpiLoading(loading: boolean): void {
    this.kpiLoading.set(loading);
  }

  setKpiError(error: string): void {
    this.kpiError.set(error);
    this.kpiLoading.set(false);
  }

  getConfigForUrl(url: string): PageContext | null {
    for (const [path, config] of this.configMap) {
      if (url.startsWith(path)) return config;
    }
    return null;
  }

  updateCurrentContext(): void {
    const url = this.routeUrl()?.urlAfterRedirects || this.router.url;
    const config = this.getConfigForUrl(url);
    this.config.set(config ?? null);
  }
}
