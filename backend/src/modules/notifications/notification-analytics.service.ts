import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class NotificationAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(organizationId?: string) {
    const where: any = {};
    if (organizationId) where.organizationId = organizationId;

    const [total, byType, byPriority, byStatus] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.prisma.notification.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      this.prisma.notification.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: byType.map((t: any) => ({ type: t.type, count: t._count })),
      byPriority: byPriority.map((p: any) => ({
        priority: p.priority,
        count: p._count,
      })),
      byStatus: byStatus.map((s: any) => ({
        status: s.status,
        count: s._count,
      })),
    };
  }

  async getUserEngagement(userId: string) {
    const [totalNotifications, readNotifications, clickedNotifications] =
      await Promise.all([
        this.prisma.notificationRecipient.count({
          where: { userId, isDeleted: false },
        }),
        this.prisma.notificationRecipient.count({
          where: { userId, isRead: true },
        }),
        this.prisma.notificationDelivery.count({
          where: { recipientId: userId, status: 'CLICKED' },
        }),
      ]);

    return {
      totalNotifications,
      readPercentage:
        totalNotifications > 0
          ? (readNotifications / totalNotifications) * 100
          : 0,
      clickPercentage:
        totalNotifications > 0
          ? (clickedNotifications / totalNotifications) * 100
          : 0,
    };
  }
}
