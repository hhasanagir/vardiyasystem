import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma.service';

/**
 * Phase 5c49 — coverage wave 1. VAPID, push endpoints and payloads are mocked:
 * no keys are read from .env and no push network call is made.
 */
const webpushMock = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('web-push', () => webpushMock);

import { PushSubscriptionsService, type PushSubscriptionData } from '../push-subscriptions.service';

describe('PushSubscriptionsService — VAPID and subscription behaviour', () => {
  const subscription = (suffix: string): PushSubscriptionData => ({
    endpoint: `https://push.example.test/${suffix}`,
    keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` },
  });

  const record = (suffix: string, userId = 'user-1') => ({
    id: `sub-${suffix}`,
    userId,
    endpoint: subscription(suffix).endpoint,
    p256dh: subscription(suffix).keys.p256dh,
    auth: subscription(suffix).keys.auth,
  });

  interface WebPushModel {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  }

  let prisma: { webPushSubscription: WebPushModel };
  let config: { get: ReturnType<typeof vi.fn> };

  const makeService = (keys: Record<string, string> = {}) => {
    config = {
      get: vi.fn((key: string, fallback?: string) => keys[key] ?? fallback),
    };
    prisma = {
      webPushSubscription: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    };
    return new PushSubscriptionsService(config as unknown as ConfigService, prisma as unknown as PrismaService);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    webpushMock.sendNotification.mockResolvedValue(undefined);
  });

  it('registers VAPID details when both keys are configured', () => {
    makeService({
      VAPID_PUBLIC_KEY: 'public-test-key',
      VAPID_PRIVATE_KEY: 'private-test-key',
    });

    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith(
      'mailto:vardiyaos@hospital.com',
      'public-test-key',
      'private-test-key',
    );
  });

  it('honours an explicit VAPID subject', () => {
    makeService({
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:ops@example.test',
    });

    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.test', 'pub', 'priv');
  });

  it('updates an existing endpoint instead of creating a duplicate subscription', async () => {
    const service = makeService();
    const sub = subscription('a');
    prisma.webPushSubscription.findUnique.mockResolvedValue(record('a'));

    await service.subscribe('user-1', sub);

    expect(prisma.webPushSubscription.update).toHaveBeenCalledWith({
      where: { endpoint: sub.endpoint },
      data: { auth: sub.keys.auth, p256dh: sub.keys.p256dh },
    });
    expect(prisma.webPushSubscription.create).not.toHaveBeenCalled();
  });

  it('creates a new subscription when the endpoint is unknown', async () => {
    const service = makeService();
    const sub = subscription('b');
    prisma.webPushSubscription.findUnique.mockResolvedValue(null);

    await service.subscribe('user-2', sub);

    expect(prisma.webPushSubscription.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-2',
        endpoint: sub.endpoint,
        auth: sub.keys.auth,
        p256dh: sub.keys.p256dh,
      },
    });
  });

  it('unsubscribes one endpoint or all endpoints of a user', async () => {
    const service = makeService();

    await service.unsubscribe('user-1', 'https://push.example.test/a');
    await service.unsubscribe('user-2');

    expect(prisma.webPushSubscription.deleteMany.mock.calls).toEqual([
      [{ where: { userId: 'user-1', endpoint: 'https://push.example.test/a' } }],
      [{ where: { userId: 'user-2' } }],
    ]);
  });

  it('maps stored rows to { endpoint, keys } and groups them by user', async () => {
    const service = makeService();
    const rows = [record('a'), record('b'), record('c', 'user-2')];
    prisma.webPushSubscription.findMany
      .mockResolvedValueOnce([record('a'), record('b')])
      .mockResolvedValueOnce(rows);

    await expect(service.getSubscriptions('user-1')).resolves.toEqual([
      { endpoint: subscription('a').endpoint, keys: { p256dh: subscription('a').keys.p256dh, auth: subscription('a').keys.auth } },
      { endpoint: subscription('b').endpoint, keys: { p256dh: subscription('b').keys.p256dh, auth: subscription('b').keys.auth } },
    ]);
    expect(prisma.webPushSubscription.findMany.mock.calls[0][0]).toEqual({ where: { userId: 'user-1' } });

    const all = await service.getAllSubscriptions();
    expect([...all.keys()]).toEqual(['user-1', 'user-2']);
    expect(all.get('user-1')).toHaveLength(2);
    expect(all.get('user-2')).toHaveLength(1);
  });

  it('does not send when VAPID is not configured', async () => {
    const service = makeService();
    const payload = { title: 'T', body: 'B' };

    await expect(service.sendPush('user-1', payload)).resolves.toBe(false);
    await expect(service.broadcastPush(payload)).resolves.toBe(0);
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
    expect(prisma.webPushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('sends a push with the exact payload/options and drops only stale (410/404) endpoints', async () => {
    const service = makeService({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    const payload = { title: 'T', body: 'B', icon: '/icon.svg', data: { scheduleId: 'sched-1' } };
    prisma.webPushSubscription.findMany.mockResolvedValue([record('a'), record('b'), record('c')]);
    webpushMock.sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('transient'), { statusCode: 500 }));

    await expect(service.sendPush('user-1', payload)).resolves.toBe(true);

    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(3);
    expect(webpushMock.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription('a').endpoint, keys: subscription('a').keys },
      JSON.stringify(payload),
      { TTL: 86400, urgency: 'normal' },
    );
    expect(prisma.webPushSubscription.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.webPushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: subscription('b').endpoint },
    });
  });

  it('returns false when a configured user has no subscriptions', async () => {
    const service = makeService({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    prisma.webPushSubscription.findMany.mockResolvedValue([]);

    await expect(service.sendPush('user-1', { title: 'T', body: 'B' })).resolves.toBe(false);
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it('broadcasts to all subscribers, counts successes and removes stale rows by id', async () => {
    const service = makeService({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    const payload = { title: 'T', body: 'B' };
    prisma.webPushSubscription.findMany.mockResolvedValue([record('a'), record('b')]);
    prisma.webPushSubscription.delete.mockRejectedValueOnce(new Error('already gone'));
    webpushMock.sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }));

    await expect(service.broadcastPush(payload)).resolves.toBe(1);

    expect(webpushMock.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription('a').endpoint, keys: subscription('a').keys },
      JSON.stringify(payload),
      { TTL: 86400 },
    );
    expect(prisma.webPushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-b' } });
  });
});
