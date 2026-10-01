import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AttendanceService } from '../../services/attendance.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-floating-actions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fab-container" [class.is-open]="isOpen()">
      @if (isOpen()) {
        <div class="fab-backdrop" (click)="toggle()"></div>
        <div class="fab-menu animate-in">
          <div class="fab-menu-header">
            <span class="fab-menu-title">Hızlı İşlemler</span>
            <button class="fab-close" (click)="toggle()">&times;</button>
          </div>
          <div class="fab-menu-items">
            @if (todayStatus(); as ts) {
              @if (ts.status === 'none' || ts.status === 'completed') {
                <button class="fab-item fab-item-primary" (click)="clockIn()">
                  <svg
                    width="20"
                    height="20"
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
              @if (ts.status === 'active') {
                <button class="fab-item fab-item-danger" (click)="clockOut()">
                  <svg
                    width="20"
                    height="20"
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
            <a routerLink="/app/device-incidents" class="fab-item" (click)="toggle()">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Cihaz Arıza Bildir</span>
            </a>
            <a routerLink="/app/handover-notes" class="fab-item" (click)="toggle()">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Devir Notu Ekle</span>
            </a>
            <a routerLink="/app/swap-requests" class="fab-item" (click)="toggle()">
              <svg
                width="20"
                height="20"
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
            </a>
            <a routerLink="/app/leave-management" class="fab-item" (click)="toggle()">
              <svg
                width="20"
                height="20"
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
              <span>İzin Talebi</span>
            </a>
            <a class="fab-item" (click)="showDeviceStatus()">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="2" width="20" height="8" rx="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" />
              </svg>
              <span>Cihaz Durumu</span>
            </a>
          </div>
          @if (todayStatus(); as ts) {
            @if (ts.status === 'active' && ts.clockIn) {
              <div class="fab-timer">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{{ elapsedTime() }}</span>
              </div>
            }
          }
        </div>
      }
      <button
        class="fab-btn"
        [class.active]="isOpen()"
        (click)="toggle()"
        [style.--status-color]="statusColor()"
      >
        @if (todayStatus(); as ts) {
          @if (ts.status === 'active') {
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          } @else {
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        } @else {
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        }
      </button>
    </div>
  `,
  styles: [
    `
      .fab-container {
        position: fixed;
        bottom: 80px;
        right: 16px;
        z-index: 9999;
      }
      @media (min-width: 769px) {
        .fab-container {
          bottom: 24px;
        }
      }
      .fab-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: -1;
      }
      .fab-btn {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: none;
        background: var(--status-color, #3b82f6);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
        transition: all var(--transition-fast);
        position: relative;
      }
      .fab-btn:hover {
        transform: scale(1.08);
      }
      .fab-btn.active {
        transform: rotate(45deg);
      }
      .fab-menu {
        position: absolute;
        bottom: 64px;
        right: 0;
        width: 260px;
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border-subtle, #334155);
        border-radius: var(--radius-lg, 12px);
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      .fab-menu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle, #334155);
      }
      .fab-menu-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary, #f1f5f9);
      }
      .fab-close {
        background: none;
        border: none;
        color: var(--text-muted, #64748b);
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .fab-menu-items {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .fab-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: none;
        border-radius: var(--radius-md, 8px);
        background: transparent;
        color: var(--text-secondary, #94a3b8);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        transition: all var(--transition-fast);
      }
      .fab-item:hover {
        background: var(--bg-hover, #1e293b);
        color: var(--text-primary, #f1f5f9);
      }
      .fab-item svg {
        flex-shrink: 0;
      }
      .fab-item-primary {
        color: #4ade80;
      }
      .fab-item-primary:hover {
        background: rgba(74, 222, 128, 0.1);
      }
      .fab-item-danger {
        color: #f87171;
      }
      .fab-item-danger:hover {
        background: rgba(248, 113, 113, 0.1);
      }
      .fab-timer {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        border-top: 1px solid var(--border-subtle, #334155);
        font-size: 12px;
        color: #4ade80;
      }
    `,
  ],
})
export class FloatingActionsComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private attendanceService = inject(AttendanceService);
  protected isOpen = signal(false);
  protected todayStatus = signal<TodayAttendance | null>(null);
  protected elapsedTime = signal('00:00:00');
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadStatus();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  protected statusColor(): string {
    const s = this.todayStatus();
    if (!s || s.status === 'none') return '#3b82f6';
    if (s.status === 'active') return '#4ade80';
    return '#64748b';
  }

  toggle() {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) this.loadStatus();
  }

  private loadStatus() {
    this.attendanceService.getToday().subscribe((s) => {
      this.todayStatus.set(s);
      if (s.status === 'active' && s.clockIn) {
        this.startTimer(s.clockIn);
      }
    });
  }

  private startTimer(clockIn: string) {
    if (this.timer) clearInterval(this.timer);
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
    this.timer = setInterval(update, 1000);
  }

  clockIn() {
    this.attendanceService.clockIn().subscribe(() => {
      this.loadStatus();
      this.isOpen.set(false);
    });
  }

  clockOut() {
    this.attendanceService.clockOut().subscribe(() => {
      this.loadStatus();
      this.isOpen.set(false);
    });
  }

  protected showDeviceStatus() {
    this.isOpen.set(false);
    this.router.navigate(['/app/dashboard'], { fragment: 'device-status' });
  }
}

interface TodayAttendance {
  date: string;
  status: 'none' | 'active' | 'completed';
  clockIn: string | null;
  clockOut: string | null;
  assignment: any;
}
