import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, ViewChild, HostListener } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, switchMap, of, catchError, tap } from 'rxjs';
import { ScheduleCommandService } from '../../services/schedule-command.service';
import { ScheduleApiService } from '../../services/schedule-api.service';
import { ScheduleRealtimeService } from '../../services/schedule-realtime.service';
import { OfflineGuard } from '../../services/offline-guard';
import { ScheduleStore, type ScheduleTab } from '../../store/schedule.store';
import { classifyHttpError } from '../../models';
import { NotificationService } from '../../../../services/notification.service';
import { ScheduleToolbarComponent } from '../../components/schedule-toolbar/schedule-toolbar.component';
import { ScheduleGridComponent } from '../../components/schedule-grid/schedule-grid.component';
import { ConflictPanelComponent } from '../../components/conflict-panel/conflict-panel.component';
import { ValidationPanelComponent } from '../../components/validation-panel/validation-panel.component';
import { FairnessPanelComponent } from '../../components/fairness-panel/fairness-panel.component';
import { CoveragePanelComponent } from '../../components/coverage-panel/coverage-panel.component';
import { VersionPanelComponent } from '../../components/version-panel/version-panel.component';
import { ApprovalPanelComponent } from '../../components/approval-panel/approval-panel.component';
import { GenerateDialogComponent } from '../../components/generate-dialog/generate-dialog.component';
import { PublishDialogComponent } from '../../components/publish-dialog/publish-dialog.component';
import { ConnectionIndicatorComponent } from '../../components/connection-indicator/connection-indicator.component';
import { ViewSwitcherComponent, type ViewMode } from '../../components/view-switcher/view-switcher.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { SearchInputComponent } from '../../components/search-input/search-input.component';
import { MobileDayViewComponent } from '../../components/mobile-day-view/mobile-day-view.component';
import { PersonnelViewComponent } from '../../components/personnel-view/personnel-view.component';
import { DeviceViewComponent } from '../../components/device-view/device-view.component';
import { CoverageViewComponent } from '../../components/coverage-view/coverage-view.component';
import { ConflictViewComponent } from '../../components/conflict-view/conflict-view.component';

@Component({
  selector: 'app-schedule-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ScheduleToolbarComponent,
    ScheduleGridComponent,
    ConflictPanelComponent,
    ValidationPanelComponent,
    FairnessPanelComponent,
    CoveragePanelComponent,
    VersionPanelComponent,
    ApprovalPanelComponent,
    GenerateDialogComponent,
    PublishDialogComponent,
    ConnectionIndicatorComponent,
    ViewSwitcherComponent,
    FilterBarComponent,
    SearchInputComponent,
    MobileDayViewComponent,
    PersonnelViewComponent,
    DeviceViewComponent,
    CoverageViewComponent,
    ConflictViewComponent,
  ],
  template: `
    <div class="schedule-workspace" [class.is-mobile]="isMobile()">
      <app-connection-indicator />

      <app-schedule-toolbar
        [scheduleId]="store.scheduleId()"
        [status]="store.status()"
        [version]="store.version()"
        [loading]="store.loading()"
        [executing]="cmdService.executing()"
        [isEditable]="store.isEditable()"
        [score]="store.overallScore()"
        [generating]="store.generating()"
        [connectionState]="store.connectionState()"
        (unitChange)="onUnitChange($event)"
        (monthChange)="onMonthChange($event)"
        (validate)="onValidate()"
        (submitReview)="onSubmitReview()"
        (approve)="onApprove()"
        (reject)="onReject()"
        (publish)="onPublish()"
        (archive)="onArchive()"
        (revertToDraft)="onRevertToDraft()"
        (rollback)="onRollback($event)"
        (refresh)="onRefresh()"
        (generate)="onGenerate()"
      />

      <!-- Score Header -->
      @if (store.scheduleScore(); as score) {
        <div class="score-header">
          <div class="score-item">
            <span class="score-label">Puan</span>
            <span class="score-value" [class.high]="score.overall >= 80" [class.mid]="score.overall >= 60 && score.overall < 80" [class.low]="score.overall < 60">
              {{ score.overall | number:'1.0-1' }}<span class="score-max">/100</span>
            </span>
          </div>
          <div class="score-item">
            <span class="score-label">Kademe</span>
            <span class="score-value" [class.high]="score.coverage >= 90" [class.warn]="score.coverage < 90">{{ score.coverage | number:'1.0-1' }}%</span>
          </div>
          <div class="score-item">
            <span class="score-label">Adalet</span>
            <span class="score-value" [class.high]="score.fairness >= 80" [class.warn]="score.fairness < 80">{{ score.fairness | number:'1.0-1' }}</span>
          </div>
          <div class="score-item">
            <span class="score-label">Ihlal</span>
            <span class="score-value" [class.ok]="score.hardViolations === 0" [class.error]="score.hardViolations > 0">{{ score.hardViolations }}</span>
          </div>
        </div>
      }

      <!-- Version Conflict Overlay -->
      @if (store.hasVersionConflict()) {
        <div class="conflict-overlay">
          <div class="conflict-dialog">
            <div class="conflict-icon">!</div>
            <h3>Surum Cakismasi</h3>
            <p>Bu plan baska bir kullanici tarafindan guncellendi.</p>
            <div class="conflict-versions">
              <span class="your-version">Surumunuz: v{{ store.versionConflict().localVersion }}</span>
              <span class="server-version">Sunucu: v{{ store.versionConflict().serverVersion }}</span>
            </div>
            <div class="conflict-actions">
              <button class="btn-secondary" (click)="onResolveConflict('reload')">Sunucudan Yukle</button>
              <button class="btn-secondary" (click)="onResolveConflict('compare')">Karsilastir</button>
              <button class="btn-primary" (click)="onResolveConflict('keep')">Korumaya Devam Et</button>
            </div>
          </div>
        </div>
      }

      <!-- Offline Warning -->
      @if (offlineGuard.isOffline() && store.schedule()) {
        <div class="offline-banner" role="alert">
          <span class="offline-icon">!</span>
          <span>Cevrimdisi: Publish, Approve ve Rollback islemleri su an calistirilamaz.</span>
        </div>
      }

      <div class="workspace-toolbar-row">
        <app-view-switcher (viewChange)="onViewChange($event)" />
        <app-search-input />
      </div>

      @if (!isMobile() && viewMode() === 'grid') {
        <app-filter-bar (filterChange)="onFilterChange($event)" />
      }

      <div class="workspace-body">
        <div class="workspace-grid-area">
          @if (store.loading()) {
            <div class="workspace-loading">
              <div class="spinner"></div>
              <span>Plan yukleniyor...</span>
            </div>
          } @else if (store.generating()) {
            <div class="workspace-loading">
              <div class="spinner"></div>
              <span>Vardiya plani uretiliyor...</span>
              @if (store.generatingProgress() > 0) {
                <div class="progress-text">{{ store.generatingProgress() }}%</div>
              }
            </div>
          } @else if (store.publishing()) {
            <div class="workspace-loading">
              <div class="spinner"></div>
              <span>Plan yayinlaniyor...</span>
            </div>
          } @else if (store.error()) {
            <div class="workspace-error">
              <span class="error-icon">!</span>
              <span>{{ store.error() }}</span>
              @if (store.activeError()?.retryable) {
                <button (click)="onRefresh()">Tekrar Dene</button>
              }
            </div>
          } @else if (!store.schedule()) {
            <div class="workspace-empty">
              <h3>Plan bulunamadi</h3>
              <p>Bu birim ve ay icin plan olusturulmamis.</p>
              <button class="btn-primary" (click)="onCreateSchedule()">Yeni Plan Olustur</button>
            </div>
          } @else {
            <!-- Mobile: day-by-day view -->
            @if (isMobile()) {
              <app-mobile-day-view />
            } @else {
              @switch (viewMode()) {
                @case ('grid') {
                  <app-schedule-grid
                    [selectedAssignmentId]="store.selectedAssignmentId()"
                    [isEditable]="store.isEditable()"
                    (assignmentClick)="onAssignmentClick($event)"
                    (cellClick)="onCellClick($event)"
                  />
                }
                @case ('personnel') { <app-personnel-view /> }
                @case ('device') { <app-device-view /> }
                @case ('coverage') { <app-coverage-view /> }
                @case ('conflicts') { <app-conflict-view /> }
                @default {
                  <app-schedule-grid
                    [selectedAssignmentId]="store.selectedAssignmentId()"
                    [isEditable]="store.isEditable()"
                    (assignmentClick)="onAssignmentClick($event)"
                    (cellClick)="onCellClick($event)"
                  />
                }
              }
            }
          }
        </div>

        <div class="workspace-panels">
          <div class="panel-tabs">
            @for (tab of tabs(); track tab.id) {
              <button class="panel-tab" [class.active]="store.activeTab() === tab.id" (click)="store.setActiveTab(tab.id)">
                {{ tab.label }}
                @if (tab.badge()) {
                  <span class="badge" [class]="tab.badgeClass()">{{ tab.badge() }}</span>
                }
              </button>
            }
          </div>
          <div class="panel-content">
            @switch (store.activeTab()) {
              @case ('conflicts') { <app-conflict-panel /> }
              @case ('validation') { <app-validation-panel /> }
              @case ('fairness') { <app-fairness-panel /> }
              @case ('coverage') { <app-coverage-panel /> }
              @case ('versions') { <app-version-panel /> }
              @case ('approval') { <app-approval-panel /> }
              @default { <app-conflict-panel /> }
            }
          </div>
        </div>
      </div>

      <app-generate-dialog #generateDialog (resultReady)="onGenerationComplete()" />
      <app-publish-dialog #publishDialog (confirm)="onPublishConfirm()" />
    </div>
  `,
  styles: [`
    .schedule-workspace {
      display: flex; flex-direction: column; height: 100%;
      background: var(--surface-ground, #f8fafc);
    }
    .score-header {
      display: flex; align-items: center; gap: 24px;
      padding: 8px 16px; background: var(--surface-card, #fff);
      border-bottom: 1px solid var(--surface-border, #e2e8f0);
    }
    .score-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .score-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }
    .score-value { font-size: 16px; font-weight: 700; color: #1e293b; }
    .score-value.high { color: #10b981; }
    .score-value.mid { color: #f59e0b; }
    .score-value.low { color: #ef4444; }
    .score-value.ok { color: #10b981; }
    .score-value.error { color: #ef4444; }
    .score-value.warn { color: #f59e0b; }
    .score-max { font-size: 11px; font-weight: 400; color: #94a3b8; }
    .offline-banner {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 16px; background: #fef3c7; color: #92400e;
      font-size: 12px; font-weight: 500;
    }
    .offline-icon {
      width: 18px; height: 18px; border-radius: 50%;
      background: #f59e0b; color: white; display: flex;
      align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
    }
    .conflict-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 2000;
    }
    .conflict-dialog {
      background: white; border-radius: 12px; padding: 24px; width: 400px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .conflict-icon {
      width: 40px; height: 40px; border-radius: 50%; background: #fef3c7;
      color: #f59e0b; display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 700; margin: 0 auto 8px;
    }
    .conflict-dialog h3 { margin: 0 0 8px; font-size: 16px; }
    .conflict-dialog p { margin: 0 0 16px; font-size: 13px; color: #64748b; }
    .conflict-versions { display: flex; justify-content: center; gap: 16px; margin-bottom: 20px; }
    .your-version, .server-version {
      padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
    }
    .your-version { background: #fee2e2; color: #991b1b; }
    .server-version { background: #dbeafe; color: #1e40af; }
    .conflict-actions { display: flex; justify-content: center; gap: 8px; }
    .btn-secondary {
      padding: 8px 14px; border: 1px solid #e2e8f0; border-radius: 6px;
      background: white; font-size: 12px; cursor: pointer;
    }
    .btn-primary {
      padding: 8px 14px; border: none; border-radius: 6px;
      background: #6366f1; color: white; font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .workspace-toolbar-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; gap: 12px;
      background: var(--surface-card, #fff);
      border-bottom: 1px solid var(--surface-border, #e2e8f0);
    }
    .workspace-body { display: flex; flex: 1; overflow: hidden; }
    .workspace-grid-area { flex: 1; overflow: auto; min-width: 0; }
    .workspace-panels {
      width: 360px; border-left: 1px solid var(--surface-border, #e2e8f0);
      display: flex; flex-direction: column; background: var(--surface-card, #fff);
    }
    .panel-tabs {
      display: flex; border-bottom: 1px solid var(--surface-border, #e2e8f0);
      overflow-x: auto; scrollbar-width: none;
    }
    .panel-tabs::-webkit-scrollbar { display: none; }
    .panel-tab {
      padding: 10px 14px; font-size: 12px; font-weight: 500;
      color: var(--text-color-secondary, #64748b); background: none;
      border: none; border-bottom: 2px solid transparent; cursor: pointer;
      white-space: nowrap; transition: all 0.15s;
    }
    .panel-tab:hover { color: var(--text-color, #1e293b); }
    .panel-tab.active {
      color: var(--primary-color, #6366f1);
      border-bottom-color: var(--primary-color, #6366f1);
    }
    .badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; margin-left: 4px;
      border-radius: 9px; font-size: 10px; font-weight: 600; color: white;
    }
    .badge-error { background: #ef4444; }
    .badge-warning { background: #f59e0b; }
    .panel-content { flex: 1; overflow-y: auto; }
    .workspace-loading, .workspace-error, .workspace-empty {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100%; gap: 12px;
      color: var(--text-color-secondary, #64748b);
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--surface-border, #e2e8f0);
      border-top-color: var(--primary-color, #6366f1);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-text { font-size: 13px; font-weight: 600; color: #6366f1; }
    .error-icon {
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 50%;
      background: #fef2f2; color: #ef4444; font-weight: 700; font-size: 20px;
    }
    .workspace-empty h3 { margin: 0; font-size: 16px; color: var(--text-color, #1e293b); }
    .workspace-empty p { margin: 0; font-size: 13px; }
    .btn-primary {
      padding: 8px 20px; background: var(--primary-color, #6366f1);
      color: white; border: none; border-radius: 6px;
      font-size: 13px; font-weight: 500; cursor: pointer;
    }
    .btn-primary:hover { opacity: 0.9; }

    @media (max-width: 1024px) {
      .workspace-panels { width: 300px; }
      .score-header { gap: 16px; padding: 8px 12px; }
    }
    @media (max-width: 768px) {
      .workspace-body { flex-direction: column; }
      .workspace-panels { width: 100%; height: 300px; border-left: none; border-top: 1px solid var(--surface-border, #e2e8f0); }
      .workspace-toolbar-row { flex-wrap: wrap; }
    }
    .is-mobile .workspace-panels { display: none; }
  `],
})
export class ScheduleWorkspaceComponent implements OnInit, OnDestroy {
  readonly store = inject(ScheduleStore);
  readonly cmdService = inject(ScheduleCommandService);
  readonly offlineGuard = inject(OfflineGuard);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ScheduleApiService);
  private readonly realtime = inject(ScheduleRealtimeService);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('generateDialog') generateDialog!: GenerateDialogComponent;
  @ViewChild('publishDialog') publishDialog!: PublishDialogComponent;

  readonly viewMode = signal<ViewMode>('grid');
  readonly isMobile = signal(false);

  readonly tabs = computed(() => [
    { id: 'conflicts' as ScheduleTab, label: 'Cakismalar', badge: () => this.store.conflicts().length || null, badgeClass: () => 'badge-error' },
    { id: 'validation' as ScheduleTab, label: 'Dogrulama', badge: () => this.store.hardViolationCount() > 0 ? this.store.hardViolationCount() : null, badgeClass: () => 'badge-error' },
    { id: 'fairness' as ScheduleTab, label: 'Adalet', badge: () => null, badgeClass: () => '' },
    { id: 'coverage' as ScheduleTab, label: 'Kademe', badge: () => null, badgeClass: () => '' },
    { id: 'versions' as ScheduleTab, label: 'Surumler', badge: () => null, badgeClass: () => '' },
    { id: 'approval' as ScheduleTab, label: 'Onay', badge: () => null, badgeClass: () => '' },
  ]);

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile.set(window.innerWidth < 768);
  }

  ngOnInit(): void {
    this.isMobile.set(window.innerWidth < 768);

    this.route.paramMap.pipe(
      takeUntil(this.destroy$),
      switchMap(params => {
        const unitId = params.get('unitId');
        const year = Number(params.get('year'));
        const month = Number(params.get('month'));
        if (unitId && year && month) {
          return this.api.list({ unitId, year, month }).pipe(
            tap(schedules => {
              if (schedules.length > 0) {
                this.store.loadSchedule(schedules[0]);
                this.realtime.subscribe(schedules[0].id);
                this.onValidate();
              }
            }),
            catchError(err => {
              this.store.setError('Plan yuklenemedi');
              return of(null);
            }),
          );
        }
        return of(null);
      }),
    ).subscribe();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const tab = params.get('tab') as ScheduleTab | null;
      if (tab) this.store.setActiveTab(tab);
      const highlight = params.get('highlight');
      if (highlight) this.store.selectAssignment(highlight);
      const view = params.get('view') as ViewMode | null;
      if (view) this.viewMode.set(view);
    });
  }

  ngOnDestroy(): void {
    this.realtime.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onViewChange(view: ViewMode): void {
    this.viewMode.set(view);
    this.router.navigate([], { relativeTo: this.route, queryParams: { view }, queryParamsHandling: 'merge' });
  }

  onFilterChange(_filters: unknown): void {
    // Filters applied via store - client-side filtering for now
  }

  onUnitChange(unitId: string): void {
    this.store.clearAll();
    const params = this.route.snapshot.paramMap;
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (year && month) this.router.navigate(['/app/schedules', unitId, year, month]);
  }

  onMonthChange(value: { month: number; year: number }): void {
    const unitId = this.route.snapshot.paramMap.get('unitId');
    if (unitId) this.router.navigate(['/app/schedules', unitId, value.year, value.month]);
  }

  onValidate(): void {
    const id = this.store.scheduleId();
    if (id) {
      this.cmdService.validate(id).pipe(
        tap(() => this.notification.success('Dogrulama', 'Plan dogrulandı')),
        catchError(err => { this.handleError(err, 'validate'); return of(null); }),
      ).subscribe();
    }
  }

  onSubmitReview(): void {
    const id = this.store.scheduleId();
    if (id) {
      this.cmdService.submitForReview(id).pipe(
        tap(() => this.notification.success('Inceleme', 'Plan incelemeye gonderildi')),
        catchError(err => { this.handleError(err, 'submitForReview'); return of(null); }),
      ).subscribe();
    }
  }

  onApprove(): void {
    const id = this.store.scheduleId();
    if (id) {
      this.cmdService.approve(id).pipe(
        tap(() => this.notification.success('Onay', 'Plan onaylandi')),
        catchError(err => { this.handleError(err, 'approve'); return of(null); }),
      ).subscribe();
    }
  }

  onReject(): void {
    const id = this.store.scheduleId();
    if (id) this.cmdService.reject(id, 'Reddedildi').subscribe();
  }

  onPublish(): void {
    if (!this.offlineGuard.canExecute('publish')) {
      this.notification.warning('Cevrimdisi', 'Publish islemi cevrimdisi calistirilamaz');
      return;
    }
    this.publishDialog.openDialog();
  }

  onPublishConfirm(): void {
    const id = this.store.scheduleId();
    if (id) {
      this.cmdService.publish(id).pipe(
        tap(() => {
          this.notification.success('Yayin', 'Plan yayinlandi');
          this.publishDialog.reset();
        }),
        catchError(err => { this.handleError(err, 'publish'); this.publishDialog.reset(); return of(null); }),
      ).subscribe();
    }
  }

  onArchive(): void {
    const id = this.store.scheduleId();
    if (id) this.cmdService.archive(id).subscribe();
  }

  onRevertToDraft(): void {
    const id = this.store.scheduleId();
    if (id && confirm('Taslaga donmek istediginize emin misiniz?')) {
      this.cmdService.revertToDraft(id).subscribe();
    }
  }

  onRollback(targetVersion: number): void {
    const id = this.store.scheduleId();
    if (!this.offlineGuard.canExecute('rollback')) {
      this.notification.warning('Cevrimdisi', 'Rollback islemi cevrimdisi calistirilamaz');
      return;
    }
    if (id) this.cmdService.rollback(id, targetVersion, 'Geri alindi').subscribe();
  }

  onRefresh(): void {
    this.store.setActiveError(null);
    const params = this.route.snapshot.paramMap;
    const unitId = params.get('unitId');
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (unitId && year && month) this.cmdService.loadSchedules({ unitId, year, month }).subscribe();
  }

  onCreateSchedule(): void {
    const params = this.route.snapshot.paramMap;
    const unitId = params.get('unitId');
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (unitId && year && month) this.cmdService.createSchedule(unitId, month, year).subscribe();
  }

  onGenerate(): void {
    this.generateDialog.openDialog();
  }

  onGenerationComplete(): void {
    this.notification.success('Uretim', 'Vardiya plani uretildi');
    this.onValidate();
  }

  onAssignmentClick(assignmentId: string): void {
    this.store.selectAssignment(assignmentId);
    this.router.navigate([], { relativeTo: this.route, queryParams: { highlight: assignmentId }, queryParamsHandling: 'merge' });
  }

  onCellClick(date: string): void {
    this.store.selectCell(date);
  }

  onResolveConflict(action: 'reload' | 'compare' | 'keep'): void {
    this.store.resolveVersionConflict();
    if (action === 'reload') this.onRefresh();
    else if (action === 'compare') this.store.setActiveTab('versions');
  }

  private handleError(err: unknown, context: string): void {
    const apiErr = err as { statusCode?: number; message?: string; serverVersion?: number; localVersion?: number; scheduleId?: string };
    if (apiErr?.statusCode === 409) {
      this.store.triggerVersionConflict(apiErr.localVersion ?? 0, apiErr.serverVersion ?? 0, apiErr.scheduleId ?? '');
    } else {
      const error = classifyHttpError(apiErr?.statusCode ?? 500, apiErr ?? {}, context);
      this.store.setActiveError(error);
      this.notification.error('Hata', error.userMessage);
    }
  }
}
