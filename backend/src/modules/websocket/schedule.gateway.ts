import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PresenceService, CursorPosition } from './presence.service';
import { EditLockService } from './edit-lock.service';
import { ConcurrencyService, Changes } from './concurrency.service';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SessionService } from '../auth/session.service';
import { MetricsService } from '../../metrics/metrics.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userRole?: string;
  organizationId?: string;
  unitId?: string;
  sessionId?: string;
}

interface ScheduleRoom {
  organizationId: string;
  unitId: string;
  scheduleId: string;
}

interface WsEvent {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

@WebSocketGateway({
  cors: {
    origin:
      process.env.WS_CORS_ORIGIN ||
      process.env.FRONTEND_URL ||
      'http://localhost:4200',
    credentials: true,
  },
  namespace: '/realtime',
})
export class ScheduleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ScheduleGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();
  private processedEvents = new Map<string, number>();
  private readonly EVENT_DEDUP_TTL_MS = 30000;
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();

  private connectionAttempts = new Map<
    string,
    { count: number; firstAttempt: number }
  >();
  private reconnectTimestamps = new Map<string, number>();
  private sessionSockets = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private presenceService: PresenceService,
    private editLockService: EditLockService,
    private concurrencyService: ConcurrencyService,
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private configService: ConfigService,
    private sessionService: SessionService,
    private metrics: MetricsService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    const cleanup = setInterval(() => {
      this.cleanupStalePresence();
      this.cleanupStaleLocks();
      this.cleanupProcessedEvents();
      this.cleanupConnectionAttempts();
      this.cleanupReconnectTimestamps();
    }, 30000);

    this.heartbeatTimers.set('cleanup', cleanup);
  }

  private generateEventId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private wrapEvent(type: string, payload: Record<string, unknown>): WsEvent {
    return {
      eventId: this.generateEventId(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
  }

  private emitWithDedup(
    room: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    const event = this.wrapEvent(type, payload);
    this.server.to(room).emit(type, event.payload);
    this.metrics?.wsEventsTotal.inc({ event: type });
  }

  private isDuplicateEvent(eventId: string): boolean {
    const now = Date.now();
    const seen = this.processedEvents.get(eventId);
    if (seen && now - seen < this.EVENT_DEDUP_TTL_MS) {
      return true;
    }
    this.processedEvents.set(eventId, now);
    return false;
  }

  private cleanupProcessedEvents(): void {
    const now = Date.now();
    for (const [eventId, timestamp] of this.processedEvents) {
      if (now - timestamp > this.EVENT_DEDUP_TTL_MS) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  private cleanupConnectionAttempts(): void {
    const now = Date.now();
    const windowMs = this.configService.get<number>(
      'WS_CONNECTION_WINDOW_MS',
      60000,
    );
    for (const [ip, record] of this.connectionAttempts) {
      if (now - record.firstAttempt > windowMs) {
        this.connectionAttempts.delete(ip);
      }
    }
  }

  private cleanupReconnectTimestamps(): void {
    const now = Date.now();
    const cooldownMs = this.configService.get<number>(
      'WS_RECONNECT_COOLDOWN_MS',
      2000,
    );
    for (const [ip, timestamp] of this.reconnectTimestamps) {
      if (now - timestamp > cooldownMs * 10) {
        this.reconnectTimestamps.delete(ip);
      }
    }
  }

  private getClientIp(client: Socket): string {
    const xff = client.handshake.headers['x-forwarded-for'];
    if (xff) {
      return (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
    }
    return client.handshake.address || 'unknown';
  }

  private isConnectionRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowMs = this.configService.get<number>(
      'WS_CONNECTION_WINDOW_MS',
      60000,
    );
    const limit = this.configService.get<number>('WS_CONNECTION_LIMIT', 10);

    const record = this.connectionAttempts.get(ip);
    if (!record) {
      this.connectionAttempts.set(ip, { count: 1, firstAttempt: now });
      return false;
    }

    if (now - record.firstAttempt > windowMs) {
      this.connectionAttempts.set(ip, { count: 1, firstAttempt: now });
      return false;
    }

    record.count++;
    if (record.count > limit) {
      this.logger.warn(
        `WS connection rate limited: IP ${ip} (${record.count} in window)`,
      );
      return true;
    }

    return false;
  }

  private isReconnectTooSoon(ip: string): boolean {
    const cooldownMs = this.configService.get<number>(
      'WS_RECONNECT_COOLDOWN_MS',
      2000,
    );
    const lastDisconnect = this.reconnectTimestamps.get(ip);
    if (lastDisconnect && Date.now() - lastDisconnect < cooldownMs) {
      this.logger.warn(`WS reconnect too soon: IP ${ip}`);
      return true;
    }
    return false;
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const ip = this.getClientIp(client);

      const origin =
        (client.handshake.headers.origin as string) ||
        (client.handshake.headers.referer as string);
      if (origin) {
        const allowedOrigin =
          this.configService.get<string>('WS_CORS_ORIGIN') ||
          this.configService.get<string>(
            'FRONTEND_URL',
            'http://localhost:4200',
          ) ||
          '';
        try {
          const originHost = new URL(origin).origin;
          if (originHost !== allowedOrigin) {
            this.logger.warn(
              `WS connection rejected: origin ${originHost} not allowed from ${ip}`,
            );
            client.disconnect();
            return;
          }
        } catch {
          this.logger.warn(
            `WS connection rejected: invalid origin header from ${ip}`,
          );
          client.disconnect();
          return;
        }
      }

      if (this.isConnectionRateLimited(ip)) {
        client.emit('error', {
          message: 'Connection rate limited. Please wait before reconnecting.',
        });
        client.disconnect();
        return;
      }

      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(
          `Client ${client.id} connected without token from ${ip}`,
        );
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, { algorithms: ['HS256'] });

      client.userId = payload.sub;
      client.userRole = payload.role;
      client.organizationId = payload.organizationId;
      client.sessionId =
        (client.handshake.auth.sessionId as string) || undefined;

      try {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { name: true, unitId: true },
        });
        client.userName = user?.name ?? 'unknown';
        client.unitId = user?.unitId ?? undefined;
      } catch {
        client.userName = 'unknown';
        client.unitId = undefined;
      }

      if (client.sessionId) {
        this.sessionSockets.set(client.sessionId, client.id);
      }

      const existingClient = this.findClientByUserId(client.userId!);
      if (existingClient && existingClient.id !== client.id) {
        if (this.isReconnectTooSoon(ip)) {
          client.emit('error', {
            message: 'Reconnecting too quickly. Please wait.',
          });
          client.disconnect();
          return;
        }
        this.logger.warn(
          `Reconnecting user ${client.userName}, disconnecting old session ${existingClient.id}`,
        );
        existingClient.disconnect();
      }

      this.connectedClients.set(client.id, client);
      this.metrics.wsConnectionsGauge.inc();
      this.metrics.wsEventsTotal.inc({ event: 'connection' });

      this.presenceService.setOnline(client.userId!, {
        socketId: client.id,
        userName: client.userName!,
        role: client.userRole!,
        organizationId: client.organizationId!,
        unitId: client.unitId,
        lastActivity: new Date(),
      });

      this.logger.log(
        `User ${client.userName} (${client.userId}) connected from ${ip}`,
      );

      const pendingEvents = client.handshake.auth.lastEventId
        ? this.getMissedEvents(client.handshake.auth.lastEventId as string)
        : [];

      if (client.userId) {
        client.join(`user:${client.userId}`);
      }

      client.emit('connected', {
        userId: client.userId,
        timestamp: new Date().toISOString(),
        missedEvents: pendingEvents,
      });

      if (client.organizationId) {
        this.broadcastPresenceUpdate(client.organizationId);
      }
    } catch (error) {
      this.logger.error(
        `Connection error from ${this.getClientIp(client)}: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    const orgId = client.organizationId;
    const userName = client.userName;
    const ip = this.getClientIp(client);

    this.reconnectTimestamps.set(ip, Date.now());
    this.connectedClients.delete(client.id);
    this.metrics.wsConnectionsGauge.dec();
    this.metrics.wsEventsTotal.inc({ event: 'disconnection' });

    if (client.sessionId) {
      this.sessionSockets.delete(client.sessionId);
    }

    if (userId) {
      this.presenceService.setOffline(userId);

      const activeLocks = this.editLockService.getUserActiveLocks(userId);
      for (const lock of activeLocks) {
        this.editLockService.releaseLock(lock.scheduleId, userId);

        this.emitWithDedup(`schedule:${lock.scheduleId}`, 'lockReleased', {
          scheduleId: lock.scheduleId,
          releasedBy: userId,
          timestamp: new Date().toISOString(),
        });
      }

      if (orgId) {
        this.broadcastPresenceUpdate(orgId);
      }

      this.logger.log(`User ${userName} disconnected`);
    }
  }

  @SubscribeMessage('subscribe:organization')
  handleSubscribeOrg(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { organizationId: string },
  ) {
    if (client.organizationId !== data.organizationId) {
      client.emit('error', { message: 'Unauthorized organization access' });
      return;
    }

    client.join(`org:${data.organizationId}`);

    const users = this.presenceService.getOrganizationUsers(
      data.organizationId,
    );
    client.emit('organization:users', { users });

    this.logger.log(
      `User ${client.userId} subscribed to org ${data.organizationId}`,
    );
  }

  @SubscribeMessage('subscribe:schedule')
  async handleSubscribeSchedule(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string },
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: data.scheduleId },
      select: { organizationId: true, unitId: true },
    });

    if (!schedule) {
      client.emit('error', { message: 'Schedule not found' });
      return;
    }

    if (
      client.organizationId &&
      schedule.organizationId &&
      client.organizationId !== schedule.organizationId
    ) {
      this.logger.warn(
        `Tenant isolation: User ${client.userId} from org ${client.organizationId} blocked from schedule ${data.scheduleId} (org ${schedule.organizationId})`,
      );
      client.emit('error', {
        message: 'Access denied: cross-tenant schedule subscription',
      });
      return;
    }

    if (
      client.unitId &&
      client.userRole !== 'system_admin' &&
      client.userRole !== 'hospital_admin' &&
      client.unitId !== schedule.unitId
    ) {
      this.logger.warn(
        `Unit isolation: User ${client.userId} (unit ${client.unitId}) blocked from schedule ${data.scheduleId} (unit ${schedule.unitId})`,
      );
      client.emit('error', {
        message: 'Access denied: cross-unit schedule subscription',
      });
      return;
    }

    client.join(`schedule:${data.scheduleId}`);

    const lock = this.editLockService.getScheduleLock(data.scheduleId);
    const users = this.presenceService.getScheduleViewers(data.scheduleId);
    const versions = this.concurrencyService.getVersionInfo(data.scheduleId);

    client.emit('schedule:sync', {
      scheduleId: data.scheduleId,
      lock,
      viewers: users,
      ...versions,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `User ${client.userId} subscribed to schedule ${data.scheduleId}`,
    );
  }

  @SubscribeMessage('unsubscribe:schedule')
  handleUnsubscribeSchedule(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string },
  ) {
    client.leave(`schedule:${data.scheduleId}`);
    this.presenceService.removeFromSchedule(client.userId!, data.scheduleId);
  }

  @SubscribeMessage('schedule:acquireLock')
  async handleAcquireLock(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { scheduleId: string; entityId?: string; entityType?: string },
  ) {
    const lockResult = this.editLockService.acquireLock(
      data.scheduleId,
      client.userId!,
      client.userName!,
      {
        entityId: data.entityId,
        entityType: data.entityType,
      },
    );

    if (lockResult.success) {
      this.emitWithDedup(`schedule:${data.scheduleId}`, 'lockAcquired', {
        scheduleId: data.scheduleId,
        lockedBy: client.userId,
        lockedByName: client.userName,
        entityId: data.entityId,
        entityType: data.entityType,
        timestamp: new Date().toISOString(),
      });

      await this.auditLog
        .log({
          userId: client.userId!,
          action: 'LOCK_ACQUIRED',
          entityType: 'schedule',
          entityId: data.scheduleId,
          metadata: { entityId: data.entityId, entityType: data.entityType },
          ipAddress: client.handshake.address,
          userAgent: client.handshake.headers['user-agent'],
        })
        .catch(() => {});

      client.emit('lock:acquired', {
        scheduleId: data.scheduleId,
        lockId: lockResult.lockId,
        expiresAt: lockResult.expiresAt,
      });
    } else {
      client.emit('lock:denied', {
        scheduleId: data.scheduleId,
        reason: lockResult.reason,
        lockedBy: lockResult.lockedBy,
        lockedByName: lockResult.lockedByName,
        expiresAt: lockResult.expiresAt,
      });
    }
  }

  @SubscribeMessage('schedule:releaseLock')
  async handleReleaseLock(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string },
  ) {
    const released = this.editLockService.releaseLock(
      data.scheduleId,
      client.userId!,
    );

    if (released) {
      this.emitWithDedup(`schedule:${data.scheduleId}`, 'lockReleased', {
        scheduleId: data.scheduleId,
        releasedBy: client.userId,
        timestamp: new Date().toISOString(),
      });

      await this.auditLog
        .log({
          userId: client.userId!,
          action: 'LOCK_RELEASED',
          entityType: 'schedule',
          entityId: data.scheduleId,
          ipAddress: client.handshake.address,
          userAgent: client.handshake.headers['user-agent'],
        })
        .catch(() => {});
    }
  }

  @SubscribeMessage('schedule:heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string; entityId?: string },
  ) {
    if (!client.userId) return;
    this.editLockService.refreshLock(data.scheduleId, client.userId);
    this.presenceService.updateActivity(client.userId, data.scheduleId);

    client.emit('heartbeat:ack', {
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    });
  }

  @SubscribeMessage('schedule:update')
  async handleScheduleUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      scheduleId: string;
      version: number;
      changes: Changes;
      reason?: string;
    },
  ) {
    if (!client.userId) return;

    const lock = this.editLockService.getScheduleLock(data.scheduleId);

    if (!lock || lock.userId !== client.userId) {
      client.emit('update:denied', {
        reason: 'Edit lock required or lock held by another user',
        lockedBy: lock?.userName,
      });
      return;
    }

    const concurrencyResult = await this.concurrencyService.checkAndUpdate(
      data.scheduleId,
      data.version,
      client.userId,
      data.changes,
    );

    if (concurrencyResult.conflict) {
      client.emit('update:conflict', {
        scheduleId: data.scheduleId,
        clientVersion: data.version,
        serverVersion: concurrencyResult.serverVersion,
        serverChanges: concurrencyResult.serverChanges,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.emitWithDedup(`schedule:${data.scheduleId}`, 'schedule:updated', {
      scheduleId: data.scheduleId,
      version: concurrencyResult.newVersion,
      changes: data.changes,
      updatedBy: client.userId,
      updatedByName: client.userName,
      timestamp: new Date().toISOString(),
    });

    if (client.organizationId) {
      this.emitWithDedup(`org:${client.organizationId}`, 'schedule:summary', {
        type: 'updated',
        scheduleId: data.scheduleId,
        version: concurrencyResult.newVersion,
        updatedBy: client.userName,
        timestamp: new Date().toISOString(),
      });
    }

    await this.auditLog
      .log({
        userId: client.userId,
        action: 'SCHEDULE_UPDATE',
        entityType: 'schedule',
        entityId: data.scheduleId,
        before: { version: data.version },
        after: { version: concurrencyResult.newVersion },
        reason: data.reason,
        ipAddress: client.handshake.address,
        userAgent: client.handshake.headers['user-agent'],
      })
      .catch(() => {});
  }

  @SubscribeMessage('schedule:assignmentUpdate')
  async handleAssignmentUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      scheduleId: string;
      assignmentId: string;
      personnelId: string;
      version: number;
      reason: string;
    },
  ) {
    if (!client.userId) return;

    const lock = this.editLockService.getScheduleLock(data.scheduleId);

    if (!lock || lock.userId !== client.userId) {
      client.emit('assignment:denied', {
        reason: 'Edit lock required',
        lockedBy: lock?.userName,
      });
      return;
    }

    this.emitWithDedup(`schedule:${data.scheduleId}`, 'assignment:updated', {
      scheduleId: data.scheduleId,
      assignmentId: data.assignmentId,
      personnelId: data.personnelId,
      version: data.version + 1,
      updatedBy: client.userName,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    await this.auditLog
      .log({
        userId: client.userId,
        action: 'ASSIGNMENT_UPDATE',
        entityType: 'assignment',
        entityId: data.assignmentId,
        metadata: { scheduleId: data.scheduleId },
        reason: data.reason,
        ipAddress: client.handshake.address,
        userAgent: client.handshake.headers['user-agent'],
      })
      .catch(() => {});
  }

  @SubscribeMessage('schedule:forceSync')
  handleForceSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string },
  ) {
    this.sendFullSync(client, data.scheduleId);
  }

  @SubscribeMessage('presence:typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string; isTyping: boolean },
  ) {
    if (!client.userId) return;
    client.to(`schedule:${data.scheduleId}`).emit('presence:userTyping', {
      userId: client.userId,
      userName: client.userName,
      scheduleId: data.scheduleId,
      isTyping: data.isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('presence:cursor')
  handleCursor(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleId: string; position: CursorPosition },
  ) {
    if (!client.userId) return;
    client.to(`schedule:${data.scheduleId}`).emit('presence:cursorMove', {
      userId: client.userId,
      userName: client.userName,
      scheduleId: data.scheduleId,
      position: data.position,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastNotification(data: {
    userId: string;
    organizationId: string;
    notification: {
      id: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
      isRead: boolean;
      createdAt: string;
    };
  }) {
    this.server
      .to(`org:${data.organizationId}`)
      .emit('notification:new', data.notification);
    this.server
      .to(`user:${data.userId}`)
      .emit('notification:new', data.notification);
  }

  async broadcastAlertUpdate(data: {
    scheduleId: string;
    unitId: string;
    organizationId?: string;
  }) {
    if (data.organizationId) {
      this.emitWithDedup(`org:${data.organizationId}`, 'alerts:updated', {
        scheduleId: data.scheduleId,
        unitId: data.unitId,
        timestamp: new Date().toISOString(),
      });
    }
    this.emitWithDedup(`schedule:${data.scheduleId}`, 'alerts:updated', {
      scheduleId: data.scheduleId,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastDeviceIncident(data: {
    unitId: string;
    incident: {
      id: string;
      issueType: string;
      severity: string;
      deviceName: string | null;
    };
  }) {
    this.emitWithDedup(`unit:${data.unitId}`, 'incident:new', data.incident);
  }

  async broadcastHandoverNote(data: {
    organizationId: string;
    unitId: string;
    note: {
      id: string;
      title: string;
      priority: string;
      authorName: string;
      unitName: string;
      createdAt: string;
    };
  }) {
    if (data.organizationId) {
      this.emitWithDedup(
        `org:${data.organizationId}`,
        'handover-note:new',
        data.note,
      );
    }
    this.emitWithDedup(`unit:${data.unitId}`, 'handover-note:new', data.note);
  }

  async broadcastPersonnelUpdate(data: {
    action: 'created' | 'updated' | 'deleted';
    personnelId: string;
    personnelName: string;
    unitId?: string;
    organizationId?: string;
    updatedBy?: string;
  }) {
    if (data.organizationId) {
      this.emitWithDedup(`org:${data.organizationId}`, 'personnel:update', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private getMissedEvents(lastEventId: string): Record<string, unknown>[] {
    const events: Record<string, unknown>[] = [];
    const lastTimestamp = parseInt(lastEventId.split('_')[0], 10);
    if (isNaN(lastTimestamp)) return events;

    for (const [eventId, timestamp] of this.processedEvents) {
      const eventTs = parseInt(eventId.split('_')[0], 10);
      if (!isNaN(eventTs) && eventTs > lastTimestamp) {
        events.push({
          eventId,
          timestamp: new Date(timestamp).toISOString(),
          type: 'missed',
        });
      }
    }
    return events;
  }

  private sendFullSync(client: AuthenticatedSocket, scheduleId: string) {
    const lock = this.editLockService.getScheduleLock(scheduleId);
    const viewers = this.presenceService.getScheduleViewers(scheduleId);
    const versions = this.concurrencyService.getVersionInfo(scheduleId);

    client.emit('schedule:sync', {
      scheduleId,
      lock,
      viewers,
      ...versions,
      timestamp: new Date().toISOString(),
    });
  }

  private async cleanupStalePresence() {
    const staleThreshold = 5 * 60 * 1000;
    const staleUsers = this.presenceService.getStaleUsers(staleThreshold);

    for (const user of staleUsers) {
      const client = this.findClientByUserId(user.userId);
      if (!client || !client.connected) {
        this.presenceService.setOffline(user.userId);
        if (user.organizationId) {
          this.broadcastPresenceUpdate(user.organizationId);
        }
      }
    }
  }

  private async cleanupStaleLocks() {
    const expiredLocks = this.editLockService.getExpiredLocks();

    for (const lock of expiredLocks) {
      const client = this.findClientByUserId(lock.userId);
      if (!client || !client.connected) {
        this.editLockService.forceReleaseLock(lock.scheduleId);

        this.emitWithDedup(`schedule:${lock.scheduleId}`, 'lockExpired', {
          scheduleId: lock.scheduleId,
          reason: 'User disconnected or inactive',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private broadcastPresenceUpdate(organizationId: string) {
    const users = this.presenceService.getOrganizationUsers(organizationId);

    this.emitWithDedup(`org:${organizationId}`, 'presence:update', {
      users,
      timestamp: new Date().toISOString(),
    });
  }

  private findClientByUserId(userId: string): AuthenticatedSocket | undefined {
    for (const client of this.connectedClients.values()) {
      if (client.userId === userId) {
        return client;
      }
    }
    return undefined;
  }

  async disconnectSession(
    sessionId: string,
    reason?: string,
  ): Promise<boolean> {
    const socketId = this.sessionSockets.get(sessionId);
    if (!socketId) return false;

    const client = this.connectedClients.get(socketId);
    if (!client || !client.connected) {
      this.sessionSockets.delete(sessionId);
      return false;
    }

    client.emit('session:revoked', {
      reason: reason || 'Session has been revoked from another device',
      timestamp: new Date().toISOString(),
    });

    client.disconnect();
    this.logger.warn(
      `Disconnected socket ${socketId} for revoked session ${sessionId}`,
    );
    return true;
  }

  private async getUnitIdFromSchedule(
    scheduleId: string,
  ): Promise<string | null> {
    try {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: { unitId: true },
      });
      return schedule?.unitId || null;
    } catch {
      return null;
    }
  }
}
