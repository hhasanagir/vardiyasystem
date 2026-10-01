import { Injectable, Renderer2, RendererFactory2, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private renderer: Renderer2;
  private mediaQuery: MediaQueryList;

  readonly mode = signal<ThemeMode>(this.loadMode());
  readonly resolved = computed(() => {
    const m = this.mode();
    if (m === 'system') {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return m;
  });

  readonly isDark = computed(() => this.resolved() === 'dark');
  readonly isLight = computed(() => this.resolved() === 'light');

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    this.mediaQuery.addEventListener('change', () => {
      if (this.mode() === 'system') {
        this.applyTheme();
      }
    });

    effect(() => {
      this.applyTheme();
      this.saveMode(this.mode());
    });
  }

  private loadMode(): ThemeMode {
    const stored = localStorage.getItem('vardiya-theme') as ThemeMode | null;
    return stored ?? 'system';
  }

  private saveMode(mode: ThemeMode): void {
    localStorage.setItem('vardiya-theme', mode);
  }

  private applyTheme(): void {
    const isDark = this.resolved();
    const html = document.documentElement;

    if (isDark === 'dark') {
      this.renderer.addClass(html, 'dark');
    } else {
      this.renderer.removeClass(html, 'dark');
    }

    this.renderer.setAttribute(html, 'data-theme', isDark);
    this.renderer.setAttribute(html, 'data-p-theme', isDark);
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  toggle(): void {
    const next = this.isDark() ? 'light' : 'dark';
    this.mode.set(next);
  }
}
