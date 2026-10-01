import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from './notifications.service';
import { ChannelDispatcherService } from './channel-dispatcher.service';
import { DeliveryTrackerService } from './delivery-tracker.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventBusService } from '../../events/event-bus.service';
import {
  createEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
} from '../../events/domain-event.interface';
import { NotificationType } from './interfaces/notification-type.enum';
import {
  NotificationPriority,
  PRIORITY_BYPASS_PREFS,
} from './interfaces/notification-priority.enum';
import {
  DeliveryChannel,
  DELIVERY_CHANNELS,
} from './interfaces/channel-type.enum';

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private channelDispatcher: ChannelDispatcherService,
    private deliveryTracker: DeliveryTrackerService,
    private auditLog: AuditLogService,
    private eventBus: EventBusService,
  ) {}

  async send(data: {
    organizationId: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    senderId?: string;
    recipientIds: string[];
    channels?: DeliveryChannel[];
  }) {
    const priority = data.priority || 'NORMAL';
    const bypassPrefs = PRIORITY_BYPASS_PREFS[priority];
    const channels =
      data.channels || this.getDefaultChannels(data.type, priority);

    const notification = await this.notificationsService.create({
      organizationId: data.organizationId,
      type: data.type,
      priority,
      title: data.title,
      message: data.message,
      data: data.data,
      senderId: data.senderId,
    });

    const validRecipientIds = await this.notificationsService.addRecipients(
      notification.id,
      data.recipientIds,
    );

    for (const recipientId of validRecipientIds) {
      for (const channel of channels) {
        await this.notificationsService.createDelivery(
          notification.id,
          recipientId,
          channel,
        );
      }
    }

    await this.notificationsService.updateStatus(notification.id, 'SENT');

    await this.channelDispatcher.dispatch(
      notification.id,
      validRecipientIds,
      channels,
      {
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        priority,
        bypassPrefs,
      },
    );

    this.eventBus.publish(
      createEvent(
        EVENT_NAMES.NOTIFICATION_SENT,
        notification.id,
        AGGREGATE_TYPES.NOTIFICATION,
        {
          notificationId: notification.id,
          type: data.type,
          priority,
          recipientCount: validRecipientIds.length,
          channels: channels.join(','),
          organizationId: data.organizationId,
        },
        data.senderId || 'system',
      ),
    );

    return notification;
  }

  async sendToAllUsers(data: {
    organizationId: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    senderId?: string;
    channels?: DeliveryChannel[];
  }) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: data.organizationId, isActive: true },
      select: { id: true },
    });
    return this.send({ ...data, recipientIds: users.map((u) => u.id) });
  }

  async sendEmergency(data: {
    organizationId: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    senderId?: string;
    recipientIds: string[];
  }) {
    return this.send({
      ...data,
      type: 'EMERGENCY_ALERT' as NotificationType,
      priority: 'CRITICAL' as NotificationPriority,
      channels: [
        DELIVERY_CHANNELS.IN_APP,
        DELIVERY_CHANNELS.FCM,
        DELIVERY_CHANNELS.EMAIL,
        DELIVERY_CHANNELS.WEB_PUSH,
      ],
    });
  }

  private getDefaultChannels(
    type: NotificationType,
    priority: NotificationPriority,
  ): DeliveryChannel[] {
    return [DELIVERY_CHANNELS.IN_APP];
  }
}
