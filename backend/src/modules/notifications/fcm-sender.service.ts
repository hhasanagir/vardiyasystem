import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class FcmSenderService {
  private readonly logger = new Logger(FcmSenderService.name);
  private enabled = false;
  private app: any = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {
    this.init();
  }

  private init(): void {
    try {
      const serviceAccountPath = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_PATH',
      );
      if (!serviceAccountPath) {
        this.logger.warn(
          'FCM not configured — FIREBASE_SERVICE_ACCOUNT_PATH not set',
        );
        return;
      }
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.app = admin;
      this.enabled = true;
      this.logger.log('Firebase Admin initialized successfully');
    } catch (err) {
      this.logger.warn(`FCM initialization failed: ${(err as Error).message}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId, isActive: true },
      });
      if (tokens.length === 0) return false;

      const message = {
        notification: { title: payload.title, body: payload.body },
        data: this.serializeData(payload.data),
        tokens: tokens.map((t) => t.token),
      };

      const response = await this.app.messaging().sendEachForMulticast(message);
      const invalidTokens: string[] = [];

      response.responses.forEach((resp: any, idx: number) => {
        if (resp.success) return;
        if (
          resp.error?.code === 'messaging/invalid-registration-token' ||
          resp.error?.code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx].id);
        }
      });

      if (invalidTokens.length > 0) {
        await this.prisma.pushToken.updateMany({
          where: { id: { in: invalidTokens } },
          data: { isActive: false },
        });
      }

      this.metrics.notificationDeliveredTotal.inc({
        channel: 'fcm',
        count: response.successCount.toString(),
      });
      return response.successCount > 0;
    } catch (err) {
      this.logger.error(
        `FCM send failed for user ${userId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private serializeData(
    data?: Record<string, unknown>,
  ): Record<string, string> {
    if (!data) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }
}
