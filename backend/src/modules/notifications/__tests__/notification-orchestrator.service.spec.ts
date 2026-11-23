import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationOrchestratorService } from '../notification-orchestrator.service';
import { EVENT_NAMES, AGGREGATE_TYPES } from '../../../events/domain-event.interface';
import { NOTIFICATION_TYPES, type NotificationType } from '../interfaces/notification-type.enum';
import { DELIVERY_CHANNELS } from '../interfaces/channel-type.enum';

/** Phase 5c49 — coverage wave 1: orchestration, delivery fan-out and audit event. */
describe('NotificationOrchestratorService', () => {
  const prisma = { user: { findMany: vi.fn() } };
  const notifications = {
    create: vi.fn(),
    addRecipients: vi.fn(),
    createDelivery: vi.fn(),
    updateStatus: vi.fn(),
  };
  const dispatcher = { dispatch: vi.fn() };
  const tracker = {};
  const auditLog = {};
  const eventBus = { publish: vi.fn() };
  let service: NotificationOrchestratorService;

  const baseData: {
    organizationId: string;
    type: NotificationType;
    title: string;
    message: string;
    recipientIds: string[];
  } = {
    organizationId: 'org-1',
    type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
    title: 'Başlık',
    message: 'Mesaj',
    recipientIds: ['user-1', 'user-2'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    notifications.create.mockResolvedValue({ id: 'notif-1' });
    notifications.addRecipients.mockResolvedValue(['user-1', 'user-2']);
    notifications.createDelivery.mockResolvedValue(undefined);
    notifications.updateStatus.mockResolvedValue(undefined);
    dispatcher.dispatch.mockResolvedValue(undefined);
    prisma.user.findMany.mockResolvedValue([{ id: 'active-1' }, { id: 'active-2' }]);
    service = new NotificationOrchestratorService(
      prisma as any,
      notifications as any,
      dispatcher as any,
      tracker as any,
      auditLog as any,
      eventBus as any,
    );
  });

  it('fans out deliveries per recipient and channel, then publishes a NOTIFICATION_SENT event', async () => {
    const result = await service.send({ ...baseData, channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL] });

    expect(result).toEqual({ id: 'notif-1' });
    expect(notifications.createDelivery).toHaveBeenCalledTimes(4);
    expect(notifications.createDelivery).toHaveBeenCalledWith('notif-1', 'user-2', DELIVERY_CHANNELS.EMAIL);
    expect(notifications.updateStatus).toHaveBeenCalledWith('notif-1', 'SENT');
    expect(dispatcher.dispatch).toHaveBeenCalledWith('notif-1', ['user-1', 'user-2'],
      [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
      expect.objectContaining({ type: baseData.type, priority: 'NORMAL', bypassPrefs: false }));
    const [published] = eventBus.publish.mock.calls[0] as unknown as Array<{
      eventName: string;
      aggregateId: string;
      aggregateType: string;
      payload: Record<string, unknown>;
    }>;
    expect(published).toMatchObject({
      eventName: EVENT_NAMES.NOTIFICATION_SENT,
      aggregateId: 'notif-1',
      aggregateType: AGGREGATE_TYPES.NOTIFICATION,
    });
    expect(published.payload).toMatchObject({
      notificationId: 'notif-1',
      recipientCount: 2,
      channels: 'IN_APP,EMAIL',
      organizationId: 'org-1',
    });
  });

  it('bypasses user preferences for CRITICAL notifications', async () => {
    await service.send({ ...baseData, priority: 'CRITICAL' });

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'notif-1', ['user-1', 'user-2'], [DELIVERY_CHANNELS.IN_APP],
      expect.objectContaining({ priority: 'CRITICAL', bypassPrefs: true }),
    );
  });

  it('resolves active users in the organisation before delegating to send', async () => {
    const send = vi.spyOn(service, 'send').mockResolvedValue({ id: 'notif-1' } as any);

    await service.sendToAllUsers({
      organizationId: 'org-1',
      type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
      title: 'Duyuru',
      message: 'Mesaj',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isActive: true },
      select: { id: true },
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['active-1', 'active-2'] }));
  });

  it('forces emergency type, CRITICAL priority and all four channels', async () => {
    const send = vi.spyOn(service, 'send').mockResolvedValue({ id: 'notif-1' } as any);

    await service.sendEmergency({
      organizationId: 'org-1',
      title: 'Acil',
      message: 'Tahliye',
      recipientIds: ['user-1'],
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EMERGENCY_ALERT',
      priority: 'CRITICAL',
      channels: [
        DELIVERY_CHANNELS.IN_APP,
        DELIVERY_CHANNELS.FCM,
        DELIVERY_CHANNELS.EMAIL,
        DELIVERY_CHANNELS.WEB_PUSH,
      ],
    }));
  });
});
