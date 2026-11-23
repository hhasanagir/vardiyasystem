/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
// The socket/Prisma doubles in this file are deliberately untyped: they emulate
// runtime payloads from socket.io, not domain types.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleGateway } from '../schedule.gateway';

/**
 * Coverage wave 2 — WebSocket gateway behaviour that is not an authorization
 * matrix (the cross-tenant/unit/role/lock denials live in
 * `schedule.gateway.authz.spec.ts` and are not repeated here).
 */
describe('ScheduleGateway behaviour (coverage wave 2)', () => {
  let gateway: ScheduleGateway;
  let prisma: any;
  let tokenBlacklist: any;
  let jwt: any;
  let presence: any;
  let locks: any;
  let concurrency: any;
  let auditLog: any;
  let config: any;
  let metrics: any;
  let roomTo: any;
  let roomEmit: any;

  function makeClient(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'socket-1',
      connected: true,
      userId: 'u-1',
      userName: 'User One',
      userRole: 'senior_technician',
      organizationId: 'org-1',
      unitId: 'unit-1',
      handshake: { auth: { token: 'jwt-token' }, headers: {}, address: '127.0.0.1' },
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      disconnect: vi.fn(),
      to: vi.fn(() => ({ emit: vi.fn() })),
      ...overrides,
    };
  }

  function emitted(client: any, event: string) {
    return client.emit.mock.calls.filter(([name]: [string]) => name === event);
  }

  function seedSchedule(overrides: Record<string, unknown> = {}) {
    prisma.schedule.findUnique.mockResolvedValue({
      id: 's-1',
      organizationId: 'org-1',
      unitId: 'unit-1',
      status: 'draft',
      unit: { organizationId: 'org-1' },
      ...overrides,
    });
  }

  beforeEach(() => {
    roomEmit = vi.fn();
    roomTo = vi.fn(() => ({ emit: roomEmit }));
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-1', name: 'User One', role: 'senior_technician',
          organizationId: 'org-1', unitId: 'unit-1', isActive: true,
        }),
      },
      authSession: { findUnique: vi.fn() },
      schedule: { findUnique: vi.fn() },
    };
    tokenBlacklist = { isBlacklisted: vi.fn().mockResolvedValue(false) };
    jwt = { verify: vi.fn().mockReturnValue({ sub: 'u-1', jti: 'jti-1' }) };
    presence = {
      setOnline: vi.fn(),
      setOffline: vi.fn(),
      getOrganizationUsers: vi.fn().mockReturnValue([]),
      getScheduleViewers: vi.fn().mockReturnValue([]),
      updateActivity: vi.fn(),
      removeFromSchedule: vi.fn(),
      getStaleUsers: vi.fn().mockReturnValue([]),
    };
    locks = {
      getScheduleLock: vi.fn().mockReturnValue(null),
      acquireLock: vi.fn().mockReturnValue({ success: true, lockId: 'lock-1' }),
      releaseLock: vi.fn().mockReturnValue(true),
      refreshLock: vi.fn(),
      getExpiredLocks: vi.fn().mockReturnValue([]),
      forceReleaseLock: vi.fn(),
      getUserActiveLocks: vi.fn().mockReturnValue([]),
    };
    concurrency = {
      getVersionInfo: vi.fn().mockReturnValue({ currentVersion: 1 }),
      checkAndUpdate: vi.fn().mockResolvedValue({ success: true, newVersion: 2 }),
    };
    auditLog = { log: vi.fn().mockResolvedValue(undefined) };
    config = { get: vi.fn((_key: string, fallback?: unknown) => fallback) };
    metrics = {
      wsEventsTotal: { inc: vi.fn() },
      wsConnectionsGauge: { inc: vi.fn(), dec: vi.fn() },
    };

    gateway = new ScheduleGateway(
      jwt, presence, locks, concurrency, prisma, auditLog, config,
      { isSessionValid: vi.fn().mockResolvedValue(true) } as any,
      tokenBlacklist, metrics,
    );
    gateway.server = { to: roomTo } as any;
  });

  afterEach(() => {
    const cleanup = (gateway as any).heartbeatTimers.get('cleanup');
    if (cleanup) clearInterval(cleanup);
    vi.useRealTimers();
  });

  describe('reconnect missed events', () => {
    it('returns only processed events newer than the client lastEventId', async () => {
      const now = Date.now();
      (gateway as any).processedEvents.set('1000_old', now - 1000);
      (gateway as any).processedEvents.set('2000_new', now - 500);
      const client = makeClient({
        handshake: {
          auth: { token: 'jwt-token', lastEventId: '1500_x' },
          headers: {}, address: '127.0.0.1',
        },
      });

      await gateway.handleConnection(client);

      expect(emitted(client, 'connected')[0][1].missedEvents).toEqual([
        { eventId: '2000_new', timestamp: expect.any(String), type: 'missed' },
      ]);
    });

    it('returns no missed events for a malformed or empty lastEventId', async () => {
      const client = makeClient({
        handshake: {
          auth: { token: 'jwt-token', lastEventId: 'not-a-timestamp' },
          headers: {}, address: '127.0.0.1',
        },
      });
      const emptyClient = makeClient();

      await gateway.handleConnection(client);
      await gateway.handleConnection(emptyClient);

      expect(emitted(client, 'connected')[0][1].missedEvents).toEqual([]);
      expect(emitted(emptyClient, 'connected')[0][1].missedEvents).toEqual([]);
    });
  });

  describe('sync payloads', () => {
    it('sends lock, viewers and version in schedule:sync on subscription', async () => {
      seedSchedule();
      const lock = { userId: 'u-1', userName: 'User One' };
      locks.getScheduleLock.mockReturnValue(lock);
      presence.getScheduleViewers.mockReturnValue([{ userId: 'u-2' }]);
      concurrency.getVersionInfo.mockReturnValue({ currentVersion: 7 });
      const client = makeClient();

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).toHaveBeenCalledWith('schedule:s-1');
      expect(emitted(client, 'schedule:sync')[0][1]).toEqual({
        scheduleId: 's-1',
        lock,
        viewers: [{ userId: 'u-2' }],
        currentVersion: 7,
        timestamp: expect.any(String),
      });
    });

    it('sends a full sync to the requesting client on forceSync', async () => {
      seedSchedule();
      concurrency.getVersionInfo.mockReturnValue({ currentVersion: 9 });
      const client = makeClient();

      await gateway.handleForceSync(client, { scheduleId: 's-1' });

      expect(emitted(client, 'schedule:sync')[0][1]).toEqual(
        expect.objectContaining({ scheduleId: 's-1', currentVersion: 9 }),
      );
      expect(roomTo).not.toHaveBeenCalled();
    });

    it('leaves the room and removes the viewer on unsubscribe', () => {
      const client = makeClient();

      gateway.handleUnsubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.leave).toHaveBeenCalledWith('schedule:s-1');
      expect(presence.removeFromSchedule).toHaveBeenCalledWith('u-1', 's-1');
    });
  });

  describe('room broadcasts', () => {
    it('emits personnel:update only when an organization is present', async () => {
      await gateway.broadcastPersonnelUpdate({
        action: 'updated', personnelId: 'p-1', personnelName:'Person One',
      });
      expect(roomTo).not.toHaveBeenCalled();

      await gateway.broadcastPersonnelUpdate({
        action: 'updated', personnelId: 'p-1', personnelName: 'Person One',
        organizationId: 'org-1', updatedBy: 'u-1',
      });

      expect(roomTo).toHaveBeenCalledWith('org:org-1');
      expect(roomEmit).toHaveBeenCalledWith('personnel:update', expect.objectContaining({
        action: 'updated', personnelId: 'p-1', organizationId: 'org-1',
        timestamp: expect.any(String),
      }));
    });

    it('targets org and schedule rooms for alerts, with org optional', async () => {
      await gateway.broadcastAlertUpdate({
        scheduleId: 's-1', unitId: 'unit-1', organizationId: 'org-1',
      });

      expect(roomTo.mock.calls.map(([room]: [string]) => room)).toEqual([
        'org:org-1', 'schedule:s-1',
      ]);
      expect(roomEmit).toHaveBeenCalledWith('alerts:updated', expect.objectContaining({ scheduleId: 's-1' }));

      roomTo.mockClear();
      roomEmit.mockClear();
      await gateway.broadcastAlertUpdate({ scheduleId: 's-1', unitId: 'unit-1' });

      expect(roomTo.mock.calls.map(([room]: [string]) => room)).toEqual(['schedule:s-1']);
    });

    it('targets the unit room for device incidents and org/unit for handover notes', async () => {
      const incident = { id: 'i-1', issueType: 'leak', severity: 'high', deviceName: 'Pump 1' };
      await gateway.broadcastDeviceIncident({ unitId: 'unit-1', incident });

      expect(roomTo).toHaveBeenCalledWith('unit:unit-1');
      expect(roomEmit).toHaveBeenCalledWith('incident:new', incident);

      roomTo.mockClear();
      roomEmit.mockClear();
      const note = {
        id: 'n-1', title: 'Note', priority: 'normal',
        authorName: 'User One', unitName: 'Unit 1', createdAt: new Date().toISOString(),
      };
      await gateway.broadcastHandoverNote({
        organizationId: 'org-1', unitId: 'unit-1', note,
      });

      expect(roomTo.mock.calls.map(([room]: [string]) => room)).toEqual([
        'org:org-1', 'unit:unit-1',
      ]);
      expect(roomEmit).toHaveBeenCalledWith('handover-note:new', note);
    });
  });

  describe('30 second cleanup', () => {
    it('offlines stale users, expires stale locks and prunes dedup/rate-limit state', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
      const now = Date.now();
      presence.getStaleUsers.mockReturnValue([{ userId: 'u-stale', organizationId: 'org-1' }]);
      locks.getExpiredLocks.mockReturnValue([{ scheduleId: 's-9', userId: 'u-stale' }]);
      (gateway as any).processedEvents.set('2000_stale', now - 60000);
      (gateway as any).connectionAttempts.set('1.2.3.4', { count: 2, firstAttempt: now - 120000 });
      (gateway as any).reconnectTimestamps.set('5.6.7.8', now - 60000);

      gateway.afterInit(undefined as any);
      await vi.advanceTimersByTimeAsync(30000);

      expect(presence.setOffline).toHaveBeenCalledWith('u-stale');
      expect(roomTo).toHaveBeenCalledWith('org:org-1');
      expect(locks.forceReleaseLock).toHaveBeenCalledWith('s-9');
      expect(roomEmit).toHaveBeenCalledWith('lockExpired', expect.objectContaining({ scheduleId: 's-9' }));
      expect((gateway as any).processedEvents.has('2000_stale')).toBe(false);
      expect((gateway as any).connectionAttempts.size).toBe(0);
      expect((gateway as any).reconnectTimestamps.size).toBe(0);
    });

    it('keeps stale entries that still have a connected client', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
      presence.getStaleUsers.mockReturnValue([{ userId: 'u-stale', organizationId: 'org-1' }]);
      locks.getExpiredLocks.mockReturnValue([{ scheduleId: 's-9', userId: 'u-stale' }]);
      (gateway as any).connectedClients.set('socket-9', makeClient({
        id: 'socket-9', userId: 'u-stale', connected: true,
      }));

      gateway.afterInit(undefined as any);
      await vi.advanceTimersByTimeAsync(30000);

      expect(presence.setOffline).not.toHaveBeenCalled();
      expect(locks.forceReleaseLock).not.toHaveBeenCalled();
    });
  });

  describe('session revocation', () => {
    it('returns false for a session with no socket mapping', async () => {
      await expect(gateway.disconnectSession('sess-unknown', 'logout')).resolves.toBe(false);
    });

    it('drops a stale mapping when the socket is gone', async () => {
      (gateway as any).sessionSockets.set('sess-1', 'socket-missing');

      await expect(gateway.disconnectSession('sess-1')).resolves.toBe(false);

      expect((gateway as any).sessionSockets.has('sess-1')).toBe(false);
    });

    it('emits session:revoked and disconnects the live socket', async () => {
      const client = makeClient();
      (gateway as any).connectedClients.set(client.id, client);
      (gateway as any).sessionSockets.set('sess-1', client.id);

      await expect(gateway.disconnectSession('sess-1', 'forced logout')).resolves.toBe(true);

      expect(emitted(client, 'session:revoked')[0][1]).toEqual({
        reason: 'forced logout', timestamp: expect.any(String),
      });
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('authorization entry-point edge paths', () => {
    it('denies an unauthenticated socket without querying the database', async () => {
      const client = makeClient({ userId: undefined });

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('UNAUTHENTICATED');
    });

    it('denies a request without a schedule id', async () => {
      const client = makeClient();

      await gateway.handleSubscribeSchedule(client, { scheduleId: undefined as unknown as string });

      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('INVALID_REQUEST');
    });

    it('denies an unknown schedule', async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);
      const client = makeClient();

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-missing' });

      expect(emitted(client, 'error')[0][1].code).toBe('NOT_FOUND');
    });

    it('lets the platform administrator through when the schedule tenant is unresolved', async () => {
      seedSchedule({ organizationId: null, unit: { organizationId: null } });
      const client = makeClient({ userRole: 'system_admin', organizationId: undefined });

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).toHaveBeenCalledWith('schedule:s-1');
    });

    it('denies a field supervisor without a unit context', async () => {
      seedSchedule();
      const client = makeClient({ userRole: 'field_supervisor', unitId: undefined });

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('FORBIDDEN');
    });
  });
});
