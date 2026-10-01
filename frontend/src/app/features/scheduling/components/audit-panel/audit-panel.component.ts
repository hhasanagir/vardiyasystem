import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';
import type { Schedule } from '../../models';

interface AuditEntry {
  who: string;
  what: string;
  when: string;
  fromVersion: number | null;
  toVersion: number | null;
}

@Component({
  selector: 'app-audit-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="audit-panel">
      <div class="panel-header">
        <h4>Denetim Kaydi</h4>
      </div>
      <div class="panel-body">
        @if (auditEntries().length > 0) {
          <div class="audit-timeline">
            @for (entry of auditEntries(); track entry.when + entry.what) {
              <div class="audit-entry">
                <div class="entry-dot"></div>
                <div class="entry-content">
                  <div class="entry-what">{{ entry.what }}</div>
                  <div class="entry-meta">
                    <span class="entry-who">{{ entry.who }}</span>
                    <span class="entry-when">{{ entry.when }}</span>
                  </div>
                  @if (entry.fromVersion !== null && entry.toVersion !== null) {
                    <div class="entry-version">
                      v{{ entry.fromVersion }} &#8594; v{{ entry.toVersion }}
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="empty-audit">Denetim kaydi mevcut degil.</div>
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
    '.entry-version { font-size: 10px; color: var(--color-primary, #6366f1); margin-top: 2px; }',
    '.empty-audit { padding: 40px 16px; text-align: center; color: var(--color-text-muted, #94a3b8); font-size: 13px; }',
  ],
})
export class AuditPanelComponent {
  private readonly store = inject(ScheduleStore);

  readonly auditEntries = computed((): AuditEntry[] => {
    const schedule = this.store.schedule();
    if (!schedule) return [];

    const entries: AuditEntry[] = [];
    const statusLabels: Record<string, string> = {
      draft: 'Olusturuldu',
      generated: 'Vardiya uretildi',
      validated: 'Dogrulandi',
      under_review: 'Incelemeye gonderildi',
      approved: 'Onaylandi',
      published: 'Yayinlandi',
      archived: 'Arslivlendi',
      rejected: 'Reddedildi',
    };

    entries.push({
      who: schedule.createdById ?? 'Sistem',
      what: statusLabels[schedule.status] ?? schedule.status,
      when: '',
      fromVersion: null,
      toVersion: schedule.version,
    });

    return entries;
  });
}
