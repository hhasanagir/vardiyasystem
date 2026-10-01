import { NotificationType } from './notification-type.enum';
import { NotificationPriority } from './notification-priority.enum';
import { DeliveryChannel } from './channel-type.enum';

export interface CreateNotificationDto {
  organizationId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  senderId?: string;
}

export interface SendNotificationDto extends CreateNotificationDto {
  recipientIds: string[];
  channels?: DeliveryChannel[];
}

export interface NotificationRecipientData {
  id: string;
  userId: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationDeliveryData {
  id: string;
  channel: DeliveryChannel;
  status: string;
  deliveredAt: Date | null;
  readAt: Date | null;
  clickedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  attemptCount: number;
}

export interface NotificationWithRelations {
  id: string;
  organizationId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  senderId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  recipients: NotificationRecipientData[];
  deliveries: NotificationDeliveryData[];
}

export interface NotificationFilter {
  types?: NotificationType[];
  priorities?: NotificationPriority[];
  isRead?: boolean;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface DeliveryStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  readRate: number;
}
