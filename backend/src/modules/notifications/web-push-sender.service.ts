import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class WebPushSenderService {
  private readonly logger = new Logger(WebPushSenderService.name);
  private initialized = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initVapid();
  }

  private initVapid(): void {
    try {
      const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
      const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
      const subject = this.configService.get<string>(
        'VAPID_SUBJECT',
        'mailto:vardiyaos@hospital.com',
      );
      if (publicKey && privateKey) {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.initialized = true;
      }
    } catch {
      this.logger.warn('VAPID keys not configured');
    }
  }

  async send(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const subs = await this.prisma.webPushSubscription.findMany({
        where: { userId },
      });
      if (subs.length === 0) return false;

      let sent = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              icon: '/icons/icon-192.svg',
              badge: '/icons/icon-72.svg',
              data: payload.data,
              actions: [{ action: 'view', title: 'Görüntüle' }],
            }),
            { TTL: 86400, urgency: 'high' },
          );
          sent = true;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await this.prisma.webPushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => {});
          }
        }
      }
      return sent;
    } catch (err) {
      this.logger.error(
        `Web push send failed for user ${userId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async subscribe(
    userId: string,
    endpoint: string,
    auth: string,
    p256dh: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.webPushSubscription.findUnique({
      where: { endpoint },
    });
    if (existing) {
      return this.prisma.webPushSubscription.update({
        where: { endpoint },
        data: { auth, p256dh, userAgent },
      });
    }
    return this.prisma.webPushSubscription.create({
      data: { userId, endpoint, auth, p256dh, userAgent },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async unsubscribeAll(userId: string) {
    await this.prisma.webPushSubscription.deleteMany({ where: { userId } });
  }
}
