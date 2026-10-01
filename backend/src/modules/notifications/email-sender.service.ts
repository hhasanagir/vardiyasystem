import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private transporter: any = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.init();
  }

  private init(): void {
    try {
      const host = this.configService.get<string>('SMTP_HOST');
      const port = this.configService.get<number>('SMTP_PORT', 587);
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      if (!host || !user || !pass) {
        this.logger.warn('SMTP not configured — email notifications disabled');
        return;
      }

      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log('Email transport initialized');
    } catch (err) {
      this.logger.warn(`Email init failed: ${(err as Error).message}`);
    }
  }

  async send(
    userId: string,
    payload: { subject: string; body: string; data?: Record<string, unknown> },
  ): Promise<boolean> {
    if (!this.transporter) return false;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user?.email) return false;

      const html = this.buildHtml(payload.subject, payload.body);

      await this.transporter.sendMail({
        to: user.email,
        subject: payload.subject,
        text: payload.body,
        html,
        from: this.configService.get<string>(
          'SMTP_FROM',
          'noreply@vardiyaos.com',
        ),
      });

      return true;
    } catch (err) {
      this.logger.error(
        `Email send failed for user ${userId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private buildHtml(subject: string, body: string): string {
    return `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>${subject}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://vardiyaos.com/icons/icon-192.svg" alt="VardiyaOS" style="height: 48px;">
          </div>
          <h2 style="color: #333;">${subject}</h2>
          <p style="color: #555; line-height: 1.6;">${body}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">VardiyaOS — Radyoloji Vardiya Yönetim Sistemi</p>
        </div>
      </body></html>
    `;
  }
}
