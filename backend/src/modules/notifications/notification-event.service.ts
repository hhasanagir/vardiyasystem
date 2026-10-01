import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationTemplateService } from './notification-template.service';
import { EventBusService } from '../../events/event-bus.service';
import {
  createEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
} from '../../events/domain-event.interface';
import { NotificationType } from './interfaces/notification-type.enum';
import { NotificationPriority } from './interfaces/notification-priority.enum';
import {
  DeliveryChannel,
  DELIVERY_CHANNELS,
} from './interfaces/channel-type.enum';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  // Backward-compatible aliases for existing callers
  async scheduleSubmitted(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.scheduleChanged(userId, organizationId, vars);
  }

  async schedulePublished(
    userIds: string[],
    organizationId: string,
    vars: Record<string, any>,
  ) {
    const { title, message } = await this.templateService.render(
      'SCHEDULE_CHANGED' as NotificationType,
      vars,
    );
    await this.orchestrator.send({
      organizationId,
      type: 'SCHEDULE_CHANGED' as NotificationType,
      title,
      message,
      data: vars,
      recipientIds: userIds,
    });
  }

  // Assignment events are triggered by Personnel records, not User records.
  // The personnelId is resolved to a real active user via matching email before a
  // notification is created. Personnel without a user account are skipped silently.
  async assignmentCreated(
    personnelId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    const userId = await this.resolveRecipientUserId(personnelId);
    if (!userId) {
      this.logger.debug(
        `Skipping assignment notification for personnel=${personnelId}: no matching active user account`,
      );
      return;
    }
    await this.scheduleChanged(userId, organizationId, vars);
  }

  async assignmentRemoved(
    personnelId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    const userId = await this.resolveRecipientUserId(personnelId);
    if (!userId) {
      this.logger.debug(
        `Skipping assignment removal notification for personnel=${personnelId}: no matching active user account`,
      );
      return;
    }
    await this.scheduleChanged(userId, organizationId, vars);
  }

  async swapSubmitted(
    targetId: string,
    requesterId: string,
    organizationId: string,
    data: { swapId?: string; requesterName?: string; date?: string },
  ) {
    await this.shiftSwapRequested(
      targetId,
      requesterId,
      organizationId,
      data as Record<string, any>,
    );
  }

  async swapAccepted(
    userId: string,
    organizationId: string,
    data: Record<string, any>,
  ) {
    await this.shiftSwapApproved(userId, organizationId, data);
  }

  async swapRejected(
    userId: string,
    organizationId: string,
    data: Record<string, any>,
  ) {
    await this.shiftSwapRejected(userId, organizationId, data);
  }

  async incidentCritical(
    managerIds: string[],
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.deviceIncidentCritical(managerIds, organizationId, vars);
  }

  async clockedIn(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.attendanceAlert(userId, organizationId, vars);
  }

  async clockedOut(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.attendanceAlert(userId, organizationId, vars);
  }

  constructor(
    private orchestrator: NotificationOrchestratorService,
    private templateService: NotificationTemplateService,
    private eventBus: EventBusService,
    private prisma: PrismaService,
  ) {}

  // Never treat a personnelId as a userId. Resolution priority:
  // 1. The id is already a real active user (legacy callers).
  // 2. The id is a Personnel whose email matches an active User email.
  // Otherwise null (caller skips the notification silently).
  private async resolveRecipientUserId(id: string): Promise<string | null> {
    if (!id) return null;
    try {
      const directUser = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });
      if (directUser?.isActive) return directUser.id;

      const personnel = await this.prisma.personnel.findUnique({
        where: { id },
        select: { email: true },
      });
      const email = personnel?.email?.trim().toLowerCase();
      if (!email) return null;

      const user = await this.prisma.user.findFirst({
        where: { email, isActive: true },
        select: { id: true },
      });
      return user?.id ?? null;
    } catch (err) {
      this.logger.error(
        `Failed to resolve personnel->user mapping for ${id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async scheduleChanged(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'SCHEDULE_CHANGED' as NotificationType,
      'NORMAL' as NotificationPriority,
      vars,
    );
  }

  async scheduleApproved(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'SCHEDULE_APPROVED' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async scheduleRejected(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'SCHEDULE_REJECTED' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async shiftSwapRequested(
    targetId: string,
    requesterId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      targetId,
      organizationId,
      'SHIFT_SWAP_REQUESTED' as NotificationType,
      'NORMAL' as NotificationPriority,
      vars,
    );
  }

  async shiftSwapApproved(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'SHIFT_SWAP_APPROVED' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async shiftSwapRejected(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'SHIFT_SWAP_REJECTED' as NotificationType,
      'NORMAL' as NotificationPriority,
      vars,
    );
  }

  async trainingAssigned(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'TRAINING_ASSIGNED' as NotificationType,
      'NORMAL' as NotificationPriority,
      vars,
    );
  }

  async trainingExpiring(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'TRAINING_EXPIRING' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async certificationExpiring(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'CERTIFICATION_EXPIRING' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async deviceIncident(
    managerIds: string[],
    organizationId: string,
    vars: Record<string, any>,
  ) {
    const { title, message } = await this.templateService.render(
      'DEVICE_INCIDENT' as NotificationType,
      vars,
    );
    await this.orchestrator.send({
      organizationId,
      type: 'DEVICE_INCIDENT' as NotificationType,
      priority: 'HIGH' as NotificationPriority,
      title,
      message,
      data: vars,
      recipientIds: managerIds,
      channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.FCM],
    });
  }

  async deviceIncidentCritical(
    managerIds: string[],
    organizationId: string,
    vars: Record<string, any>,
  ) {
    const { title, message } = await this.templateService.render(
      'DEVICE_INCIDENT_CRITICAL' as NotificationType,
      vars,
    );
    await this.orchestrator.send({
      organizationId,
      type: 'DEVICE_INCIDENT_CRITICAL' as NotificationType,
      priority: 'CRITICAL' as NotificationPriority,
      title,
      message,
      data: vars,
      recipientIds: managerIds,
      channels: [
        DELIVERY_CHANNELS.IN_APP,
        DELIVERY_CHANNELS.FCM,
        DELIVERY_CHANNELS.EMAIL,
        DELIVERY_CHANNELS.WEB_PUSH,
      ],
    });
  }

  async systemAnnouncement(
    organizationId: string,
    vars: Record<string, any>,
    recipientIds?: string[],
  ) {
    const { title, message } = await this.templateService.render(
      'SYSTEM_ANNOUNCEMENT' as NotificationType,
      vars,
    );
    if (recipientIds) {
      await this.orchestrator.send({
        organizationId,
        type: 'SYSTEM_ANNOUNCEMENT' as NotificationType,
        title,
        message,
        data: vars,
        recipientIds,
      });
    } else {
      await this.orchestrator.sendToAllUsers({
        organizationId,
        type: 'SYSTEM_ANNOUNCEMENT' as NotificationType,
        title,
        message,
        data: vars,
      });
    }
  }

  async roleAssigned(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'ROLE_ASSIGNED' as NotificationType,
      'HIGH' as NotificationPriority,
      vars,
    );
  }

  async attendanceAlert(
    userId: string,
    organizationId: string,
    vars: Record<string, any>,
  ) {
    await this.send(
      userId,
      organizationId,
      'ATTENDANCE_ALERT' as NotificationType,
      'NORMAL' as NotificationPriority,
      vars,
    );
  }

  async emergencyAlert(
    organizationId: string,
    vars: Record<string, any>,
    recipientIds: string[],
  ) {
    const { title, message } = await this.templateService.render(
      'EMERGENCY_ALERT' as NotificationType,
      vars,
    );
    await this.orchestrator.sendEmergency({
      organizationId,
      title,
      message,
      data: vars,
      recipientIds,
    });
  }

  private async send(
    userId: string,
    organizationId: string,
    type: NotificationType,
    priority: NotificationPriority,
    vars: Record<string, any>,
  ) {
    try {
      const { title, message } = await this.templateService.render(type, vars);
      await this.orchestrator.send({
        organizationId,
        type,
        priority,
        title,
        message,
        data: vars,
        recipientIds: [userId],
      });
    } catch (err) {
      this.logger.error(
        `Failed to send notification type=${type} to user=${userId}: ${(err as Error).message}`,
      );
    }
  }
}
