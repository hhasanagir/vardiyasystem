import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import * as webpush from 'web-push';

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: { action: string; title: string }[];
}

@Injectable()
export class PushSubscriptionsService {
  private readonly logger = new Logger(PushSubscriptionsService.name);
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
        this.logger.log('VAPID keys configured');
      }
    } catch (err) {
      this.logger.warn('VAPID keys not configured', err);
    }
  }

  async subscribe(userId: string, sub: PushSubscriptionData): Promise<void> {
    const existing = await this.prisma.webPushSubscription.findUnique({
      where: { endpoint: sub.endpoint },
    });
    if (existing) {
      await this.prisma.webPushSubscription.update({
        where: { endpoint: sub.endpoint },
        data: { auth: sub.keys.auth, p256dh: sub.keys.p256dh },
      });
    } else {
      await this.prisma.webPushSubscription.create({
        data: {
          userId,
          endpoint: sub.endpoint,
          auth: sub.keys.auth,
          p256dh: sub.keys.p256dh,
        },
      });
    }
  }

  async unsubscribe(userId: string, endpoint?: string): Promise<void> {
    if (endpoint) {
      await this.prisma.webPushSubscription.deleteMany({
        where: { userId, endpoint },
      });
    } else {
      await this.prisma.webPushSubscription.deleteMany({ where: { userId } });
    }
  }

  async getSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
    const subs = await this.prisma.webPushSubscription.findMany({
      where: { userId },
    });
    return subs.map((s) => ({
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    }));
  }

  async getAllSubscriptions(): Promise<Map<string, PushSubscriptionData[]>> {
    const subs = await this.prisma.webPushSubscription.findMany();
    const map = new Map<string, PushSubscriptionData[]>();
    for (const s of subs) {
      const arr = map.get(s.userId) || [];
      arr.push({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      });
      map.set(s.userId, arr);
    }
    return map;
  }

  async getEndpointCount(): Promise<number> {
    return this.prisma.webPushSubscription.count();
  }

  async sendPush(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    if (!this.initialized) return false;

    const subs = await this.getSubscriptions(userId);
    if (subs.length === 0) return false;

    let sent = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), {
          TTL: 86400,
          urgency: 'normal',
        });
        sent = true;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.prisma.webPushSubscription.deleteMany({
            where: { endpoint: sub.endpoint },
          });
        }
      }
    }
    return sent;
  }

  async broadcastPush(payload: PushNotificationPayload): Promise<number> {
    if (!this.initialized) return 0;
    const subs = await this.prisma.webPushSubscription.findMany();
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 },
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.prisma.webPushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        }
      }
    }
    return sent;
  }
}
