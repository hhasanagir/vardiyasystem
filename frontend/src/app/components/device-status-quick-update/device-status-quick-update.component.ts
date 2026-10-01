import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeviceStatusService, UnitDeviceWithStatus } from '../../services/device-status.service';

@Component({
  selector: 'app-device-status-quick-update',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card device-card">
      <div class="card-header">
        <h3>Cihaz Durumu</h3>
        <button class="btn btn-ghost btn-sm" (click)="refresh()">Yenile</button>
      </div>
      <div class="device-list">
        @for (dev of devices(); track dev.id) {
          <div
            class="device-item"
            [class.active]="dev.currentStatus?.status === 'active'"
            [class.maintenance]="dev.currentStatus?.status === 'maintenance'"
            [class.fault]="dev.currentStatus?.status === 'fault'"
            [class.out]="dev.currentStatus?.status === 'out_of_service'"
          >
            <div class="device-info">
              <span class="device-name">{{ dev.name }}</span>
              <span class="device-code">{{ dev.code }}</span>
            </div>
            <span
              class="device-status-badge"
              [class.badge-success]="!dev.currentStatus || dev.currentStatus.status === 'active'"
              [class.badge-warning]="dev.currentStatus?.status === 'maintenance'"
              [class.badge-error]="dev.currentStatus?.status === 'fault'"
              [class.badge-neutral]="dev.currentStatus?.status === 'out_of_service'"
            >
              {{ statusLabel(dev.currentStatus?.status || 'active') }}
            </span>
            <div class="device-actions" [class.open]="updatingDevice() === dev.id">
              <button
                class="status-btn s-active"
                (click)="setStatus(dev.id, 'active')"
                title="Aktif"
              >
                A
              </button>
              <button
                class="status-btn s-maintenance"
                (click)="setStatus(dev.id, 'maintenance')"
                title="Bakım"
              >
                B
              </button>
              <button class="status-btn s-fault" (click)="setStatus(dev.id, 'fault')" title="Arıza">
                !
              </button>
              <button
                class="status-btn s-out"
                (click)="setStatus(dev.id, 'out_of_service')"
                title="Hizmet Dışı"
              >
                X
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .device-card {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .card-header h3 {
        font-size: 13px;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
      }
      .device-list {
        display: flex;
        flex-direction: column;
      }
      .device-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-md);
        border-left: 3px solid transparent;
        transition: all var(--transition-fast);
        cursor: pointer;
      }
      .device-item:hover {
        background: var(--bg-hover);
      }
      .device-item.active {
        border-left-color: var(--status-success);
      }
      .device-item.maintenance {
        border-left-color: var(--status-warning);
      }
      .device-item.fault {
        border-left-color: var(--status-error);
      }
      .device-item.out {
        border-left-color: var(--text-muted);
      }
      .device-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .device-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .device-code {
        font-size: 10px;
        color: var(--text-muted);
      }
      .device-status-badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        white-space: nowrap;
      }
      .badge-success {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }
      .badge-warning {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }
      .badge-error {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }
      .badge-neutral {
        background: rgba(100, 116, 139, 0.15);
        color: #64748b;
      }
      .device-actions {
        display: none;
        gap: 4px;
      }
      .device-actions.open {
        display: flex;
      }
      .status-btn {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
        color: white;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .status-btn:hover {
        transform: scale(1.15);
      }
      .s-active {
        background: #22c55e;
      }
      .s-maintenance {
        background: #f59e0b;
      }
      .s-fault {
        background: #ef4444;
      }
      .s-out {
        background: #64748b;
      }
    `,
  ],
})
export class DeviceStatusQuickUpdateComponent implements OnInit {
  private deviceStatusService = inject(DeviceStatusService);

  protected devices = signal<UnitDeviceWithStatus[]>([]);
  protected updatingDevice = signal<string | null>(null);

  ngOnInit() {
    this.loadDevices();
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'active':
        return 'Aktif';
      case 'maintenance':
        return 'Bakım';
      case 'fault':
        return 'Arıza';
      case 'out_of_service':
        return 'Hizmet Dışı';
      default:
        return 'Aktif';
    }
  }

  protected refresh() {
    this.loadDevices();
  }

  private loadDevices() {
    this.deviceStatusService.getMyUnitDevices().subscribe({
      next: (devices) => this.devices.set(devices),
      error: (err) => console.warn('[DeviceStatus] Failed to load devices:', err),
    });
  }

  protected setStatus(
    deviceId: string,
    status: 'active' | 'maintenance' | 'fault' | 'out_of_service',
  ) {
    this.updatingDevice.set(deviceId);
    this.deviceStatusService.updateStatus(deviceId, status).subscribe({
      next: () => {
        this.updatingDevice.set(null);
        this.loadDevices();
      },
      error: (err) => {
        console.warn('[DeviceStatus] Failed to update status:', err);
        this.updatingDevice.set(null);
      },
    });
  }
}
