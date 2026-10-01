import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsUUID,
} from 'class-validator';

export class CreateNotificationDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  senderId?: string;
}

export class SendNotificationDto extends CreateNotificationDto {
  @IsArray()
  @IsUUID('all', { each: true })
  recipientIds: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

export class SendAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  recipientIds?: string[];
}

export class SendEmergencyDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsArray()
  @IsUUID('all', { each: true })
  recipientIds: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class NotificationFilterDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  priorities?: string[];

  @IsOptional()
  isRead?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  offset?: number;
}

export class NotificationPreferenceDto {
  @IsOptional()
  pushEnabled?: boolean;

  @IsOptional()
  emailEnabled?: boolean;

  @IsOptional()
  smsEnabled?: boolean;

  @IsOptional()
  announcementEnabled?: boolean;

  @IsOptional()
  trainingReminders?: boolean;

  @IsOptional()
  scheduleReminders?: boolean;

  @IsOptional()
  emergencyAlerts?: boolean;

  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string;
}

export class RegisterWebPushDto {
  @IsString()
  endpoint: string;

  @IsString()
  auth: string;

  @IsString()
  p256dh: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class NotificationStatsQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
