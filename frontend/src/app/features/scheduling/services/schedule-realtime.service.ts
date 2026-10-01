import { Injectable, inject, OnDestroy, signal } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { WebSocketService } from '../../../services/websocket.service';
import { ScheduleStore } from '../store/schedule.store';

export interface PresenceUser {
  userId: string;
  name: string;
  action: 'editing' | 'viewing';
}

@Injectable({ providedIn: 'root' })
export class ScheduleRealtimeService implements OnDestroy {
  private readonly ws = inject(WebSocketService);
  private readonly store = inject(ScheduleStore);
  private readonly destroy$ = new Subject<void>();

  private readonly _presenceUsers = signal<PresenceUser[]>([]);
  readonly presenceUsers = this._presenceUsers.asReadonly();

  private currentScheduleId: string | null = null;

  subscribe(scheduleId: string): void {
    if (this.currentScheduleId === scheduleId) return;
    this.unsubscribe();

    this.currentScheduleId = scheduleId;
    this.store.setConnectionState('connecting');
    this.ws.subscribeSchedule(scheduleId);

    this.ws
      .on<{ scheduleId: string; users: PresenceUser[] }>('presence:update')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.scheduleId === scheduleId) {
          this._presenceUsers.set(data.users);
        }
      });

    this.ws
      .on<{ scheduleId: string }>('schedule:updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.scheduleId === scheduleId) {
          this.store.setDirty(true);
        }
      });

    this.ws
      .on<{ scheduleId: string; serverVersion: number; localVersion: number }>('update:conflict')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.scheduleId === scheduleId) {
          this.store.triggerVersionConflict(data.localVersion, data.serverVersion, scheduleId);
        }
      });

    this.store.setConnectionState('connected');
  }

  unsubscribe(): void {
    if (this.currentScheduleId) {
      this.ws.unsubscribeSchedule(this.currentScheduleId);
      this.currentScheduleId = null;
      this._presenceUsers.set([]);
      this.store.setConnectionState('disconnected');
    }
  }

  sendTyping(isTyping: boolean): void {
    if (this.currentScheduleId) {
      this.ws.sendTyping(this.currentScheduleId, isTyping);
    }
  }

  sendCursor(position: { row: number; col: number }): void {
    if (this.currentScheduleId) {
      this.ws.sendCursor(this.currentScheduleId, position);
    }
  }

  forceSync(): void {
    if (this.currentScheduleId) {
      this.ws.requestSync(this.currentScheduleId);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
