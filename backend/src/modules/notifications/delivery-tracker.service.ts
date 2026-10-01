import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { DeliveryChannel } from './interfaces/channel-type.enum';
import { DeliveryStats } from './interfaces/notification.interface';

@Injectable()
export class DeliveryTrackerService {
  private readonly logger = new Logger(DeliveryTrackerService.name);

  constructor(private prisma: PrismaService) {}

  async getDeliveryStats(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DeliveryStats> {
    const where: any = {};
    if (organizationId) where.notification = { organizationId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [total, sent, delivered, read, clicked, failed, pending] =
      await Promise.all([
        this.prisma.notificationDelivery.count({ where }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'SENT' },
        }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'DELIVERED' },
        }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'READ' },
        }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'CLICKED' },
        }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'FAILED' },
        }),
        this.prisma.notificationDelivery.count({
          where: { ...where, status: 'PENDING' },
        }),
      ]);

    const nonPending = total - pending;
    return {
      total,
      sent,
      delivered,
      read,
      clicked,
      failed,
      pending,
      deliveryRate:
        nonPending > 0 ? ((sent + delivered) / nonPending) * 100 : 0,
      readRate: sent + delivered > 0 ? (read / (sent + delivered)) * 100 : 0,
    };
  }

  async getFailedDeliveries(limit = 50, offset = 0) {
    const [data, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where: { status: 'FAILED' },
        orderBy: { failedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          notification: {
            select: {
              id: true,
              title: true,
              type: true,
              priority: true,
              organizationId: true,
            },
          },
        },
      }),
      this.prisma.notificationDelivery.count({ where: { status: 'FAILED' } }),
    ]);
    return { data, total, limit, offset };
  }

  async retryFailedDelivery(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });
    if (!delivery || delivery.status !== 'FAILED') {
      return {
        success: false,
        message: 'Delivery not found or not in failed state',
      };
    }
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', failedAt: null, errorMessage: null },
    });
    return { success: true };
  }

  async retryAllFailed() {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', failedAt: null, errorMessage: null },
    });
    return { success: true, count: result.count };
  }

  async getDeliveryTrend(days = 30, organizationId?: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const where: any = { createdAt: { gte: startDate } };
    if (organizationId) where.notification = { organizationId };

    const deliveries = await this.prisma.notificationDelivery.findMany({
      where,
      select: { status: true, createdAt: true, channel: true },
    });

    const trend: Record<
      string,
      { sent: number; delivered: number; read: number; failed: number }
    > = {};
    for (const d of deliveries) {
      const day = d.createdAt.toISOString().split('T')[0];
      if (!trend[day])
        trend[day] = { sent: 0, delivered: 0, read: 0, failed: 0 };
      if (d.status === 'SENT') trend[day].sent++;
      else if (d.status === 'DELIVERED') trend[day].delivered++;
      else if (d.status === 'READ') trend[day].read++;
      else if (d.status === 'FAILED') trend[day].failed++;
    }
    return trend;
  }

  async getChannelBreakdown(organizationId?: string) {
    const where: any = {};
    if (organizationId) where.notification = { organizationId };
    const channels = await this.prisma.notificationDelivery.groupBy({
      by: ['channel'],
      where,
      _count: true,
    });
    return channels.map((c: any) => ({ channel: c.channel, count: c._count }));
  }
}
