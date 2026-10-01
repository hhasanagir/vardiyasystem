import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent } from './domain-event.interface';
import { EventStoreService } from './event-store.service';

@Injectable()
export class EventReplayService {
  private readonly logger = new Logger(EventReplayService.name);

  constructor(
    @InjectQueue('events') private readonly eventsQueue: Queue,
    private readonly eventStore: EventStoreService,
  ) {}

  async replayByAggregate(
    aggregateType: string,
    aggregateId: string,
  ): Promise<number> {
    const events = await this.eventStore.replayByAggregate(
      aggregateType,
      aggregateId,
    );
    return this.publishEvents(events);
  }

  async replayByType(
    aggregateType: string,
    fromTimestamp?: number,
    toTimestamp?: number,
  ): Promise<number> {
    const events = await this.eventStore.replayByType(
      aggregateType,
      fromTimestamp,
      toTimestamp,
    );
    return this.publishEvents(events);
  }

  async replayAll(
    fromTimestamp?: number,
    toTimestamp?: number,
  ): Promise<number> {
    const events = await this.eventStore.replayAll(fromTimestamp, toTimestamp);
    return this.publishEvents(events);
  }

  async getEvent(eventId: string): Promise<DomainEvent | null> {
    return this.eventStore.getEvent(eventId);
  }

  async getAggregateEventCount(
    aggregateType: string,
    aggregateId: string,
  ): Promise<number> {
    return this.eventStore.countByAggregate(aggregateType, aggregateId);
  }

  private async publishEvents(events: DomainEvent[]): Promise<number> {
    let count = 0;
    for (const event of events) {
      await this.eventsQueue.add(event.eventName, event, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
      count++;
    }
    this.logger.log(`Replayed ${count} events`);
    return count;
  }
}
