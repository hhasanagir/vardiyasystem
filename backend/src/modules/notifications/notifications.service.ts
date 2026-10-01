import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationType } from './interfaces/notification-type.enum';
import {
  NotificationPriority,
  PRIORITY_LEVELS,
} from './interfaces/notification-priority.enum';
import { DeliveryChannel } from './interfaces/channel-type.enum';
import { NotificationFilter } from './interfaces/notification.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    senderId?: string;
  }) {
    const notif = await this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        type: data.type as any,
        priority: data.priority || 'NORMAL',
        title: data.title,
        message: data.message,
        data: data.data as any,
        senderId: data.senderId,
        status: 'PENDING',
      },
    });
    return notif;
  }

  async addRecipient(notificationId: string, userId: string) {
    return this.prisma.notificationRecipient
      .create({
        data: { notificationId, userId },
      })
      .catch(() => {
        // duplicate ignored
      });
  }

  async addRecipients(notificationId: string, userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    // Only real active users can receive notifications (prevents FK violations).
    const existing = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    const validIds = existing.map((u) => u.id);
    if (validIds.length === 0) return [];

    await this.prisma.notificationRecipient.createMany({
      data: validIds.map((userId) => ({ notificationId, userId })),
      skipDuplicates: true,
    });
    return validIds;
  }

  async createDelivery(
    notificationId: string,
    recipientId: string,
    channel: DeliveryChannel,
  ) {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        recipientId,
        channel: channel as any,
        status: 'PENDING',
      },
    });
  }

  async getUserNotifications(
    userId: string,
    filter?: NotificationFilter,
    limit = 50,
    offset = 0,
  ) {
    const where: any = {
      recipients: { some: { userId, isDeleted: false } },
    };
    if (filter?.types?.length) where.type = { in: filter.types };
    if (filter?.priorities?.length) where.priority = { in: filter.priorities };
    if (filter?.isRead !== undefined) {
      where.recipients = {
        some: { userId, isDeleted: false, isRead: filter.isRead },
      };
    }
    if (filter?.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { message: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter?.startDate)
      where.createdAt = { ...where.createdAt, gte: filter.startDate };
    if (filter?.endDate)
      where.createdAt = { ...where.createdAt, lte: filter.endDate };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          recipients: {
            where: { userId },
            select: {
              id: true,
              userId: true,
              isRead: true,
              readAt: true,
              createdAt: true,
              isDeleted: true,
            },
          },
          deliveries: {
            where: { recipientId: userId },
            select: {
              id: true,
              channel: true,
              status: true,
              deliveredAt: true,
              readAt: true,
              clickedAt: true,
              failedAt: true,
              errorMessage: true,
              attemptCount: true,
            },
          },
          sender: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notificationRecipient.count({
      where: { userId, isRead: false, isDeleted: false },
    });
    return { count };
  }

  async getUnreadCountByType(userId: string) {
    const results = await this.prisma.notificationRecipient.findMany({
      where: { userId, isRead: false, isDeleted: false },
      include: { notification: { select: { type: true } } },
    });
    const byType: Record<string, number> = {};
    for (const r of results) {
      const t = r.notification.type;
      byType[t] = (byType[t] || 0) + 1;
    }
    return byType;
  }

  async markAsRead(notificationId: string, userId: string) {
    await this.prisma.notificationRecipient.updateMany({
      where: { notificationId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await this.prisma.notificationDelivery.updateMany({
      where: {
        notificationId,
        recipientId: userId,
        status: { not: 'READ' },
      },
      data: { status: 'READ', readAt: new Date() },
    });
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    const now = new Date();
    await this.prisma.notificationRecipient.updateMany({
      where: { userId, isRead: false, isDeleted: false },
      data: { isRead: true, readAt: now },
    });
    await this.prisma.notificationDelivery.updateMany({
      where: { recipientId: userId, status: { not: 'READ' } },
      data: { status: 'READ', readAt: now },
    });
    return { success: true, timestamp: now };
  }

  async deleteNotification(notificationId: string, userId: string) {
    await this.prisma.notificationRecipient.updateMany({
      where: { notificationId, userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { success: true };
  }

  async markClicked(
    notificationId: string,
    userId: string,
    channel?: DeliveryChannel,
  ) {
    const where: any = { notificationId, recipientId: userId };
    if (channel) where.channel = channel;
    await this.prisma.notificationDelivery.updateMany({
      where,
      data: { status: 'CLICKED', clickedAt: new Date() },
    });
  }

  async getNotificationById(id: string) {
    return this.prisma.notification.findUnique({
      where: { id },
      include: {
        recipients: true,
        deliveries: true,
        sender: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(notificationId: string, status: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: status as any },
    });
  }
}
