import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from '../notifications.service';
import { DELIVERY_CHANNELS } from '../interfaces/channel-type.enum';

/** Phase 5c49 — coverage wave 1: notification persistence, filters and tenant-scoped mutations. */
describe('NotificationsService', () => {
  const prisma = {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notificationRecipient: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationDelivery: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findMany: vi.fn() },
  };
  let service: NotificationsService;

  interface CreateArgs {
    data: Record<string, unknown>;
  }

  interface FindManyArgs {
    where: Record<string, unknown>;
    take: number;
    skip: number;
  }

  interface UpdateManyArgs {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }

  const createArgs = (index: number): CreateArgs => {
    const value: unknown = prisma.notification.create.mock.calls[index][0];
    return value as CreateArgs;
  };
  const findManyArgs = (): FindManyArgs => {
    const value: unknown = prisma.notification.findMany.mock.calls[0][0];
    return value as FindManyArgs;
  };
  const recipientUpdates = (): UpdateManyArgs[] =>
    prisma.notificationRecipient.updateMany.mock.calls.map(([call]) => call as unknown as UpdateManyArgs);
  const deliveryUpdates = (): UpdateManyArgs[] =>
    prisma.notificationDelivery.updateMany.mock.calls.map(([call]) => call as unknown as UpdateManyArgs);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
    prisma.notification.findMany.mockResolvedValue([{ id: 'notif-1' }]);
    prisma.notification.count.mockResolvedValue(7);
    prisma.notificationRecipient.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    service = new NotificationsService(prisma as any);
  });

  it('creates a notification with PENDING/NORMAL defaults and keeps an explicit priority', async () => {
    await service.create({
      organizationId: 'org-1',
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Başlık',
      message: 'Mesaj',
    });

    expect(createArgs(0).data).toMatchObject({
      organizationId: 'org-1',
      priority: 'NORMAL',
      status: 'PENDING',
      title: 'Başlık',
      message: 'Mesaj',
    });

    await service.create({
      organizationId: 'org-1',
      type: 'SYSTEM_ANNOUNCEMENT',
      priority: 'HIGH',
      title: 'Başlık',
      message: 'Mesaj',
    });

    expect(createArgs(1).data.priority).toBe('HIGH');
  });

  it('creates deliveries as PENDING and swallows duplicate recipients', async () => {
    await service.createDelivery('notif-1', 'rec-1', DELIVERY_CHANNELS.EMAIL);

    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: { notificationId: 'notif-1', recipientId: 'rec-1', channel: DELIVERY_CHANNELS.EMAIL, status: 'PENDING' },
    });

    prisma.notificationRecipient.create.mockRejectedValueOnce(new Error('duplicate'));
    await expect(service.addRecipient('notif-1', 'user-1')).resolves.toBeUndefined();
  });

  it('builds the combined where clause for getUserNotifications and returns pagination metadata', async () => {
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-30T00:00:00.000Z');

    const result = await service.getUserNotifications('user-1', {
      types: ['SYSTEM_ANNOUNCEMENT'],
      priorities: ['HIGH'],
      isRead: false,
      search: 'vardiya',
      startDate: start,
      endDate: end,
    }, 25, 10);

    const expectedWhere = {
      recipients: { some: { userId: 'user-1', isDeleted: false, isRead: false } },
      type: { in: ['SYSTEM_ANNOUNCEMENT'] },
      priority: { in: ['HIGH'] },
      OR: [
        { title: { contains: 'vardiya', mode: 'insensitive' } },
        { message: { contains: 'vardiya', mode: 'insensitive' } },
      ],
      createdAt: { gte: start, lte: end },
    };
    expect(findManyArgs().where).toEqual(expectedWhere);
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findManyArgs()).toMatchObject({ take: 25, skip: 10 });
    expect(result).toEqual({ data: [{ id: 'notif-1' }], total: 7, limit: 25, offset: 10 });
  });

  it('counts unread notifications and groups them by type', async () => {
    prisma.notificationRecipient.count.mockResolvedValue(3);
    prisma.notificationRecipient.findMany.mockResolvedValue([
      { notification: { type: 'SHIFT_SWAP_APPROVED' } },
      { notification: { type: 'SHIFT_SWAP_APPROVED' } },
      { notification: { type: 'DEVICE_INCIDENT' } },
    ]);

    await expect(service.getUnreadCount('user-1')).resolves.toEqual({ count: 3 });
    await expect(service.getUnreadCountByType('user-1')).resolves.toEqual({
      SHIFT_SWAP_APPROVED: 2,
      DEVICE_INCIDENT: 1,
    });

    expect(prisma.notificationRecipient.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false, isDeleted: false },
    });
  });

  it('scopes markAsRead to the recipient and does not cross users', async () => {
    await service.markAsRead('notif-1', 'user-1');

    expect(recipientUpdates()[0].where).toEqual({
      notificationId: 'notif-1',
      userId: 'user-1',
      isRead: false,
    });
    expect(deliveryUpdates()[0].where).toEqual({
      notificationId: 'notif-1',
      recipientId: 'user-1',
      status: { not: 'READ' },
    });
  });

  it('uses one shared readAt timestamp for recipients and deliveries in markAllAsRead', async () => {
    const result = await service.markAllAsRead('user-1');

    const [recipientUpdate, deliveryUpdate] = [recipientUpdates()[0], deliveryUpdates()[0]];
    expect(recipientUpdate.where).toEqual({ userId: 'user-1', isRead: false, isDeleted: false });
    expect(recipientUpdate.data.readAt).toBe(result.timestamp);
    expect(deliveryUpdate.where).toEqual({ recipientId: 'user-1', status: { not: 'READ' } });
    expect(deliveryUpdate.data.readAt).toBe(result.timestamp);
  });

  it('soft-deletes, marks clicks and updates status without widening the user scope', async () => {
    await service.deleteNotification('notif-1', 'user-2');
    expect(recipientUpdates()[0]).toMatchObject({
      where: { notificationId: 'notif-1', userId: 'user-2', isDeleted: false },
    });

    await service.markClicked('notif-1', 'user-2', DELIVERY_CHANNELS.EMAIL);
    expect(deliveryUpdates()[0].where).toEqual({
      notificationId: 'notif-1',
      recipientId: 'user-2',
      channel: DELIVERY_CHANNELS.EMAIL,
    });

    prisma.notificationDelivery.updateMany.mockClear();
    await service.markClicked('notif-1', 'user-2');
    expect(deliveryUpdates()[0].where).toEqual({
      notificationId: 'notif-1',
      recipientId: 'user-2',
    });
  });

  it('loads a notification with relations and updates its status', async () => {
    prisma.notification.findUnique.mockResolvedValue({ id: 'notif-1' });
    prisma.notification.update.mockResolvedValue({ id: 'notif-1', status: 'SENT' });

    await expect(service.getNotificationById('notif-1')).resolves.toEqual({ id: 'notif-1' });
    await expect(service.updateStatus('notif-1', 'SENT')).resolves.toEqual({ id: 'notif-1', status: 'SENT' });

    const findUniqueArgs = prisma.notification.findUnique.mock.calls[0][0] as unknown as {
      include: Record<string, unknown>;
    };
    expect(findUniqueArgs.include).toMatchObject({
      recipients: true,
      deliveries: true,
      sender: { select: { id: true, name: true } },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { status: 'SENT' },
    });
  });
});
