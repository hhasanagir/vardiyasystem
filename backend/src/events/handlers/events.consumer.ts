import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DomainEvent, EVENT_NAMES } from '../domain-event.interface';
import { DeadLetterQueueService } from '../dead-letter-queue.service';
import { EventMonitoringService } from '../event-monitoring.service';

@Processor('events')
export class EventsConsumer extends WorkerHost {
  private readonly logger = new Logger(EventsConsumer.name);

  constructor(
    private readonly dlq: DeadLetterQueueService,
    private readonly monitoring: EventMonitoringService,
  ) {
    super();
  }

  async process(job: Job<DomainEvent, void, string>): Promise<void> {
    const event = job.data;
    const start = Date.now();
    const latency = Date.now() - event.timestamp.getTime();

    this.monitoring.recordLatency(event.eventName, latency);
    this.logger.debug(
      `Processing ${event.eventName}[${event.eventId}] (attempt ${job.attemptsMade + 1})`,
    );

    try {
      switch (event.eventName) {
        case EVENT_NAMES.SCHEDULE_CREATED:
        case EVENT_NAMES.SCHEDULE_UPDATED:
        case EVENT_NAMES.SCHEDULE_APPROVED:
          await this.handleScheduleEvent(event);
          break;
        case EVENT_NAMES.SHIFT_SWAPPED:
          await this.handleSwapEvent(event);
          break;
        case EVENT_NAMES.DEVICE_INCIDENT_CREATED:
          await this.handleIncidentEvent(event);
          break;
        case EVENT_NAMES.PERSONNEL_CREATED:
          await this.handlePersonnelEvent(event);
          break;
        case EVENT_NAMES.NOTIFICATION_SENT:
          await this.handleNotificationEvent(event);
          break;
        default:
          this.logger.warn(`Unknown event type: ${event.eventName}`);
      }
      this.monitoring.recordProcessed(event.eventName, Date.now() - start);
    } catch (error) {
      this.monitoring.recordFailed(event.eventName);
      if (job.attemptsMade >= 2) {
        await this.dlq.sendToDlq(event, error as Error, job.attemptsMade + 1);
        return;
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  private async handleScheduleEvent(event: DomainEvent): Promise<void> {
    const { scheduleId, unitId, month, year, userId, status } =
      event.payload as any;
    this.logger.log(
      `Schedule ${event.eventName}: ${scheduleId} (${month}/${year}), status=${status}`,
    );
  }

  private async handleSwapEvent(event: DomainEvent): Promise<void> {
    const { swapId, requesterId, targetPersonnelId, fromAssignmentId } =
      event.payload as any;
    this.logger.log(
      `Shift swap ${swapId}: ${requesterId} ↔ ${targetPersonnelId}`,
    );
  }

  private async handleIncidentEvent(event: DomainEvent): Promise<void> {
    const { incidentId, unitId, issueType, severity } = event.payload as any;
    this.logger.log(
      `Device incident ${incidentId}: ${issueType} (${severity})`,
    );
  }

  private async handlePersonnelEvent(event: DomainEvent): Promise<void> {
    const { personnelId, name, unitId, role } = event.payload as any;
    this.logger.log(`Personnel created ${personnelId}: ${name} (${role})`);
  }

  private async handleNotificationEvent(event: DomainEvent): Promise<void> {
    const { notificationId, type, userId, organizationId } =
      event.payload as any;
    this.logger.log(
      `Notification sent ${notificationId}: type=${type}, userId=${userId}`,
    );
  }
}
