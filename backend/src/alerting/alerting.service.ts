import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private slackWebhookUrl: string | null;

  constructor(private config: ConfigService) {
    this.slackWebhookUrl = this.config.get('SLACK_WEBHOOK_URL', null);
  }

  async sendAlert(params: {
    title: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    source?: string;
    metadata?: Record<string, unknown>;
  }) {
    this.logger.log(`[${params.severity}] ${params.title}: ${params.message}`);

    if (this.slackWebhookUrl) {
      await this.sendSlack(params);
    }
  }

  private async sendSlack(params: {
    title: string;
    message: string;
    severity: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }) {
    const colors: Record<string, string> = {
      critical: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    };

    try {
      await fetch(this.slackWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [
            {
              color: colors[params.severity] || '#64748b',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `[${params.severity.toUpperCase()}] ${params.title}`,
                  },
                },
                {
                  type: 'section',
                  text: { type: 'mrkdwn', text: params.message },
                },
                ...(params.metadata
                  ? [
                      {
                        type: 'context',
                        elements: [
                          {
                            type: 'mrkdwn',
                            text:
                              '```' +
                              JSON.stringify(params.metadata, null, 2) +
                              '```',
                          },
                        ],
                      },
                    ]
                  : []),
                ...(params.source
                  ? [
                      {
                        type: 'context',
                        elements: [
                          { type: 'mrkdwn', text: `Source: ${params.source}` },
                        ],
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
      });
    } catch (err) {
      this.logger.error('Failed to send Slack alert', (err as Error).message);
    }
  }
}
