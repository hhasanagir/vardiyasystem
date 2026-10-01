import {
  Component,
  inject,
  OnInit,
  signal,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../services/websocket.service';
import { ApiService } from '../../services/api.service';

interface LiveShift {
  id: string;
  unit: string;
  device: string;
  shiftType: 'Gündüz' | 'Gece' | 'Aktif';
  personnel: { id: string; name: string; fatigue: number };
  status: 'active' | 'completed' | 'upcoming';
  startTime: string;
  endTime: string;
  progress: number;
}

@Component({
  selector: 'app-live-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="live-page">
      <header class="page-header">
        <div class="header-left">
          <div class="live-indicator">
            <span class="live-dot"></span>
            CANLI
          </div>
          <h1>Vardiya Takibi</h1>
        </div>
        <div class="header-right">
          <div class="time-display">
            <span class="time">{{ currentTime() }}</span>
            <span class="date">{{ currentDate() }}</span>
          </div>
        </div>
      </header>

      <div class="units-overview">
        @for (unit of units(); track unit.id) {
          <div class="unit-card" [style.--unit-color]="unit.color">
            <div class="unit-header">
              <span class="unit-name">{{ unit.name }}</span>
              <span class="unit-count">{{ unit.activeCount }}/{{ unit.totalCount }}</span>
            </div>
            <div class="unit-progress">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="unit.utilization"></div>
              </div>
              <span class="utilization">{{ unit.utilization }}%</span>
            </div>
            <div class="unit-status">
              <span class="status-dot" [class.active]="unit.activeCount > 0"></span>
              {{ unit.activeCount }} Aktif Personel
            </div>
          </div>
        }
      </div>

      <div class="shifts-grid">
        @for (shift of liveShifts(); track shift.id) {
          <div
            class="shift-card"
            [class]="shift.status"
            [style.--shift-color]="getShiftColor(shift.shiftType)"
          >
            <div class="shift-header">
              <div class="shift-info">
                <span class="unit-badge" [class]="shift.unit">{{ getUnitLabel(shift.unit) }}</span>
                <span class="shift-type">{{ shift.shiftType }}</span>
              </div>
              <span class="status-badge" [class]="shift.status">{{
                getStatusLabel(shift.status)
              }}</span>
            </div>

            <div class="device-info">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              {{ shift.device }}
            </div>

            <div class="personnel-info">
              <div class="personnel-avatar">{{ shift.personnel.name.charAt(0) }}</div>
              <div class="personnel-details">
                <span class="personnel-name">{{ shift.personnel.name }}</span>
                <div class="fatigue-bar">
                  <div
                    class="fatigue-fill"
                    [style.width.%]="shift.personnel.fatigue"
                    [class.high]="shift.personnel.fatigue > 70"
                  ></div>
                </div>
                <span class="fatigue-label">Yorgunluk: {{ shift.personnel.fatigue }}%</span>
              </div>
            </div>

            <div class="shift-timeline">
              <div class="time-range">
                <span>{{ shift.startTime }}</span>
                <span class="duration">{{ getDuration(shift) }} saat</span>
                <span>{{ shift.endTime }}</span>
              </div>
              <div class="timeline-bar">
                <div class="timeline-progress" [style.width.%]="shift.progress"></div>
                <div class="timeline-current" [style.left.%]="shift.progress"></div>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .live-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .header-left {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .live-indicator {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 20px;
        color: #f87171;
        font-size: 0.75rem;
        font-weight: 700;
        width: fit-content;
      }

      .live-dot {
        width: 8px;
        height: 8px;
        background: #ef4444;
        border-radius: 50%;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(0.8);
        }
      }

      .header-left h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
      }

      .time-display {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }

      .time {
        font-size: 1.5rem;
        font-weight: 700;
        color: #f8fafc;
        font-variant-numeric: tabular-nums;
      }

      .date {
        font-size: 0.875rem;
        color: #64748b;
      }

      .units-overview {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
      }

      .unit-card {
        padding: 1rem;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        border-top: 3px solid var(--unit-color);
      }

      .unit-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .unit-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: #e2e8f0;
      }

      .unit-count {
        font-size: 0.75rem;
        color: #64748b;
      }

      .unit-progress {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }

      .progress-bar {
        flex: 1;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--unit-color);
        border-radius: 3px;
      }

      .utilization {
        font-size: 0.75rem;
        font-weight: 600;
        color: #a5b4fc;
        min-width: 36px;
      }

      .unit-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        color: #64748b;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        background: #ef4444;
        border-radius: 50%;
      }

      .status-dot.active {
        background: #10b981;
      }

      .shifts-grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1rem;
        overflow-y: auto;
      }

      .shift-card {
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
        padding: 1rem;
        border-left: 4px solid var(--shift-color);
      }

      .shift-card.active {
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(20, 184, 166, 0.1));
        border-color: rgba(20, 184, 166, 0.3);
      }

      .shift-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .shift-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .unit-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 600;
      }

      .unit-badge.mr {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .unit-badge.bt {
        background: rgba(20, 184, 166, 0.15);
        color: #2dd4bf;
      }
      .unit-badge.rontgen {
        background: rgba(249, 115, 22, 0.15);
        color: #fb923c;
      }
      .unit-badge.nukleer {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .unit-badge.onkoloji {
        background: rgba(236, 72, 153, 0.15);
        color: #f472b6;
      }

      .shift-type {
        font-size: 0.8125rem;
        font-weight: 500;
        color: #94a3b8;
      }

      .status-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 600;
      }

      .status-badge.active {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }
      .status-badge.completed {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .status-badge.upcoming {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      .device-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0.75rem;
        background: rgba(15, 23, 42, 0.4);
        border-radius: 8px;
        margin-bottom: 1rem;
        font-size: 0.875rem;
        color: #e2e8f0;
      }

      .device-info svg {
        color: #64748b;
      }

      .personnel-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }

      .personnel-avatar {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-radius: 10px;
        color: white;
        font-weight: 600;
      }

      .personnel-details {
        flex: 1;
      }

      .personnel-name {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: #e2e8f0;
        margin-bottom: 4px;
      }

      .fatigue-bar {
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 2px;
      }

      .fatigue-fill {
        height: 100%;
        background: #10b981;
        border-radius: 2px;
      }

      .fatigue-fill.high {
        background: #f59e0b;
      }

      .fatigue-label {
        font-size: 0.6875rem;
        color: #64748b;
      }

      .shift-timeline {
        padding-top: 0.75rem;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }

      .time-range {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #64748b;
        margin-bottom: 0.5rem;
      }

      .duration {
        color: #a5b4fc;
        font-weight: 500;
      }

      .timeline-bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        position: relative;
      }

      .timeline-progress {
        height: 100%;
        background: var(--shift-color);
        border-radius: 3px;
      }

      .timeline-current {
        position: absolute;
        top: -3px;
        width: 12px;
        height: 12px;
        background: white;
        border: 2px solid var(--shift-color);
        border-radius: 50%;
        transform: translateX(-50%);
      }
    `,
  ],
})
export class LiveTrackingComponent implements OnInit, OnDestroy {
  private ws = inject(WebSocketService);
  private api = inject(ApiService);

  currentTime = signal('');
  currentDate = signal('');
  liveShifts = signal<LiveShift[]>([]);

  units = signal([
    { id: 'mr', name: 'MR', color: '#3b82f6', totalCount: 8, activeCount: 6, utilization: 75 },
    { id: 'bt', name: 'BT', color: '#14b8a6', totalCount: 7, activeCount: 5, utilization: 71 },
    {
      id: 'rontgen',
      name: 'Röntgen',
      color: '#f97316',
      totalCount: 25,
      activeCount: 18,
      utilization: 72,
    },
    {
      id: 'nukleer',
      name: 'Nükleer',
      color: '#22c55e',
      totalCount: 4,
      activeCount: 3,
      utilization: 75,
    },
    {
      id: 'onkoloji',
      name: 'Radyasyon Onkoloji',
      color: '#ec4899',
      totalCount: 4,
      activeCount: 3,
      utilization: 87,
    },
  ]);

  private clockInterval: any;

  ngOnInit() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.loadShifts();
    this.subscribeToUpdates();
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.updateSub) this.updateSub.unsubscribe();
  }

  updateClock() {
    const now = new Date();
    this.currentTime.set(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    this.currentDate.set(
      now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
    );
  }

  loadShifts() {
    this.api.get<LiveShift[]>('/shifts/live').subscribe({
      next: (data) => this.liveShifts.set(data),
      error: () => {
        this.liveShifts.set([]);
      },
    });
  }

  private updateSub: any;

  subscribeToUpdates() {
    this.updateSub = this.ws.scheduleUpdates$.subscribe(() => {
      // Schedule update received
    });
  }

  getShiftColor(type: string): string {
    const colors: Record<string, string> = {
      Gündüz: '#3b82f6',
      Gece: '#8b5cf6',
      Aktif: '#10b981',
    };
    return colors[type] || '#6366f1';
  }

  getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'RÖ',
      nukleer: 'NT',
      onkoloji: 'RÖO',
    };
    return labels[unit] || unit.toUpperCase();
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Aktif',
      completed: 'Tamamlandı',
      upcoming: 'Yaklaşan',
    };
    return labels[status] || status;
  }

  getDuration(shift: LiveShift): number {
    const start = parseInt(shift.startTime.split(':')[0]);
    const end = parseInt(shift.endTime.split(':')[0]);
    return end - start;
  }
}
