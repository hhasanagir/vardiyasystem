import { Component, inject, ChangeDetectionStrategy, OnInit, signal } from '@angular/core';
import { ScheduleApiService } from '../../services/schedule-api.service';
import { mapActivitiesToAuditEntries, type AuditEntry } from './audit-panel.mapper';

@Component({
  selector: 'app-audit-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="audit-panel">
      <div class="panel-header">
        <h4>Denetim Kaydı</h4>
      </div>
      <div class="panel-body">
        @if (loading()) {
          <div class="empty-audit">Denetim kayıtları yükleniyor…</div>
        } @else if (error()) {
          <div class="empty-audit">{{ error() }}</div>
        } @else if (entries().length > 0) {
          <div class="audit-timeline">
            @for (entry of entries(); track entry.when + entry.what + entry.who) {
              <div class="audit-entry">
                <div class="entry-dot"></div>
                <div class="entry-content">
                  <div class="entry-what">{{ entry.what }}</div>
                  <div class="entry-meta">
                    <span class="entry-who">{{ entry.who }}</span>
                    <span class="entry-when">{{ entry.when }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="empty-audit">Denetim kaydı mevcut değil.</div>
        }
      </div>
    </div>
  `,
  styles: [
    '.audit-panel { height: 100%; display: flex; flex-direction: column; }',
    '.panel-header { padding: 12px 16px; border-bottom: 1px solid var(--surface-border, #e2e8f0); }',
    '.panel-header h4 { margin: 0; font-size: 13px; font-weight: 600; }',
    '.panel-body { padding: 16px; flex: 1; overflow-y: auto; }',
    '.audit-timeline { display: flex; flex-direction: column; gap: 0; }',
    '.audit-entry { display: flex; gap: 12px; padding: 10px 0; border-left: 2px solid var(--surface-border, #e2e8f0); padding-left: 16px; margin-left: 4px; }',
    '.entry-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-info, #3b82f6); margin-left: -21px; margin-top: 4px; flex-shrink: 0; }',
    '.entry-content { flex: 1; }',
    '.entry-what { font-size: 12px; font-weight: 500; color: var(--color-text, #1e293b); }',
    '.entry-meta { display: flex; gap: 8px; margin-top: 2px; }',
    '.entry-who { font-size: 11px; color: var(--color-text-secondary, #64748b); }',
    '.entry-when { font-size: 11px; color: var(--color-text-muted, #94a3b8); }',
    '.empty-audit { padding: 40px 16px; text-align: center; color: var(--color-text-muted, #94a3b8); font-size: 13px; }',
  ],
})
export class AuditPanelComponent implements OnInit {
  private readonly api = inject(ScheduleApiService);

  readonly entries = signal<AuditEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getActivities(10).subscribe({
      next: activities => {
        this.entries.set(mapActivitiesToAuditEntries(activities));
        this.loading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.error.set('Denetim kayıtları yüklenemedi.');
        this.loading.set(false);
      },
    });
  }
}
