import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushSubscriptionsController } from '../push-subscriptions.controller';
import type { PushSubscriptionsService, PushSubscriptionData } from '../push-subscriptions.service';
import type { SendPushDto } from '../dto/send-push.dto';

/** Phase 5c49 — coverage wave 1: controller wiring and DTO defaults. */
describe('PushSubscriptionsController', () => {
  const pushService = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    sendPush: vi.fn(),
    broadcastPush: vi.fn(),
  };
  let controller: PushSubscriptionsController;

  beforeEach(() => {
    vi.clearAllMocks();
    pushService.sendPush.mockResolvedValue(true);
    pushService.broadcastPush.mockResolvedValue(3);
    controller = new PushSubscriptionsController(pushService as unknown as PushSubscriptionsService);
  });

  it('registers the subscription for the authenticated user', () => {
    const body: PushSubscriptionData = {
      endpoint: 'https://push.example.test/a',
      keys: { p256dh: 'p', auth: 'a' },
    };

    expect(controller.subscribe(body, { user: { userId: 'user-1' } })).toEqual({ success: true });
    expect(pushService.subscribe).toHaveBeenCalledWith('user-1', body);
  });

  it('unsubscribes the authenticated user without trusting a body-provided id', () => {
    expect(controller.unsubscribe({ user: { userId: 'user-2' } })).toEqual({ success: true });
    expect(pushService.unsubscribe).toHaveBeenCalledWith('user-2');
  });

  it('maps send DTO defaults for icon, badge and actions', async () => {
    const dto = { userId: 'user-1', title: 'T', body: 'B', data: { k: 'v' } } as SendPushDto;

    await expect(controller.send(dto)).resolves.toEqual({ success: true });
    expect(pushService.sendPush).toHaveBeenCalledWith('user-1', {
      title: 'T',
      body: 'B',
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-72.svg',
      data: { k: 'v' },
      actions: [{ action: 'view', title: 'Görüntüle' }],
    });
  });

  it('keeps caller-supplied icon, badge and actions when present', async () => {
    const dto = {
      userId: 'user-1', title: 'T', body: 'B',
      icon: '/custom.png', badge: '/custom-badge.png',
      actions: [{ action: 'open', title: 'Aç' }],
    } as SendPushDto;

    await controller.send(dto);

    expect(pushService.sendPush).toHaveBeenCalledWith('user-1', {
      title: 'T',
      body: 'B',
      icon: '/custom.png',
      badge: '/custom-badge.png',
      data: undefined,
      actions: [{ action: 'open', title: 'Aç' }],
    });
  });

  it('broadcasts with fixed defaults and returns the number sent', async () => {
    await expect(controller.broadcast({ title: 'T', body: 'B' })).resolves.toEqual({ sent: 3 });
    expect(pushService.broadcastPush).toHaveBeenCalledWith({
      title: 'T',
      body: 'B',
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-72.svg',
      data: undefined,
      actions: [{ action: 'view', title: 'Görüntüle' }],
    });
  });
});
