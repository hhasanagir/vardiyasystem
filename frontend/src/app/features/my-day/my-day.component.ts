import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ScheduleService,
  MyDayDashboardResponse,
  MyDayTask,
} from '../../services/schedule.service';
import { AttendanceService } from '../../services/attendance.service';
import { ShiftTasksService } from '../../services/shift-tasks.service';
import { getShiftTypeLabel } from '../../domain/enums';

@Component({
  selector: 'app-my-day',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="my-day-page">
      @if (error()) {
        <div class="error-banner">
          <span>{{ error() }}</span>
        </div>
      }

      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-card">
              <div
                class="skeleton-shimmer"
                style="width:100%;height:120px;border-radius:var(--radius-lg)"
              ></div>
            </div>
          }
        </div>
      } @else {
        <div class="dashboard-grid">
          <div class="card shift-card">
            <div class="card-header"><h3>Bugünkü Vardiya</h3></div>
            <div class="card-body">
              @if (data()?.shift; as ts) {
                <div class="shift-display" [class.night]="ts.shiftType === 'night'">
                  <div class="shift-type-badge">{{ ts.shiftLabel }}</div>
                  <div class="shift-times">
                    <span class="shift-time">{{ ts.startTime }}</span>
                    <span class="shift-sep">—</span>
                    <span class="shift-time">{{ ts.endTime }}</span>
                  </div>
                  <span
                    class="badge"
                    [class.badge-success]="ts.isConfirmed"
                    [class.badge-neutral]="!ts.isConfirmed"
                  >
                    {{ ts.isConfirmed ? 'Onaylı' : 'Planlandı' }}
                  </span>
                  <div class="shift-device">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    {{ ts.deviceName || ts.deviceCode || 'Cihaz yok' }}
                  </div>
                  @if (ts.isConfirmed) {
                    <div class="progress-section">
                      <div class="progress-bar">
                        <div class="progress-fill" [style.width.%]="shiftProgress()"></div>
                      </div>
                      <span class="progress-label">%{{ shiftProgress() }} tamamlandı</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-state">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Bugün vardiya yok</span>
                </div>
              }
            </div>
          </div>

          <div class="card tasks-card wide-card">
            <div class="card-header">
              <h3>Görevler</h3>
              <span class="card-badge"
                >{{ data()?.taskProgress?.completed }}/{{ data()?.taskProgress?.total }}</span
              >
            </div>
            <div class="card-body">
              @if (tasks().length === 0) {
                <div class="empty-state-sm"><span>Bugün için görev bulunmuyor</span></div>
              } @else {
                <div class="task-list">
                  @for (task of tasks(); track task.id) {
                    <button
                      class="task-item touch-target"
                      [class.completed]="task.status === 'completed'"
                      (click)="toggleTask(task)"
                    >
                      <span class="task-check" [class.checked]="task.status === 'completed'">
                        @if (task.status === 'completed') {
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        }
                      </span>
                      <span class="task-label">{{ task.label }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          @if ((data()?.activeIncidents?.length ?? 0) > 0) {
            <div class="card incidents-card">
              <div class="card-header">
                <h3>Aktif Arızalar</h3>
                <span class="card-badge badge-error">{{ data()?.activeIncidents?.length }}</span>
              </div>
              <div class="card-body">
                @for (inc of data()?.activeIncidents; track inc.id) {
                  <div
                    class="incident-item touch-target"
                    [class.severity-critical]="inc.severity === 'critical'"
                  >
                    <div class="incident-meta">
                      <span class="incident-type">{{ inc.issueType }}</span>
                      <span class="incident-device">{{
                        inc.deviceName || inc.deviceCode || ''
                      }}</span>
                    </div>
                    <span class="severity-tag" [class]="'sev-' + inc.severity">{{
                      inc.severity
                    }}</span>
                  </div>
                }
              </div>
            </div>
          }

          @if ((data()?.pendingSwapRequests?.length ?? 0) > 0) {
            <div class="card swaps-card">
              <div class="card-header">
                <h3>Bekleyen Vardiya Talepleri</h3>
                <span class="card-badge badge-warn">{{ data()?.pendingSwapRequests?.length }}</span>
              </div>
              <div class="card-body">
                @for (req of data()?.pendingSwapRequests; track req.id) {
                  <div class="swap-item touch-target">
                    <span class="swap-reason">{{ req.reason || 'Sebep belirtilmedi' }}</span>
                    <span class="swap-date">{{ formatRelative(req.createdAt) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <div class="card next-card">
            <div class="card-header"><h3>Sonraki Vardiya</h3></div>
            <div class="card-body">
              @if (data()?.nextShift; as ns) {
                <div class="next-display" [class.night]="ns.shiftType === 'night'">
                  <div class="next-date-row">
                    <span class="next-date">{{ formatDate(ns.date) }}</span>
                    <span class="next-day">{{ getDayName(ns.date) }}</span>
                  </div>
                  <div class="next-type">{{ ns.shiftLabel }}</div>
                  <div class="next-time">{{ ns.startTime }} - {{ ns.endTime }}</div>
                  <div class="next-device">{{ ns.deviceName || ns.deviceCode }}</div>
                  @if (countdownStr()) {
                    <div class="countdown">{{ countdownStr() }}</div>
                  }
                </div>
              } @else {
                <div class="empty-state-sm">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <span>Sonraki vardiya yok</span>
                </div>
              }
            </div>
          </div>

          <div class="card summary-card">
            <div class="card-header"><h3>Kalan Süre</h3></div>
            <div class="card-body">
              @if (data()?.attendance?.status === 'active') {
                <div class="remaining-display">
                  <div class="remaining-value">
                    {{ remainingHours() }}<span class="remaining-unit">sa</span>
                  </div>
                  <div class="remaining-label">vardiya bitimine kalan</div>
                  <div class="elapsed-row">
                    <span class="elapsed-label">Geçen süre:</span>
                    <span class="elapsed-value">{{ elapsedTime() }}</span>
                  </div>
                </div>
              } @else {
                <div class="empty-state-sm">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Vardiya başlatılmadı</span>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <div class="action-bar">
        @if (data()?.attendance; as att) {
          @if (att.status === 'none' || att.status === 'completed') {
            <button class="action-btn action-primary touch-target" (click)="clockIn()">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Vardiya Başlat</span>
            </button>
          }
          @if (att.status === 'active') {
            <button class="action-btn action-danger touch-target" (click)="clockOut()">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Vardiyayı Bitir</span>
            </button>
          }
        }
        <button class="action-btn action-secondary touch-target" (click)="goToSchedule()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Vardiyalarım</span>
        </button>
        <button class="action-btn action-secondary touch-target" (click)="goToSwap()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span>Vardiya Değiş</span>
        </button>
        <button class="action-btn action-secondary touch-target" (click)="goToIncident()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Arıza Bildir</span>
        </button>
        <button class="action-btn action-secondary touch-target" (click)="goToHandover()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>Devir Notu</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .my-day-page {
        padding: 12px 16px;
        max-width: 900px;
        margin: 0 auto;
        padding-bottom: 80px;
      }
      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
        transition: all var(--transition-fast);
        flex-shrink: 0;
      }
      .btn-ghost:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .btn-sm {
        padding: 6px 10px;
        font-size: 11px;
      }
      .error-banner {
        padding: 8px 12px;
        margin-bottom: 8px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }
      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .skeleton-card {
        width: 100%;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .card {
        background: var(--bg-glass-light);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .card-header h3 {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary);
        flex: 1;
      }
      .card-badge {
        padding: 2px 8px;
        border-radius: var(--radius-full);
        font-size: 10px;
        font-weight: 700;
        background: var(--accent-gradient);
        color: #fff;
      }
      .card-badge.badge-error {
        background: #ef4444;
      }
      .card-badge.badge-warn {
        background: #f59e0b;
      }
      .card-body {
        padding: 12px 14px;
      }
      .wide-card {
        grid-column: 1 / -1;
      }
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px;
        color: var(--text-muted);
        font-size: 12px;
      }
      .empty-state svg {
        opacity: 0.3;
      }
      .empty-state-sm {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 16px;
        color: var(--text-muted);
        font-size: 11px;
      }

      .shift-display {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 4px 0;
        text-align: center;
      }
      .shift-display.night {
        border-left: 3px solid #8b5cf6;
        padding-left: 10px;
        text-align: left;
      }
      .shift-type-badge {
        font-size: 24px;
        font-weight: 800;
        color: var(--text-primary);
      }
      .shift-times {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .shift-sep {
        color: var(--text-muted);
      }
      .shift-time {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      .shift-device {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-muted);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        font-size: 10px;
        font-weight: 600;
      }
      .badge-success {
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
      }
      .badge-neutral {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .progress-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        margin-top: 4px;
      }
      .progress-bar {
        width: 100%;
        height: 3px;
        background: var(--bg-hover);
        border-radius: 2px;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: var(--accent-gradient);
        border-radius: 2px;
        transition: width 1s ease;
      }
      .progress-label {
        font-size: 10px;
        color: var(--text-muted);
      }

      .task-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .task-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 8px;
        border: none;
        border-radius: var(--radius-md);
        background: var(--bg-glass);
        color: var(--text-primary);
        cursor: pointer;
        transition: all var(--transition-fast);
        text-align: left;
        font-size: 13px;
        min-height: 44px;
      }
      .task-item:hover {
        background: var(--bg-hover);
      }
      .task-item.completed {
        opacity: 0.5;
      }
      .task-item.completed .task-label {
        text-decoration: line-through;
      }
      .task-check {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        border: 2px solid var(--border-default);
        flex-shrink: 0;
        transition: all var(--transition-fast);
      }
      .task-check.checked {
        background: #22c55e;
        border-color: #22c55e;
        color: #fff;
      }

      .incident-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 8px;
        border-radius: var(--radius-md);
        background: var(--bg-glass);
        margin-bottom: 4px;
        min-height: 44px;
        cursor: pointer;
      }
      .incident-item.severity-critical {
        border-left: 3px solid #ef4444;
      }
      .incident-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .incident-type {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .incident-device {
        font-size: 11px;
        color: var(--text-muted);
      }
      .severity-tag {
        padding: 2px 8px;
        border-radius: var(--radius-full);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .sev-critical {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }
      .sev-high {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }
      .sev-medium {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .sev-low {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }

      .swap-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 8px;
        border-radius: var(--radius-md);
        background: var(--bg-glass);
        margin-bottom: 4px;
        min-height: 44px;
      }
      .swap-reason {
        font-size: 13px;
        color: var(--text-primary);
      }
      .swap-date {
        font-size: 10px;
        color: var(--text-muted);
        flex-shrink: 0;
      }

      .next-display {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 4px 0;
      }
      .next-display.night {
        border-left: 3px solid #8b5cf6;
        padding-left: 10px;
      }
      .next-date-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .next-date {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .next-day {
        font-size: 11px;
        color: var(--text-muted);
      }
      .next-type {
        font-size: 18px;
        font-weight: 700;
        color: var(--accent-mr);
      }
      .next-time {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .next-device {
        font-size: 11px;
        color: var(--text-muted);
      }
      .countdown {
        margin-top: 4px;
        padding: 4px 10px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: var(--radius-md);
        font-size: 11px;
        font-weight: 600;
        color: #60a5fa;
        display: inline-block;
      }

      .remaining-display {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
      }
      .remaining-value {
        font-size: 28px;
        font-weight: 800;
        color: #22c55e;
        line-height: 1;
      }
      .remaining-unit {
        font-size: 14px;
        font-weight: 500;
        margin-left: 2px;
      }
      .remaining-label {
        font-size: 10px;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .elapsed-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
      }
      .elapsed-label {
        font-size: 10px;
        color: var(--text-muted);
      }
      .elapsed-value {
        padding: 2px 8px;
        background: rgba(74, 222, 128, 0.1);
        border-radius: var(--radius-md);
        font-size: 12px;
        font-weight: 700;
        color: #4ade80;
        font-family: var(--font-mono, monospace);
      }

      .action-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        gap: 4px;
        padding: 6px env(safe-area-inset-bottom, 6px) 6px 6px;
        background: rgba(13, 19, 32, 0.95);
        backdrop-filter: blur(16px);
        border-top: 1px solid var(--border-subtle);
        z-index: 400;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-width: 60px;
        min-height: 52px;
        padding: 6px 8px;
        border: none;
        border-radius: var(--radius-md);
        font-size: 9px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        flex-shrink: 0;
        color: #fff;
      }
      .action-btn svg {
        width: 18px;
        height: 18px;
      }
      .action-btn span {
        font-size: 8px;
        text-transform: uppercase;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }
      .action-primary {
        background: #3b82f6;
      }
      .action-primary:active {
        background: #2563eb;
      }
      .action-danger {
        background: #ef4444;
      }
      .action-danger:active {
        background: #dc2626;
      }
      .action-secondary {
        background: rgba(255, 255, 255, 0.08);
      }
      .action-secondary:active {
        background: rgba(255, 255, 255, 0.15);
      }
      .touch-target {
        min-height: 44px;
      }

      @media (min-width: 769px) {
        .my-day-page {
          padding: 20px 28px;
          padding-bottom: 0;
        }
        .dashboard-grid {
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .action-bar {
          position: static;
          margin-top: 14px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
          padding: 10px 16px;
          gap: 8px;
          justify-content: center;
        }
        .action-btn {
          flex-direction: row;
          gap: 6px;
          min-width: auto;
          min-height: 40px;
          padding: 8px 16px;
          font-size: 11px;
          border-radius: var(--radius-md);
        }
        .action-btn svg {
          width: 16px;
          height: 16px;
        }
        .action-btn span {
          font-size: 11px;
          text-transform: none;
        }
        .shift-type-badge {
          font-size: 28px;
        }
      }

      @media (max-width: 768px) {
        .dashboard-grid {
          grid-template-columns: 1fr;
        }
        .my-day-page {
          padding-bottom: 80px;
        }
      }
    `,
  ],
})
export class MyDayComponent implements OnInit, OnDestroy {
  private scheduleService = inject(ScheduleService);
  private attendanceService = inject(AttendanceService);
  private shiftTasksService = inject(ShiftTasksService);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected data = signal<MyDayDashboardResponse | null>(null);
  protected shiftProgress = signal(0);
  protected elapsedTime = signal('00:00:00');
  protected countdownStr = signal('');
  protected tasks = signal<MyDayTask[]>([]);
  protected remainingHours = signal('0');

  private dayLabels = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private attendanceTimer: ReturnType<typeof setInterval> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.refresh();
  }

  ngOnDestroy() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.attendanceTimer) clearInterval(this.attendanceTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
  }

  protected refresh() {
    this.loading.set(true);
    this.error.set(null);

    this.scheduleService.getMyDayDashboard().subscribe({
      next: (res) => {
        this.data.set(res);
        this.tasks.set(res.tasks || []);
        if (res.shift) {
          this.calcShiftProgress(res.shift.startTime, res.shift.endTime);
        }
        if (res.attendance?.status === 'active' && res.attendance.clockIn) {
          this.startAttendanceTimer(res.attendance.clockIn);
        }
        if (res.nextShift) {
          this.startCountdown(res.nextShift.date, res.nextShift.startTime);
        }
        this.remainingHours.set(String(res.remainingHours ?? 0));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Veriler yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  protected toggleTask(task: MyDayTask) {
    if (task.status === 'completed') return;
    this.shiftTasksService.updateTaskStatus(task.id, 'completed').subscribe({
      next: () => {
        this.tasks.update((tasks) =>
          tasks.map((t) =>
            t.id === task.id
              ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() }
              : t,
          ),
        );
        this.data.update((d) => {
          if (!d) return d;
          const completed = this.tasks().filter((t) => t.status === 'completed').length;
          const total = this.tasks().length;
          return {
            ...d,
            tasks: this.tasks(),
            taskProgress: {
              completed,
              total,
              percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
            },
          };
        });
      },
    });
  }

  protected clockIn() {
    this.attendanceService.clockIn().subscribe({
      next: () => {
        this.refresh();
      },
    });
  }

  protected clockOut() {
    this.attendanceService.clockOut().subscribe({
      next: () => {
        this.refresh();
      },
    });
  }

  protected goToSchedule() {
    this.router.navigate(['/app/my-shifts']);
  }

  protected goToSwap() {
    this.router.navigate(['/app/swap-requests']);
  }

  protected goToIncident() {
    this.router.navigate(['/app/device-incidents']);
  }

  protected goToHandover() {
    this.router.navigate(['/app/handover-notes']);
  }

  private startCountdown(date: string, startTime: string) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.updateCountdown(date, startTime);
    this.countdownTimer = setInterval(() => this.updateCountdown(date, startTime), 60000);
  }

  private updateCountdown(date: string, startTime: string) {
    const now = new Date();
    const [h, m] = startTime.split(':').map(Number);
    const target = new Date(date);
    target.setHours(h, m, 0, 0);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) {
      this.countdownStr.set('Başladı');
      return;
    }
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (days > 0) this.countdownStr.set(`${days}g ${hours}s ${mins}d kaldı`);
    else if (hours > 0) this.countdownStr.set(`${hours}s ${mins}d kaldı`);
    else this.countdownStr.set(`${mins}d kaldı`);
  }

  private calcShiftProgress(startTime: string, endTime: string) {
    const now = new Date();
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const start = new Date();
    start.setHours(sh, sm, 0, 0);
    const end = new Date();
    end.setHours(eh, em, 0, 0);
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    if (total <= 0 || elapsed < 0) {
      this.shiftProgress.set(0);
      return;
    }
    this.shiftProgress.set(Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))));
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      const now2 = new Date();
      const elapsed2 = now2.getTime() - start.getTime();
      this.shiftProgress.set(Math.min(100, Math.max(0, Math.round((elapsed2 / total) * 100))));
    }, 60000);
  }

  private startAttendanceTimer(clockIn: string) {
    if (this.attendanceTimer) clearInterval(this.attendanceTimer);
    const update = () => {
      const start = new Date(clockIn).getTime();
      const diff = Date.now() - start;
      if (diff <= 0) {
        this.elapsedTime.set('00:00:00');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      this.elapsedTime.set(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    update();
    this.attendanceTimer = setInterval(update, 1000);
  }

  protected getDayName(date: string): string {
    return this.dayLabels[new Date(date).getDay()];
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  protected formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'şimdi';
    if (mins < 60) return `${mins}dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}sa önce`;
    return `${Math.floor(hours / 24)}g önce`;
  }
}
