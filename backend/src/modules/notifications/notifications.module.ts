import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationEventService } from './notification-event.service';
import { ChannelDispatcherService } from './channel-dispatcher.service';
import { DeliveryTrackerService } from './delivery-tracker.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationAnalyticsService } from './notification-analytics.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WebPushSenderService } from './web-push-sender.service';
import { FcmSenderService } from './fcm-sender.service';
import { EmailSenderService } from './email-sender.service';
import { SmsSenderService } from './sms-sender.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => WebsocketModule),
    forwardRef(() => AuditLogModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationOrchestratorService,
    NotificationEventService,
    ChannelDispatcherService,
    DeliveryTrackerService,
    NotificationPreferenceService,
    NotificationAnalyticsService,
    NotificationTemplateService,
    NotificationSchedulerService,
    WebPushSenderService,
    FcmSenderService,
    EmailSenderService,
    SmsSenderService,
  ],
  exports: [
    NotificationsService,
    NotificationOrchestratorService,
    NotificationEventService,
    NotificationPreferenceService,
    DeliveryTrackerService,
    WebPushSenderService,
  ],
})
export class NotificationsModule {}
