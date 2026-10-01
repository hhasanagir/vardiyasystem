import { Injectable, NgZone, OnDestroy, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OfflineQueueService, QueuedAction } from './offline-queue.service';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflicted';

@Injectable({ providedIn: 'root' })
export class OfflineSyncService implements OnDestroy {
  private queue = inject(OfflineQueueService);
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  readonly isOnline = signal(navigator.onLine);
  readonly pendingCount = signal(0);
  readonly syncStatus = signal<SyncStatus>('idle');
  readonly lastSyncAt = signal<Date | null>(null);
  readonly showOfflineBadge = computed(() => !this.isOnline() || this.pendingCount() > 0);

  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private destroy = false;

  constructor() {
    this.zone.runOutsideAngular(() => {
      this.onlineHandler = () => this.zone.run(() => this.onOnline());
      this.offlineHandler = () => this.zone.run(() => this.onOffline());
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    });
    this.refreshPendingCount();
    if (this.isOnline()) this.syncAll();
    this.autoSyncTimer = setInterval(() => {
      if (this.isOnline() && this.pendingCount() > 0 && this.syncStatus() !== 'syncing') {
        this.syncAll();
      }
    }, 30000);
  }

  ngOnDestroy() {
    this.destroy = true;
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
  }

  private onOnline() {
    this.isOnline.set(true);
    this.syncAll();
  }

  private onOffline() {
    this.isOnline.set(false);
  }

  async refreshPendingCount() {
    const count = await this.queue.count();
    this.pendingCount.set(count);
  }

  async syncAll(): Promise<void> {
    if (this.syncStatus() === 'syncing') return;
    this.syncStatus.set('syncing');
    let hasError = false;
    let hasConflict = false;
    try {
      const pending = await this.queue.getPending();
      for (const action of pending) {
        if (this.destroy) break;
        try {
          await this.replayAction(action);
          await this.queue.remove(action.id);
        } catch (err: any) {
          if (err.status === 409 || err.status === 412) {
            hasConflict = true;
            await this.queue.updateStatus(action.id, 'conflicted', 'Server version is newer');
            await this.queue.remove(action.id);
          } else if (err.status === 0 || err.status === 503) {
            hasError = true;
            break;
          } else {
            hasError = true;
            await this.queue.updateStatus(action.id, 'failed', err.message || String(err));
          }
        }
      }
      await this.refreshPendingCount();
      if (hasConflict) this.syncStatus.set('conflicted');
      else if (hasError) this.syncStatus.set('error');
      else this.syncStatus.set('idle');
      this.lastSyncAt.set(new Date());
    } catch {
      this.syncStatus.set('error');
    }
    setTimeout(() => {
      if (this.syncStatus() !== 'idle' && !hasError) this.syncStatus.set('idle');
    }, 5000);
  }

  private async replayAction(action: QueuedAction): Promise<any> {
    let headers = new HttpHeaders();
    for (const [key, value] of Object.entries(action.headers)) {
      headers = headers.set(key, value);
    }
    headers = headers.set('X-Sync-Id', action.id);
    headers = headers.set('X-Client-Timestamp', String(action.timestamp));

    const body = { ...action.body, clientTimestamp: action.timestamp };

    await this.queue.updateStatus(action.id, 'syncing');
    const request = this.http.request(action.method as any, action.url, {
      body,
      headers,
      responseType: 'json',
    });
    return firstValueFrom(request);
  }
}
