import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);
  private enabled = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const provider = this.configService.get<string>('SMS_PROVIDER');
    this.enabled = !!provider;
    if (this.enabled) {
      this.logger.log(`SMS provider configured: ${provider}`);
    }
  }

  async send(
    userId: string,
    payload: { message: string; data?: Record<string, unknown> },
  ): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      // TODO: Look up user phone via Personnel table or User profile
      this.logger.debug(`SMS to user ${userId}: ${payload.message}`);
      return true;
    } catch (err) {
      this.logger.error(`SMS send failed: ${(err as Error).message}`);
      return false;
    }
  }
}
