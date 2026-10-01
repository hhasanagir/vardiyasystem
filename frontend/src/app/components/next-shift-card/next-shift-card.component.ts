import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-next-shift-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card next-shift-card">
      <div class="card-header">
        <h3>Sonraki Vardiya</h3>
        <span class="badge badge-info">{{ nextShiftLabel() }}</span>
      </div>
      <div class="next-shift-body">
        <div class="next-shift-avatar">{{ nextInitial() }}</div>
        <div class="next-shift-info">
          <span class="next-shift-name">{{ nextTechnician() }}</span>
          <span class="next-shift-time">{{ shiftTime() }}</span>
          <span class="next-shift-device">{{ assignedDevice() }}</span>
        </div>
        <button class="btn btn-primary btn-sm" (click)="goToHandover()">Devir Teslim →</button>
      </div>
    </div>
  `,
  styles: [
    `
      .next-shift-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        padding: 16px;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-header h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
      }
      .badge-info {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .next-shift-body {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 0;
      }
      .next-shift-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--accent-gradient);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: bold;
        color: white;
        flex-shrink: 0;
      }
      .next-shift-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 2px;
        min-width: 0;
      }
      .next-shift-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .next-shift-time {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .next-shift-device {
        font-size: 11px;
        color: var(--text-muted);
      }
      .btn-primary {
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: var(--radius-md);
        padding: 6px 14px;
        font-size: 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }
      .btn-primary:hover {
        opacity: 0.9;
      }
    `,
  ],
})
export class NextShiftCardComponent {
  private router = inject(Router);
  protected authService = inject(AuthService);

  protected nextTechnician = signal('Ahmet Yılmaz');
  protected assignedDevice = signal('MR-1');

  protected nextShiftLabel = computed(() => {
    const hour = new Date().getHours();
    if (hour < 14) return 'Akşam';
    if (hour < 22) return 'Gece';
    return 'Sabah';
  });

  protected shiftTime = computed(() => {
    switch (this.nextShiftLabel()) {
      case 'Akşam':
        return '14:00 - 22:00';
      case 'Gece':
        return '22:00 - 06:00';
      case 'Sabah':
        return '06:00 - 14:00';
      default:
        return '';
    }
  });

  protected nextInitial = computed(() => {
    const name = this.nextTechnician();
    const parts = name.split(' ');
    return parts.map((p) => p[0]).join('');
  });

  protected goToHandover(): void {
    this.router.navigate(['/app/handover-notes']);
  }
}
