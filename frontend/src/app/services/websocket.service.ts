import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subject, BehaviorSubject, interval, Subscription } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

export interface ScheduleEvent {
  type: 'generated' | 'updated' | 'deleted';
  timestamp: string;
  data?: any;
}

export interface LockInfo {
  scheduleId: string;
  userId: string;
  userName: string;
  expiresAt: string;
  entityId?: string;
  entityType?: string;
}

export interface ViewerInfo {
  userId: string;
  userName: string;
  lastActivity: Date;
  isTyping: boolean;
}

export interface ConcurrencyInfo {
  version: number;
  lastUpdated: string;
  lastUpdatedBy?: string;
}

export interface WsNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private socket: Socket | null = null;
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  private connectionStatus = new BehaviorSubject<boolean>(false);
  private scheduleEvents = new Subject<ScheduleEvent>();
  private lockEvents = new Subject<{
    action: 'acquired' | 'released' | 'expired';
    lock: LockInfo;
  }>();
  private presenceEvents = new Subject<{ users: any[] }>();
  private concurrencyEvents = new Subject<{ conflict: boolean; serverVersion?: number }>();
  private alertEvents = new Subject<{ scheduleId: string; unitId: string }>();
  private notificationEvents = new Subject<WsNotification>();

  readonly alert$ = this.alertEvents.asObservable();
  readonly notification$ = this.notificationEvents.asObservable();

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 1000;
  private heartbeatInterval = 30000;
  private heartbeatSub: Subscription | null = null;
  private currentScheduleId: string | null = null;

  readonly isConnected$ = this.connectionStatus.asObservable();
  readonly scheduleUpdates$ = this.scheduleEvents.asObservable();
  readonly lockUpdates$ = this.lockEvents.asObservable();
  readonly presenceUpdates$ = this.presenceEvents.asObservable();
  readonly concurrencyUpdates$ = this.concurrencyEvents.asObservable();

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.token();
    if (!token) return;

    this.socket = io(environment.wsUrl + '/realtime', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectInterval,
    });

    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectionStatus.next(true);
      this.reconnectAttempts = 0;
      this.notificationService.show('Bağlantı kuruldu', 'WebSocket bağlantısı aktif', 'success');

      const user = this.authService.user();
      if (user?.organizationId) {
        this.subscribeOrg(user.organizationId);
      }
      if (this.currentScheduleId) {
        this.subscribeSchedule(this.currentScheduleId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionStatus.next(false);
      if (reason !== 'io client disconnect') {
        this.notificationService.show(
          'Bağlantı Kesildi',
          'Sunucu ile bağlantı kayboldu',
          'warning',
        );
      }
    });

    this.socket.on('connect_error', (error) => {
      this.connectionStatus.next(false);
      this.reconnectAttempts++;
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('connected', (data) => {});

    this.socket.on('schedule:sync', (data) => {
      if (data.lock) {
        this.lockEvents.next({ action: 'acquired', lock: data.lock });
      }
    });

    this.socket.on('lockAcquired', (data) => {
      this.lockEvents.next({ action: 'acquired', lock: data });
    });

    this.socket.on('lockReleased', (data) => {
      this.lockEvents.next({ action: 'released', lock: data });
    });

    this.socket.on('lockExpired', (data) => {
      this.lockEvents.next({ action: 'expired', lock: data });
      this.notificationService.show(
        'Kilit Süresi Doldu',
        'Düzenleme kilidi otomatik olarak kaldırıldı',
        'info',
      );
    });

    this.socket.on('lock:acquired', (data) => {});

    this.socket.on('lock:denied', (data) => {
      this.notificationService.show(
        'Kilit Alınamadı',
        `${data.lockedByName} şu anda düzenliyor`,
        'warning',
      );
    });

    this.socket.on('update:conflict', (data) => {
      this.concurrencyEvents.next({ conflict: true, serverVersion: data.serverVersion });
      this.notificationService.show(
        'Güncelleme Çakışması',
        'Başka bir kullanıcı değişiklik yaptı. Sayfa yenileniyor...',
        'error',
      );
    });

    this.socket.on('schedule:updated', (data) => {
      this.scheduleEvents.next({ type: 'updated', timestamp: data.timestamp, data });
    });

    this.socket.on('schedule:summary', (data) => {
      this.notificationService.show(
        'Program Güncellendi',
        `${data.updatedBy} programı güncelledi`,
        'info',
      );
    });

    this.socket.on('presence:update', (data) => {
      this.presenceEvents.next(data);
    });

    this.socket.on('presence:userTyping', (data) => {});

    this.socket.on('heartbeat:ack', (data) => {});

    this.socket.on('alerts:updated', (data: { scheduleId: string; unitId: string }) => {
      this.alertEvents.next(data);
    });

    this.socket.on('notification:new', (data: WsNotification) => {
      this.notificationEvents.next(data);
    });

    this.socket.on('error', (data) => {
      console.error('WebSocket error:', data);
      this.notificationService.show('WebSocket Hatası', data.message, 'error');
    });
  }

  private startHeartbeat(): void {
    this.heartbeatSub = interval(this.heartbeatInterval).subscribe(() => {
      if (this.socket?.connected && this.currentScheduleId) {
        this.socket.emit('schedule:heartbeat', {
          scheduleId: this.currentScheduleId,
          entityId: this.currentScheduleId,
        });
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSub) {
      this.heartbeatSub.unsubscribe();
      this.heartbeatSub = null;
    }
  }

  subscribeOrg(organizationId: string): void {
    this.socket?.emit('subscribe:organization', { organizationId });
  }

  subscribeSchedule(scheduleId: string): void {
    this.currentScheduleId = scheduleId;
    this.socket?.emit('subscribe:schedule', { scheduleId });
  }

  unsubscribeSchedule(scheduleId: string): void {
    this.socket?.emit('unsubscribe:schedule', { scheduleId });
    if (this.currentScheduleId === scheduleId) {
      this.currentScheduleId = null;
    }
  }

  acquireLock(scheduleId: string, entityId?: string, entityType?: string): void {
    this.socket?.emit('schedule:acquireLock', {
      scheduleId,
      entityId,
      entityType,
    });
  }

  releaseLock(scheduleId: string): void {
    this.socket?.emit('schedule:releaseLock', { scheduleId });
  }

  sendUpdate(scheduleId: string, version: number, changes: any, reason?: string): void {
    this.socket?.emit('schedule:update', {
      scheduleId,
      version,
      changes,
      reason,
    });
  }

  sendAssignmentUpdate(
    scheduleId: string,
    assignmentId: string,
    personnelId: string,
    version: number,
    reason: string,
  ): void {
    this.socket?.emit('schedule:assignmentUpdate', {
      scheduleId,
      assignmentId,
      personnelId,
      version,
      reason,
    });
  }

  requestSync(scheduleId: string): void {
    this.socket?.emit('schedule:forceSync', { scheduleId });
  }

  sendTyping(scheduleId: string, isTyping: boolean): void {
    this.socket?.emit('presence:typing', { scheduleId, isTyping });
  }

  sendCursor(scheduleId: string, position: any): void {
    this.socket?.emit('presence:cursor', { scheduleId, position });
  }

  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (data: T) => subscriber.next(data);
      this.socket?.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
