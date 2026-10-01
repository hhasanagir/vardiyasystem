import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationType } from './interfaces/notification-type.enum';
import { DeliveryChannel } from './interfaces/channel-type.enum';

@Injectable()
export class NotificationTemplateService {
  constructor(private prisma: PrismaService) {}

  async render(
    type: NotificationType,
    vars: Record<string, any>,
  ): Promise<{ title: string; message: string }> {
    let template = await this.prisma.notificationTemplate.findFirst({
      where: { type: type as any, isActive: true },
    });
    if (!template) {
      return {
        title: this.getDefaultTitle(type),
        message: this.getDefaultMessage(type, vars),
      };
    }
    return {
      title: this.interpolate(template.titleTemplate, vars),
      message: this.interpolate(template.messageTemplate, vars),
    };
  }

  async renderForChannel(
    type: NotificationType,
    channel: DeliveryChannel,
    vars: Record<string, string>,
  ) {
    let template = await this.prisma.notificationTemplate.findFirst({
      where: { type: type as any, channel: channel as any, isActive: true },
    });
    if (!template) {
      template = await this.prisma.notificationTemplate.findFirst({
        where: { type: type as any, channel: 'IN_APP' as any, isActive: true },
      });
    }
    if (!template) {
      return {
        title: this.getDefaultTitle(type),
        message: this.getDefaultMessage(type, vars),
      };
    }
    return {
      title: this.interpolate(template.titleTemplate, vars),
      message: this.interpolate(template.messageTemplate, vars),
    };
  }

  private interpolate(template: string, vars: Record<string, any>): string {
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => vars[key] || `{{${key}}}`,
    );
  }

  private getDefaultTitle(type: NotificationType): string {
    const titles: Record<string, string> = {
      SCHEDULE_CHANGED: 'Vardiya Değişikliği',
      SCHEDULE_APPROVED: 'Program Onaylandı',
      SCHEDULE_REJECTED: 'Program Reddedildi',
      SHIFT_SWAP_REQUESTED: 'Vardiya Değişim Talebi',
      SHIFT_SWAP_APPROVED: 'Vardiya Değişimi Onaylandı',
      SHIFT_SWAP_REJECTED: 'Vardiya Değişimi Reddedildi',
      TRAINING_ASSIGNED: 'Eğitim Atandı',
      TRAINING_EXPIRING: 'Eğitim Süresi Doluyor',
      TRAINING_EXPIRED: 'Eğitim Süresi Doldu',
      CERTIFICATION_EXPIRING: 'Sertifika Süresi Doluyor',
      CERTIFICATION_EXPIRED: 'Sertifika Süresi Doldu',
      DEVICE_INCIDENT: 'Cihaz Arızası',
      DEVICE_INCIDENT_CRITICAL: 'Kritik Cihaz Arızası',
      SYSTEM_ANNOUNCEMENT: 'Sistem Duyurusu',
      ROLE_ASSIGNED: 'Rol Atandı',
      PERMISSION_CHANGED: 'Yetki Değişikliği',
      ATTENDANCE_ALERT: 'Devamsızlık Uyarısı',
      EMERGENCY_ALERT: 'Acil Durum Uyarısı',
      CLOCK_IN_REMINDER: 'Giriş Hatırlatması',
      SCHEDULE_REMINDER: 'Vardiya Hatırlatması',
    };
    return titles[type] || 'Bildirim';
  }

  private getDefaultMessage(
    type: NotificationType,
    vars: Record<string, string>,
  ): string {
    const defaults: Record<string, string> = {
      SCHEDULE_CHANGED: 'Vardiya programınız güncellendi.',
      SCHEDULE_APPROVED: 'Programınız onaylandı.',
      SCHEDULE_REJECTED: 'Programınız reddedildi: {{reason}}',
      SHIFT_SWAP_REQUESTED:
        '{{requesterName}} sizden vardiya değişikliği talep ediyor.',
      SHIFT_SWAP_APPROVED: 'Vardiya değişikliğiniz onaylandı.',
      SHIFT_SWAP_REJECTED: 'Vardiya değişikliğiniz reddedildi.',
      TRAINING_ASSIGNED: '{{trainingName}} eğitimi size atandı.',
      TRAINING_EXPIRING:
        '{{trainingName}} eğitiminizin süresi {{days}} gün içinde doluyor.',
      TRAINING_EXPIRED: '{{trainingName}} eğitiminizin süresi doldu.',
      CERTIFICATION_EXPIRING:
        '{{certName}} sertifikanızın süresi {{days}} gün içinde doluyor.',
      CERTIFICATION_EXPIRED: '{{certName}} sertifikanızın süresi doldu.',
      DEVICE_INCIDENT: '{{deviceName}} cihazında arıza bildirildi.',
      DEVICE_INCIDENT_CRITICAL: 'ACİL: {{deviceName}} cihazında kritik arıza!',
      SYSTEM_ANNOUNCEMENT: '{{announcement}}',
      ROLE_ASSIGNED: 'Size {{roleName}} rolü atandı.',
      PERMISSION_CHANGED: 'Yetkileriniz güncellendi.',
      ATTENDANCE_ALERT: 'Devamsızlık uyarısı: {{date}}',
      EMERGENCY_ALERT: 'ACİL DURUM: {{message}}',
      CLOCK_IN_REMINDER: 'Bugünkü vardiyanız için giriş yapmayı unutmayın.',
      SCHEDULE_REMINDER: 'Yarınki vardiyanız: {{shiftTime}}',
    };
    return defaults[type] || 'Yeni bildirim';
  }
}
