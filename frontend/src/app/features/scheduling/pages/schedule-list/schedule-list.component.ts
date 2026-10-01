import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { ScheduleApiService } from '../../services/schedule-api.service';
import type { Schedule, ScheduleStatus } from '../../models';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TableModule, ButtonModule, TagModule, CardModule, TooltipModule],
  template: `
    <div class="schedule-list-page">
      <header class="page-header glass">
        <div class="header-left">
          <h1 class="page-title">Vardiya Planları</h1>
          <span class="page-subtitle">Tüm birimlerin vardiya planlarını görüntüleyin ve yönetin</span>
        </div>
        <div class="header-right">
          <button class="action-btn" (click)="refresh()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Yenile
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Planlar yükleniyor...</span>
        </div>
      } @else if (error()) {
        <div class="error-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <h3>Planlar yüklenemedi</h3>
          <p>{{ error() }}</p>
          <button class="action-btn" (click)="refresh()">Tekrar Dene</button>
        </div>
      } @else if (schedules().length === 0) {
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <h3>Henüz plan oluşturulmamış</h3>
          <p>Herhangi bir birim için vardiya planı bulunamadı.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <p-table [value]="schedules()" [paginator]="true" [rows]="15" [showCurrentPageReport]="true"
                   currentPageReportTemplate="{first}-{last} / {totalRecords} plan"
                   [rowsPerPageOptions]="[10, 15, 25, 50]"
                   styleClass="p-datatable-striped"
                   [sortField]="'year'" [sortOrder]="-1">
            <ng-template pTemplate="header">
              <tr>
                <th pSortableColumn="unitId">Birim <p-sortIcon field="unitId"></p-sortIcon></th>
                <th pSortableColumn="year">Yıl <p-sortIcon field="year"></p-sortIcon></th>
                <th pSortableColumn="month">Ay <p-sortIcon field="month"></p-sortIcon></th>
                <th pSortableColumn="status">Durum <p-sortIcon field="status"></p-sortIcon></th>
                <th pSortableColumn="assignments.length">Atama <p-sortIcon field="assignments.length"></p-sortIcon></th>
                <th pSortableColumn="version">Versiyon <p-sortIcon field="version"></p-sortIcon></th>
                <th>İşlemler</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-schedule>
              <tr class="schedule-row" (click)="openSchedule(schedule)">
                <td>
                  <span class="unit-badge" [attr.data-unit]="schedule.unitId">
                    {{ unitLabel(schedule.unitId) }}
                  </span>
                </td>
                <td>{{ schedule.year }}</td>
                <td>{{ monthName(schedule.month) }}</td>
                <td>
                  <p-tag [value]="statusLabel(schedule.status)" [severity]="statusSeverity(schedule.status)"></p-tag>
                </td>
                <td>{{ schedule.assignments.length }}</td>
                <td>v{{ schedule.version }}</td>
                <td>
                  <button pButton icon="pi pi-arrow-right" class="p-button-rounded p-button-text p-button-sm"
                          pTooltip="Planı aç" tooltipPosition="top"
                          (click)="openSchedule(schedule); $event.stopPropagation()"></button>
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="7" class="text-center">Plan bulunamadı.</td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
    </div>
  `,
  styles: [`
    .schedule-list-page {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .page-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: var(--text-color, #e2e8f0);
    }
    .page-subtitle {
      font-size: 0.8rem;
      color: var(--text-color-secondary, #94a3b8);
    }
    .header-right {
      display: flex;
      gap: 0.5rem;
    }
    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: var(--text-color, #e2e8f0);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .action-btn:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
    }
    .loading-state, .error-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      gap: 1rem;
      color: var(--text-color-secondary, #94a3b8);
    }
    .loading-state h3, .error-state h3, .empty-state h3 {
      margin: 0;
      font-size: 1rem;
      color: var(--text-color, #e2e8f0);
    }
    .loading-state p, .error-state p, .empty-state p {
      margin: 0;
      font-size: 0.85rem;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: var(--accent-color, #3b82f6);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .table-wrapper {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      overflow: hidden;
    }
    .schedule-row {
      cursor: pointer;
      transition: background 0.15s;
    }
    .schedule-row:hover {
      background: rgba(255,255,255,0.04) !important;
    }
    .unit-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      background: rgba(59,130,246,0.15);
      color: #60a5fa;
    }
    .unit-badge[data-unit="mr"] { background: rgba(99,102,241,0.15); color: #818cf8; }
    .unit-badge[data-unit="bt"] { background: rgba(14,165,233,0.15); color: #38bdf8; }
    .unit-badge[data-unit="rontgen"] { background: rgba(20,184,166,0.15); color: #2dd4bf; }
    .unit-badge[data-unit="nukleer"] { background: rgba(168,85,247,0.15); color: #c084fc; }
    .unit-badge[data-unit="onkoloji"] { background: rgba(244,63,94,0.15); color: #fb7185; }
    .unit-badge[data-unit="supervizor"] { background: rgba(234,179,8,0.15); color: #facc15; }
    .text-center { text-align: center; }
  `]
})
export class ScheduleListComponent implements OnInit {
  private readonly api = inject(ScheduleApiService);
  private readonly router = inject(Router);

  readonly schedules = signal<Schedule[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly unitLabels: Record<string, string> = {
    mr: 'MR',
    bt: 'BT',
    rontgen: 'Röntgen',
    nukleer: 'Nükleer Tıp',
    onkoloji: 'Radyasyon Onkolojisi',
    supervizor: 'Süpervizör',
  };

  private readonly monthNames = [
    '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  private readonly statusLabels: Record<ScheduleStatus, string> = {
    draft: 'Taslak',
    generated: 'Oluşturuldu',
    validated: 'Doğrulandı',
    under_review: 'İncelemede',
    approved: 'Onaylandı',
    published: 'Yayınlandı',
    archived: 'Arşivlendi',
    rejected: 'Reddedildi',
  };

  private readonly statusSeverities: Record<ScheduleStatus, 'info' | 'warn' | 'success' | 'danger' | 'secondary'> = {
    draft: 'info',
    generated: 'info',
    validated: 'success',
    under_review: 'warn',
    approved: 'success',
    published: 'success',
    archived: 'secondary',
    rejected: 'danger',
  };

  ngOnInit(): void {
    this.loadSchedules();
  }

  unitLabel(unitId: string): string {
    return this.unitLabels[unitId] || unitId;
  }

  monthName(month: number): string {
    return this.monthNames[month] || String(month);
  }

  statusLabel(status: ScheduleStatus): string {
    return this.statusLabels[status] || status;
  }

  statusSeverity(status: ScheduleStatus): 'info' | 'warn' | 'success' | 'danger' | 'secondary' {
    return this.statusSeverities[status] || 'info';
  }

  openSchedule(schedule: Schedule): void {
    this.router.navigate(['/app/schedules', schedule.unitId, schedule.year, schedule.month]);
  }

  refresh(): void {
    this.loadSchedules();
  }

  private loadSchedules(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (schedules) => {
        this.schedules.set(schedules);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message || 'Planlar yüklenemedi');
        this.loading.set(false);
      },
    });
  }
}
