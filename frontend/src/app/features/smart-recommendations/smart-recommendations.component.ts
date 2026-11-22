import { Component, signal, computed, inject, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { NotificationService } from '../../services/notification.service';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

interface RecommendationDto {
  id: string;
  type: string;
  priority: string;
  score: number | null;
  title: string;
  description: string;
  impactFatigue: number | null;
  impactFairness: number | null;
  impactCoverage: number | null;
  impactOverall: number | null;
  shiftIds: string[] | null;
  userIds: string[] | null;
  suggestedActionData: unknown;
  createdAt: string;
}

const REC_SOURCES: Record<string, string> = {
  swap: 'Değişim',
  coverage: 'Kapsama',
  fairness: 'Adalet',
  fatigue: 'Yorgunluk',
  training: 'Eğitim',
  compliance: 'Uyum',
};

interface Recommendation {
  id: string;
  type: 'swap' | 'coverage' | 'fairness' | 'fatigue' | 'training' | 'compliance';
  title: string;
  description: string;
  impact: { label: string; value: string; color: string }[];
  priority: 'high' | 'medium' | 'low';
  source: string;
  createdAt: string;
  actionable: boolean;
}

@Component({
  selector: 'app-smart-recommendations',
  standalone: true,
  imports: [CommonModule, BadgeComponent, EmptyStateComponent],
  template: `
    <div class="recs-page">
      <div class="recs-header">
        <div>
          <h1>Akıllı Öneriler</h1>
          <p class="recs-subtitle">Kural ve analiz motoru tarafından üretilen vardiya optimizasyon önerileri</p>
        </div>
        <div class="recs-summary">
          <div class="recs-stat">
            <span class="recs-stat-value">{{ highPriority() }}</span>
            <span class="recs-stat-label">Yüksek Öncelik</span>
          </div>
          <div class="recs-stat">
            <span class="recs-stat-value">{{ mediumPriority() }}</span>
            <span class="recs-stat-label">Orta</span>
          </div>
          <div class="recs-stat">
            <span class="recs-stat-value">{{ lowPriority() }}</span>
            <span class="recs-stat-label">Düşük</span>
          </div>
        </div>
      </div>

      @if (loadError()) {
        <div class="recs-note">Öneriler yüklenemedi: {{ loadError() }}</div>
      }
      @if (loading()) {
        <div class="recs-note">Öneriler yükleniyor...</div>
      }

      <!-- Filters -->
      <div class="recs-filters" role="tablist" aria-label="Öneri filtreleri">
        @for (f of filters; track f.id) {
          <button class="recs-filter" [class.active]="activeFilter() === f.id" (click)="activeFilter.set(f.id)" role="tab" [attr.aria-selected]="activeFilter() === f.id">
            {{ f.label }}
            @if (f.id === 'all') { <span class="filter-count">{{ recommendations().length }}</span> }
            @if (f.id === 'high') { <span class="filter-count f-high">{{ highPriority() }}</span> }
          </button>
        }
      </div>

      <!-- Recommendations List -->
      <div class="recs-list" role="list">
        @for (rec of filtered(); track rec.id) {
          <div class="rec-card" [class]="'rec-priority-' + rec.priority" role="listitem">
            <div class="rec-left">
              <div class="rec-icon" [class]="'rec-icon-' + rec.type">
                @if (rec.type === 'swap') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
                } @else if (rec.type === 'coverage') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                } @else if (rec.type === 'fairness') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                }
              </div>
            </div>
            <div class="rec-content">
              <div class="rec-title-row">
                <span class="rec-title">{{ rec.title }}</span>
                <app-badge [severity]="rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'info'">{{ rec.priority === 'high' ? 'Yüksek' : rec.priority === 'medium' ? 'Orta' : 'Düşük' }}</app-badge>
              </div>
              <p class="rec-desc">{{ rec.description }}</p>
              <div class="rec-impacts">
                @for (imp of rec.impact; track imp.label) {
                  <div class="rec-impact" [style.color]="imp.color">
                    <span class="rec-impact-value">{{ imp.value }}</span>
                    <span class="rec-impact-label">{{ imp.label }}</span>
                  </div>
                }
              </div>
              <div class="rec-footer">
                <span class="rec-source">{{ rec.source }}</span>
                <span class="rec-time">{{ rec.createdAt }}</span>
                @if (rec.actionable && !busyId()) {
                  <button class="rec-apply" (click)="applyRec(rec)">Uygula</button>
                  <button class="rec-dismiss" (click)="dismissRec(rec)" aria-label="Öneriyi kapat">X</button>
                }
                @if (busyId() === rec.id) {
                  <span class="rec-busy">İşleniyor...</span>
                }
              </div>
            </div>
          </div>
        } @empty {
          <app-empty-state title="Öneri bulunmuyor" description="Tüm metrikler hedef aralığında"/>
        }
      </div>
    </div>
  `,
  styles: [`
    .recs-page { display: flex; flex-direction: column; gap: 1.25rem; }
    .recs-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .recs-header h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
    .recs-subtitle { font-size: 0.875rem; color: var(--text-muted); margin: 0.25rem 0 0; }
    .recs-summary { display: flex; gap: 1rem; }
    .recs-stat { text-align: center; padding: 0.75rem 1.25rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: var(--radius-lg); min-width: 5rem; }
    .recs-stat-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
    .recs-stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }

    .recs-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .recs-filter { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border: 1px solid var(--border-default); border-radius: 9999px; background: var(--bg-primary); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; }
    .recs-filter.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .filter-count { padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.65rem; background: var(--bg-hover); }
    .recs-filter.active .filter-count { background: rgba(255,255,255,0.2); }
    .f-high { background: rgba(239,68,68,0.15); color: #ef4444; }

    .recs-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .rec-card { display: flex; gap: 1rem; padding: 1rem 1.25rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: var(--radius-lg); }
    .rec-high { border-left: 3px solid var(--status-danger); }
    .rec-medium { border-left: 3px solid var(--status-warning); }
    .rec-low { border-left: 3px solid var(--status-info); }
    .rec-left { flex-shrink: 0; }
    .rec-icon { width: 2.5rem; height: 2.5rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; }
    .rec-icon-swap { background: rgba(139,92,246,0.15); color: #a78bfa; }
    .rec-icon-coverage { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .rec-icon-fairness { background: rgba(34,197,94,0.15); color: #4ade80; }
    .rec-icon-training { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .rec-icon-compliance { background: rgba(6,182,212,0.15); color: #22d3ee; }
    .rec-icon-fatigue { background: rgba(239,68,68,0.15); color: #f87171; }
    .rec-content { flex: 1; min-width: 0; }
    .rec-title-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .rec-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
    .rec-desc { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.75rem; }
    .rec-impacts { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
    .rec-impact { display: flex; flex-direction: column; align-items: center; }
    .rec-impact-value { font-size: 1rem; font-weight: 700; line-height: 1; }
    .rec-impact-label { font-size: 0.65rem; text-transform: uppercase; opacity: 0.7; }
    .rec-footer { display: flex; align-items: center; gap: 0.75rem; font-size: 0.7rem; color: var(--text-muted); }
    .rec-source { padding: 0.125rem 0.5rem; background: var(--bg-secondary); border-radius: var(--radius-sm); }
    .rec-apply { margin-left: auto; padding: 0.25rem 0.75rem; background: var(--primary); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 0.7rem; cursor: pointer; }
    .rec-dismiss { padding: 0.25rem 0.5rem; background: transparent; color: var(--text-muted); border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 0.7rem; cursor: pointer; }
    .rec-dismiss:hover { background: var(--bg-hover); }
    .recs-note { margin: 0 0 1rem; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--bg-secondary); border: 1px solid var(--border-default); font-size: 0.75rem; color: var(--text-muted); }
    .rec-busy { font-size: 0.7rem; color: var(--text-muted); margin-left: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartRecommendationsComponent implements OnInit, OnDestroy {
  protected activeFilter = signal<'all' | 'high' | 'medium' | 'low'>('all');

  protected readonly filters = [
    { id: 'all' as const, label: 'Tümü' },
    { id: 'high' as const, label: 'Yüksek Öncelik' },
    { id: 'medium' as const, label: 'Orta' },
    { id: 'low' as const, label: 'Düşük' },
  ];

  private readonly api = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  protected readonly recommendations = signal<Recommendation[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly highPriority = computed(() => this.recommendations().filter(r => r.priority === 'high').length);
  protected readonly mediumPriority = computed(() => this.recommendations().filter(r => r.priority === 'medium').length);
  protected readonly lowPriority = computed(() => this.recommendations().filter(r => r.priority === 'low').length);

  protected readonly filtered = computed(() => {
    const f = this.activeFilter();
    if (f === 'all') return this.recommendations();
    return this.recommendations().filter(r => r.priority === f);
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.get<{ data: RecommendationDto[] }>('/recommendations').pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        const data = res?.data || [];
        this.recommendations.set(data.map(dto => this.mapRecommendation(dto)));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.message || 'Öneriler yüklenemedi.');
        this.recommendations.set([]);
      }
    });
  }

  protected applyRec(rec: Recommendation): void {
    if (this.busyId()) return;
    this.busyId.set(rec.id);
    this.api.post<unknown>(`/recommendations/${rec.id}/apply`, {}).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notification.success('Uygulandı', `"${rec.title}" işleme alındı.`);
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.notification.error('Uygulama Hatası', err?.message || 'Öneri uygulanamadı.');
      }
    });
  }

  protected dismissRec(rec: Recommendation): void {
    if (this.busyId()) return;
    this.busyId.set(rec.id);
    this.api.post<unknown>(`/recommendations/${rec.id}/dismiss`, {}).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notification.success('Kapatıldı', 'Öneri listeden kaldırıldı.');
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.notification.error('Kapatma Hatası', err?.message || 'Öneri kapatılamadı.');
      }
    });
  }

  private mapRecommendation(dto: RecommendationDto): Recommendation {
    const impact: Recommendation['impact'] = [];
    const addImpact = (label: string, value: number | null, color: string): void => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      impact.push({ label, value: `${value > 0 ? '+' : ''}${Math.round(value)}`, color });
    };
    addImpact('Yorgunluk', dto.impactFatigue, '#22c55e');
    addImpact('Adalet', dto.impactFairness, '#3b82f6');
    addImpact('Kapsama', dto.impactCoverage, '#8b5cf6');
    addImpact('Genel', dto.impactOverall, '#6366f1');

    return {
      id: dto.id,
      type: dto.type as Recommendation['type'],
      priority: (dto.priority || 'low').toLowerCase() as 'high' | 'medium' | 'low',
      title: dto.title || 'Öneri',
      description: dto.description || '',
      impact,
      source: REC_SOURCES[dto.type] ? `Sistem · ${REC_SOURCES[dto.type]}` : 'Sistem',
      createdAt: this.formatDate(dto.createdAt),
      actionable: !!dto.suggestedActionData,
    };
  }

  private formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
