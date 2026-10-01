import { Injectable, inject } from '@angular/core';
import { ScheduleStore } from '../store/schedule.store';

const CRITICAL_MUTATIONS = ['publish', 'approve', 'rollback', 'reject', 'archive'] as const;
type CriticalMutation = typeof CRITICAL_MUTATIONS[number];

@Injectable({ providedIn: 'root' })
export class OfflineGuard {
  private readonly store = inject(ScheduleStore);

  canExecute(mutation: CriticalMutation): boolean {
    if (this.store.connectionState() === 'disconnected') {
      return false;
    }
    return true;
  }

  isOffline(): boolean {
    return this.store.connectionState() === 'disconnected';
  }

  isReconnecting(): boolean {
    return this.store.connectionState() === 'connecting';
  }

  getBlockedMutations(): CriticalMutation[] {
    if (this.isOffline()) {
      return [...CRITICAL_MUTATIONS];
    }
    return [];
  }
}
