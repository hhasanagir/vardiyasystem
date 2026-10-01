import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { DomainEvent } from './domain-event.interface';
import { EventMonitoringService } from './event-monitoring.service';

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  constructor(
    @InjectQueue('dead-letter') private readonly dlq: Queue,
    private readonly monitoring: EventMonitoringService,
  ) {}

  async sendToDlq(
    event: DomainEvent,
    error: Error,
    attemptsMade: number,
  ): Promise<void> {
    this.logger.error(
      `DLQ: ${event.eventName}[${event.eventId}] failed after ${attemptsMade} attempts: ${error.message}`,
    );
    this.monitoring.recordDlq(event.eventName);
    await this.dlq.add(
      `dlq:${event.eventName}`,
      {
        event,
        error: { message: error.message, stack: error.stack },
        failedAt: new Date().toISOString(),
        attemptsMade,
      },
      {
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }

  async listDlqEvents(limit = 100): Promise<Job[]> {
    return this.dlq.getJobs(['failed'], 0, limit);
  }

  async retryDlqEvent(jobId: string, queue: Queue): Promise<void> {
    const job = await this.dlq.getJob(jobId);
    if (!job) return;
    const { event } = job.data as { event: DomainEvent };
    await job.remove();
    await queue.add(event.eventName, event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    this.logger.log(`Requeued ${event.eventName}[${event.eventId}] from DLQ`);
  }

  async flushDlq(): Promise<number> {
    const jobs = await this.dlq.getJobs(['failed']);
    let count = 0;
    for (const job of jobs) {
      await job.remove();
      count++;
    }
    return count;
  }

  async getDlqCount(): Promise<number> {
    return this.dlq
      .getJobCounts()
      .then((c) => (c.failed || 0) + (c.completed || 0));
  }
}
