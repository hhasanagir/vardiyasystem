import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  DeliveryChannel,
  DELIVERY_CHANNELS,
} from './interfaces/channel-type.enum';
import { WebPushSenderService } from './web-push-sender.service';
import { FcmSenderService } from './fcm-sender.service';
import { EmailSenderService } from './email-sender.service';
import { SmsSenderService } from './sms-sender.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationPreferenceService } from './notification-preference.service';

interface DispatchContext {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority: string;
  bypassPrefs: boolean;
}

@Injectable()
export class ChannelDispatcherService {
  private readonly logger = new Logger(ChannelDispatcherService.name);

  constructor(
    private prisma: PrismaService,
    private webPushSender: WebPushSenderService,
    private fcmSender: FcmSenderService,
    private emailSender: EmailSenderService,
    private smsSender: SmsSenderService,
    private gateway: ScheduleGateway,
    private metrics: MetricsService,
    private preferenceService: NotificationPreferenceService,
  ) {}

  async dispatch(
    notificationId: string,
    recipientIds: string[],
    channels: DeliveryChannel[],
    context: DispatchContext,
  ) {
    const dispatchPromises: Promise<void>[] = [];

    for (const channel of channels) {
      switch (channel) {
        case DELIVERY_CHANNELS.IN_APP:
          dispatchPromises.push(
            this.dispatchInApp(notificationId, recipientIds, context),
          );
          break;
        case DELIVERY_CHANNELS.WEB_PUSH:
          dispatchPromises.push(
            this.dispatchWebPush(notificationId, recipientIds, context),
          );
          break;
        case DELIVERY_CHANNELS.FCM:
          dispatchPromises.push(
            this.dispatchFcm(notificationId, recipientIds, context),
          );
          break;
        case DELIVERY_CHANNELS.EMAIL:
          dispatchPromises.push(
            this.dispatchEmail(notificationId, recipientIds, context),
          );
          break;
        case DELIVERY_CHANNELS.SMS:
          dispatchPromises.push(
            this.dispatchSms(notificationId, recipientIds, context),
          );
          break;
      }
    }

    const results = await Promise.allSettled(dispatchPromises);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length} channel dispatches failed for notification ${notificationId}`,
      );
    }
  }

  private async dispatchInApp(
    notificationId: string,
    recipientIds: string[],
    context: DispatchContext,
  ) {
    for (const userId of recipientIds) {
      this.gateway
        .broadcastNotification({
          userId,
          organizationId: '',
          notification: {
            id: notificationId,
            type: context.type,
            title: context.title,
            message: context.message,
            data: context.data,
            isRead: false,
            createdAt: new Date().toISOString(),
          },
        })
        .catch(() => {});

      await this.updateDeliveryStatus(
        notificationId,
        userId,
        DELIVERY_CHANNELS.IN_APP,
        'SENT',
      );
    }
  }

  private async dispatchWebPush(
    notificationId: string,
    recipientIds: string[],
    context: DispatchContext,
  ) {
    for (const userId of recipientIds) {
      if (!context.bypassPrefs) {
        const prefs = await this.preferenceService.getPreferences(userId);
        if (!prefs.pushEnabled) continue;
      }

      const sent = await this.webPushSender.send(userId, {
        title: context.title,
        body: context.message,
        data: { ...context.data, notificationId, type: context.type },
      });

      await this.updateDeliveryStatus(
        notificationId,
        userId,
        DELIVERY_CHANNELS.WEB_PUSH,
        sent ? 'SENT' : 'FAILED',
        sent ? undefined : 'Web push send failed',
      );
    }
  }

  private async dispatchFcm(
    notificationId: string,
    recipientIds: string[],
    context: DispatchContext,
  ) {
    if (!this.fcmSender.isEnabled()) return;

    for (const userId of recipientIds) {
      if (!context.bypassPrefs) {
        const prefs = await this.preferenceService.getPreferences(userId);
        if (!prefs.pushEnabled) continue;
      }

      const sent = await this.fcmSender.send(userId, {
        title: context.title,
        body: context.message,
        data: { ...context.data, notificationId, type: context.type },
      });

      await this.updateDeliveryStatus(
        notificationId,
        userId,
        DELIVERY_CHANNELS.FCM,
        sent ? 'SENT' : 'FAILED',
        sent ? undefined : 'FCM send failed',
      );
    }
  }

  private async dispatchEmail(
    notificationId: string,
    recipientIds: string[],
    context: DispatchContext,
  ) {
    for (const userId of recipientIds) {
      if (!context.bypassPrefs) {
        const prefs = await this.preferenceService.getPreferences(userId);
        if (!prefs.emailEnabled) continue;
      }

      const sent = await this.emailSender.send(userId, {
        subject: context.title,
        body: context.message,
        data: { ...context.data, notificationId, type: context.type },
      });

      await this.updateDeliveryStatus(
        notificationId,
        userId,
        DELIVERY_CHANNELS.EMAIL,
        sent ? 'SENT' : 'FAILED',
        sent ? undefined : 'Email send failed',
      );
    }
  }

  private async dispatchSms(
    notificationId: string,
    recipientIds: string[],
    context: DispatchContext,
  ) {
    for (const userId of recipientIds) {
      if (!context.bypassPrefs) {
        const prefs = await this.preferenceService.getPreferences(userId);
        if (!prefs.smsEnabled) continue;
      }

      const sent = await this.smsSender.send(userId, {
        message: context.message,
        data: { ...context.data, notificationId, type: context.type },
      });

      await this.updateDeliveryStatus(
        notificationId,
        userId,
        DELIVERY_CHANNELS.SMS,
        sent ? 'SENT' : 'FAILED',
        sent ? undefined : 'SMS send failed',
      );
    }
  }

  private async updateDeliveryStatus(
    notificationId: string,
    recipientId: string,
    channel: DeliveryChannel,
    status: string,
    errorMessage?: string,
  ) {
    try {
      const updateData: any = { status: status as any };
      if (status === 'SENT') updateData.deliveredAt = new Date();
      if (status === 'FAILED') {
        updateData.failedAt = new Date();
        updateData.errorMessage = errorMessage;
      }
      updateData.attemptCount = { increment: 1 };

      await this.prisma.notificationDelivery.updateMany({
        where: { notificationId, recipientId, channel: channel as any },
        data: updateData,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to update delivery status: ${(err as Error).message}`,
      );
    }
  }
}
