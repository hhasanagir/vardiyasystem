import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent } from './domain-event.interface';
import { EventStoreService } from './event-store.service';
import { EventMonitoringService } from './event-monitoring.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    @InjectQueue('events') private readonly eventsQueue: Queue,
    private readonly eventStore: EventStoreService,
    private readonly monitoring: EventMonitoringService,
    private readonly dlq: DeadLetterQueueService,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    this.monitoring.recordPublished(event);

    await this.eventStore.store(event);

    await this.eventsQueue.add(event.eventName, event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }

  async publishBatch(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
