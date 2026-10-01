import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export interface UserNotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  announcementEnabled: boolean;
  trainingReminders: boolean;
  scheduleReminders: boolean;
  emergencyAlerts: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const DEFAULT_PREFERENCES: UserNotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  announcementEnabled: true,
  trainingReminders: true,
  scheduleReminders: true,
  emergencyAlerts: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(private prisma: PrismaService) {}

  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    try {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { userId },
      });
      if (!prefs) return DEFAULT_PREFERENCES;
      return {
        pushEnabled: prefs.pushEnabled,
        emailEnabled: prefs.emailEnabled,
        smsEnabled: prefs.smsEnabled,
        announcementEnabled: prefs.announcementEnabled,
        trainingReminders: prefs.trainingReminders,
        scheduleReminders: prefs.scheduleReminders,
        emergencyAlerts: prefs.emergencyAlerts,
        quietHoursStart: prefs.quietHoursStart,
        quietHoursEnd: prefs.quietHoursEnd,
      };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  async updatePreferences(
    userId: string,
    prefs: Partial<UserNotificationPreferences>,
  ) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) {
      return this.prisma.notificationPreference.update({
        where: { userId },
        data: prefs,
      });
    }
    return this.prisma.notificationPreference.create({
      data: { userId, ...DEFAULT_PREFERENCES, ...prefs },
    });
  }

  async isInQuietHours(userId: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
    const now = new Date();
    const current = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return current >= prefs.quietHoursStart && current < prefs.quietHoursEnd;
  }
}
