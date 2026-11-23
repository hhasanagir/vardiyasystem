import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelDispatcherService } from '../channel-dispatcher.service';
import { DELIVERY_CHANNELS, type DeliveryChannel } from '../interfaces/channel-type.enum';

/** Phase 5c49 — coverage wave 1: channel routing, preferences and failure isolation. */
describe('ChannelDispatcherService', () => {
  const prisma = { notificationDelivery: { updateMany: vi.fn() } };
  const webPushSender = { send: vi.fn() };
  const fcmSender = { send: vi.fn(), isEnabled: vi.fn() };
  const emailSender = { send: vi.fn() };
  const smsSender = { send: vi.fn() };
  const gateway = { broadcastNotification: vi.fn() };
  const metrics = {};
  const preferenceService = { getPreferences: vi.fn() };
  let service: ChannelDispatcherService;

  const context = (overrides: Record<string, unknown> = {}) => ({
    type: 'SYSTEM_ANNOUNCEMENT',
    title: 'Başlık',
    message: 'Mesaj',
    data: { scheduleId: 'sched-1' },
    priority: 'NORMAL',
    bypassPrefs: false,
    ...overrides,
  });

  const enabledPrefs = { pushEnabled: true, emailEnabled: true, smsEnabled: true };

  interface DeliveryUpdateCall {
    where: { channel: DeliveryChannel; notificationId: string; recipientId: string };
    data: { status: string; deliveredAt?: Date; failedAt?: Date; errorMessage?: string; attemptCount?: unknown };
  }

  const updateCalls = (): DeliveryUpdateCall[] =>
    prisma.notificationDelivery.updateMany.mock.calls.map(
      ([call]) => call as unknown as DeliveryUpdateCall,
    );

  const updatesFor = (channel: DeliveryChannel) =>
    updateCalls().filter((call) => call.where.channel === channel);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    webPushSender.send.mockResolvedValue(true);
    fcmSender.send.mockResolvedValue(true);
    fcmSender.isEnabled.mockReturnValue(true);
    emailSender.send.mockResolvedValue(true);
    smsSender.send.mockResolvedValue(true);
    gateway.broadcastNotification.mockResolvedValue(undefined);
    preferenceService.getPreferences.mockResolvedValue(enabledPrefs);
    service = new ChannelDispatcherService(
      prisma as any,
      webPushSender as any,
      fcmSender as any,
      emailSender as any,
      smsSender as any,
      gateway as any,
      metrics as any,
      preferenceService as any,
    );
  });

  it('routes every channel to its sender and records SENT deliveries', async () => {
    await service.dispatch('notif-1', ['user-1'], [
      DELIVERY_CHANNELS.IN_APP,
      DELIVERY_CHANNELS.WEB_PUSH,
      DELIVERY_CHANNELS.FCM,
      DELIVERY_CHANNELS.EMAIL,
      DELIVERY_CHANNELS.SMS,
    ], context());

    expect(gateway.broadcastNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', organizationId: '' }));
    expect(webPushSender.send).toHaveBeenCalledWith('user-1', expect.objectContaining({
      data: { scheduleId: 'sched-1', notificationId: 'notif-1', type: 'SYSTEM_ANNOUNCEMENT' },
    }));
    expect(fcmSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(smsSender.send).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(DELIVERY_CHANNELS)) {
      const updates = updatesFor(channel);
      expect(updates).toHaveLength(1);
      expect(updates[0].data).toMatchObject({ status: 'SENT', attemptCount: { increment: 1 } });
      expect(updates[0].data.deliveredAt).toBeInstanceOf(Date);
    }
  });

  it('skips channels disabled by user preferences', async () => {
    preferenceService.getPreferences.mockResolvedValue({
      pushEnabled: false,
      emailEnabled: false,
      smsEnabled: false,
    });

    await service.dispatch('notif-1', ['user-1'], [
      DELIVERY_CHANNELS.WEB_PUSH, DELIVERY_CHANNELS.EMAIL, DELIVERY_CHANNELS.SMS,
    ], context());

    expect(webPushSender.send).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(smsSender.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('does not consult preferences when bypassPrefs is set', async () => {
    await service.dispatch('notif-1', ['user-1'], [DELIVERY_CHANNELS.EMAIL], context({ bypassPrefs: true }));

    expect(preferenceService.getPreferences).not.toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('short-circuits FCM when the sender is disabled', async () => {
    fcmSender.isEnabled.mockReturnValue(false);

    await service.dispatch('notif-1', ['user-1'], [DELIVERY_CHANNELS.FCM], context());

    expect(fcmSender.send).not.toHaveBeenCalled();
  });

  it('writes FAILED with an error message when a sender reports failure', async () => {
    webPushSender.send.mockResolvedValue(false);

    await service.dispatch('notif-1', ['user-1'], [DELIVERY_CHANNELS.WEB_PUSH], context());

    const [update] = updatesFor(DELIVERY_CHANNELS.WEB_PUSH);
    expect(update.data).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Web push send failed',
      attemptCount: { increment: 1 },
    });
    expect(update.data.failedAt).toBeInstanceOf(Date);
  });

  it('isolates one channel failure so other channels still dispatch', async () => {
    emailSender.send.mockRejectedValueOnce(new Error('smtp down'));
    gateway.broadcastNotification.mockRejectedValueOnce(new Error('socket down'));

    await expect(service.dispatch('notif-1', ['user-1'], [
      DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL, DELIVERY_CHANNELS.SMS,
    ], context())).resolves.toBeUndefined();

    expect(smsSender.send).toHaveBeenCalledTimes(1);
    expect(updatesFor(DELIVERY_CHANNELS.IN_APP)).toHaveLength(1);
    expect(updatesFor(DELIVERY_CHANNELS.SMS)).toHaveLength(1);
  });
});
