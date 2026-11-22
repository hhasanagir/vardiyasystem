/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
// The socket/Prisma doubles in this file are deliberately untyped: they emulate
// runtime payloads from socket.io, not domain types.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleGateway } from '../schedule.gateway';

/**
 * P0-5 — WebSocket authorization.
 *
 * A valid JWT at connect time is not enough: every schedule-scoped message
 * must be authorized against the target schedule's tenant, unit, role level
 * and publication state.
 */
describe('ScheduleGateway authorization (P0-5)', () => {
  let gateway: ScheduleGateway;
  let prisma: any;
  let tokenBlacklist: any;
  let jwt: any;
  let presence: any;
  let locks: any;
  let concurrency: any;
  let auditLog: any;
  let config: any;

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

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      authSession: { findUnique: vi.fn() },
      schedule: { findUnique: vi.fn() },
    };
    tokenBlacklist = { isBlacklisted: vi.fn().mockResolvedValue(false) };
    jwt = { verify: vi.fn().mockReturnValue({ sub: 'u-1', jti: 'jti-1', role: 'technician', organizationId: 'org-evil' }) };
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
      getScheduleLock: vi.fn().mockReturnValue({ userId: 'u-1', userName: 'User One' }),
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

    gateway = new ScheduleGateway(
      jwt,
      presence,
      locks,
      concurrency,
      prisma,
      auditLog,
      config,
      { isSessionValid: vi.fn().mockResolvedValue(true) } as any,
      tokenBlacklist,
      {
        wsEventsTotal: { inc: vi.fn() },
        wsConnectionsGauge: { inc: vi.fn(), dec: vi.fn() },
      } as any,
    );
    gateway.server = { to: vi.fn(() => ({ emit: vi.fn() })) } as any;
  });

  function emitted(client: any, event: string) {
    return client.emit.mock.calls.filter(([name]: [string]) => name === event);
  }

  describe('connection', () => {
    it('rejects a blacklisted (revoked) JWT', async () => {
      tokenBlacklist.isBlacklisted.mockResolvedValue(true);
      const client = makeClient();

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an inactive or deleted account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1', name: 'U', role: 'senior_technician',
        organizationId: 'org-1', unitId: 'unit-1', isActive: false,
      });
      const client = makeClient();

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].message).toMatch(/inactive|not found/i);
    });

    it('reloads authoritative role/org/unit from the database (stale token claims ignored)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1', name: 'Real Name', role: 'senior_technician',
        organizationId: 'org-1', unitId: 'unit-1', isActive: true,
      });
      const client = makeClient({
        handshake: { auth: { token: 'jwt-token', sessionId: 'session-1' }, headers: {}, address: '127.0.0.1' },
      });
      prisma.authSession.findUnique.mockResolvedValue({
        userId: 'u-1', revokedAt: null, expiresAt: new Date(Date.now() + 60000),
      });

      await gateway.handleConnection(client);

      expect(client.userRole).toBe('senior_technician');
      expect(client.organizationId).toBe('org-1');
      expect(client.unitId).toBe('unit-1');
      expect(client.sessionId).toBe('session-1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects a revoked session supplied by the client', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1', name: 'U', role: 'senior_technician',
        organizationId: 'org-1', unitId: 'unit-1', isActive: true,
      });
      prisma.authSession.findUnique.mockResolvedValue({
        userId: 'u-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000),
      });
      const client = makeClient({
        handshake: { auth: { token: 'jwt-token', sessionId: 'session-1' }, headers: {}, address: '127.0.0.1' },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('schedule-scoped messages', () => {
    function seedSchedule(overrides: Record<string, unknown> = {}) {
      prisma.schedule.findUnique.mockResolvedValue({
        id: 's-1',
        organizationId: 'org-1',
        unitId: 'unit-1',
        status: 'draft',
        ...overrides,
      });
    }

    it('denies cross-tenant subscription', async () => {
      seedSchedule({ organizationId: 'org-2' });
      const client = makeClient();

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('FORBIDDEN');
    });

    it('allows same-tenant subscription', async () => {
      seedSchedule();
      const client = makeClient();

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).toHaveBeenCalledWith('schedule:s-1');
    });

    it('denies strictly unit-scoped users from a sibling unit', async () => {
      seedSchedule();
      const client = makeClient({ userRole: 'field_supervisor', unitId: 'unit-2' });

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('FORBIDDEN');
    });

    it('fails closed when the socket has no tenant context', async () => {
      seedSchedule();
      const client = makeClient({ organizationId: undefined });

      await gateway.handleSubscribeSchedule(client, { scheduleId: 's-1' });

      expect(client.join).not.toHaveBeenCalled();
    });

    it('denies a low-role user from performing an update even with an edit lock', async () => {
      seedSchedule();
      const client = makeClient({ userRole: 'technician' });

      await gateway.handleScheduleUpdate(client, { scheduleId: 's-1', version: 1, changes: {} });

      expect(concurrency.checkAndUpdate).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('FORBIDDEN');
    });

    it('allows a senior technician to update an editable same-tenant schedule', async () => {
      seedSchedule();
      const client = makeClient();

      await gateway.handleScheduleUpdate(client, { scheduleId: 's-1', version: 1, changes: {} });

      expect(concurrency.checkAndUpdate).toHaveBeenCalled();
    });

    it('denies mutations on published/archived schedules (immutability)', async () => {
      seedSchedule({ status: 'published' });
      const client = makeClient();

      await gateway.handleScheduleUpdate(client, { scheduleId: 's-1', version: 1, changes: {} });

      expect(concurrency.checkAndUpdate).not.toHaveBeenCalled();
      expect(emitted(client, 'error')[0][1].code).toBe('IMMUTABLE');
    });

    it('denies lock acquisition to a low-role user', async () => {
      seedSchedule();
      const client = makeClient({ userRole: 'technician' });

      await gateway.handleAcquireLock(client, { scheduleId: 's-1' });

      expect(locks.acquireLock).not.toHaveBeenCalled();
    });

    it('denies cross-tenant presence events (typing/cursor)', async () => {
      seedSchedule({ organizationId: 'org-2' });
      const client = makeClient();

      await gateway.handleTyping(client, { scheduleId: 's-1', isTyping: true });
      await gateway.handleCursor(client, { scheduleId: 's-1', position: { x: 1, y: 2 } });

      expect(client.to).not.toHaveBeenCalled();
    });

    it('denies force-sync for a cross-tenant schedule', async () => {
      seedSchedule({ organizationId: 'org-2' });
      const client = makeClient();

      await gateway.handleForceSync(client, { scheduleId: 's-1' });

      expect(emitted(client, 'schedule:sync')).toHaveLength(0);
      expect(emitted(client, 'error')[0][1].code).toBe('FORBIDDEN');
    });
  });
});
