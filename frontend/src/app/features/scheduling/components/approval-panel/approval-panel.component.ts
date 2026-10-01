import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-approval-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header">
        <h4>Onay Durumu</h4>
      </div>
      <div class="panel-body">
        @if (approval) {
          <div class="approval-timeline">
            @if (approval.submittedBy) {
              <div class="timeline-item">
                <div class="timeline-dot submitted"></div>
                <div class="timeline-content">
                  <div class="timeline-title">İncelemeye Gönderildi</div>
                  <div class="timeline-meta">
                    {{ approval.submittedBy }} - {{ formatDate(approval.submittedAt) }}
                  </div>
                  @if (approval.submittedComment) {
                    <div class="timeline-comment">{{ approval.submittedComment }}</div>
                  }
                </div>
              </div>
            }
            @if (approval.approvedBy) {
              <div class="timeline-item">
                <div class="timeline-dot approved"></div>
                <div class="timeline-content">
                  <div class="timeline-title">Onaylandı</div>
                  <div class="timeline-meta">
                    {{ approval.approvedBy }} - {{ formatDate(approval.approvedAt) }}
                  </div>
                  @if (approval.approvalComment) {
                    <div class="timeline-comment">{{ approval.approvalComment }}</div>
                  }
                </div>
              </div>
            }
            @if (approval.rejectedBy) {
              <div class="timeline-item">
                <div class="timeline-dot rejected"></div>
                <div class="timeline-content">
                  <div class="timeline-title">Reddedildi</div>
                  <div class="timeline-meta">
                    {{ approval.rejectedBy }} - {{ formatDate(approval.rejectedAt) }}
                  </div>
                  @if (approval.rejectionReason) {
                    <div class="timeline-comment rejection">{{ approval.rejectionReason }}</div>
                  }
                </div>
              </div>
            }
            @if (approval.publishedBy) {
              <div class="timeline-item">
                <div class="timeline-dot published"></div>
                <div class="timeline-content">
                  <div class="timeline-title">Yayınlandı</div>
                  <div class="timeline-meta">
                    {{ approval.publishedBy }} - {{ formatDate(approval.publishedAt) }}
                  </div>
                </div>
              </div>
            }
            @if (approval.archivedBy) {
              <div class="timeline-item">
                <div class="timeline-dot archived"></div>
                <div class="timeline-content">
                  <div class="timeline-title">Arşivlendi</div>
                  <div class="timeline-meta">
                    {{ approval.archivedBy }} - {{ formatDate(approval.archivedAt) }}
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="panel-empty">Henüz onay işlemi başlamadı.</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .panel {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .panel-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
      }
      .panel-header h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .panel-body {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }
      .approval-timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .timeline-item {
        display: flex;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid var(--surface-border, #f1f5f9);
      }
      .timeline-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-top: 4px;
        flex-shrink: 0;
      }
      .timeline-dot.submitted {
        background: #f59e0b;
      }
      .timeline-dot.approved {
        background: #10b981;
      }
      .timeline-dot.rejected {
        background: #ef4444;
      }
      .timeline-dot.published {
        background: #3b82f6;
      }
      .timeline-dot.archived {
        background: #6b7280;
      }
      .timeline-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-color, #1e293b);
      }
      .timeline-meta {
        font-size: 10px;
        color: var(--text-color-secondary, #94a3b8);
        margin-top: 2px;
      }
      .timeline-comment {
        font-size: 11px;
        color: var(--text-color-secondary, #475569);
        margin-top: 4px;
        padding: 6px 8px;
        background: var(--surface-hover, #f8fafc);
        border-radius: 4px;
      }
      .timeline-comment.rejection {
        background: #fef2f2;
        color: #991b1b;
      }
      .panel-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--text-color-secondary, #94a3b8);
        font-size: 13px;
      }
    `,
  ],
})
export class ApprovalPanelComponent {
  private readonly store = inject(ScheduleStore);
  get approval() {
    return this.store.approvalData();
  }

  formatDate(date: string | null): string {
    if (!date) return '';
    try {
      return new Date(date).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return date;
    }
  }
}
