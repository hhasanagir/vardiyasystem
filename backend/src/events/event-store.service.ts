import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { DomainEvent } from './domain-event.interface';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const EVENT_TTL_SEC = 7 * 86400;

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async store(event: DomainEvent): Promise<void> {
    try {
      const key = `events:${event.aggregateType}:${event.aggregateId}`;
      const score = event.timestamp.getTime();
      await this.redis
        .multi()
        .zadd(key, score, event.eventId)
        .set(
          `event:${event.eventId}`,
          JSON.stringify(event),
          'EX',
          EVENT_TTL_SEC,
        )
        .zadd('events:all', score, event.eventId)
        .exec();
    } catch (err) {
      this.logger.error('Failed to store event', (err as Error).message);
    }
  }

  async getEvent(eventId: string): Promise<DomainEvent | null> {
    const raw = await this.redis.get(`event:${eventId}`);
    return raw ? (JSON.parse(raw) as DomainEvent) : null;
  }

  async replayByAggregate(
    aggregateType: string,
    aggregateId: string,
  ): Promise<DomainEvent[]> {
    const key = `events:${aggregateType}:${aggregateId}`;
    const eventIds = await this.redis.zrange(key, 0, -1);
    return this.fetchEvents(eventIds);
  }

  async replayByType(
    aggregateType: string,
    fromTimestamp?: number,
    toTimestamp?: number,
  ): Promise<DomainEvent[]> {
    const min = fromTimestamp ?? 0;
    const max = toTimestamp ?? Date.now();
    const eventIds = await this.redis.zrangebyscore('events:all', min, max);
    const filtered: string[] = [];
    for (const eid of eventIds) {
      const raw = await this.redis.get(`event:${eid}`);
      if (raw) {
        const evt = JSON.parse(raw) as DomainEvent;
        if (evt.aggregateType === aggregateType) filtered.push(eid);
      }
    }
    return this.fetchEvents(filtered);
  }

  async replayAll(
    fromTimestamp?: number,
    toTimestamp?: number,
  ): Promise<DomainEvent[]> {
    const min = fromTimestamp ?? 0;
    const max = toTimestamp ?? Date.now();
    const eventIds = await this.redis.zrangebyscore('events:all', min, max);
    return this.fetchEvents(eventIds);
  }

  async countByAggregate(
    aggregateType: string,
    aggregateId: string,
  ): Promise<number> {
    return this.redis.zcard(`events:${aggregateType}:${aggregateId}`);
  }

  private async fetchEvents(eventIds: string[]): Promise<DomainEvent[]> {
    if (eventIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const eid of eventIds) {
      pipeline.get(`event:${eid}`);
    }
    const results = await pipeline.exec();
    const events: DomainEvent[] = [];
    if (results) {
      for (const [, raw] of results) {
        if (raw && typeof raw === 'string') {
          events.push(JSON.parse(raw) as DomainEvent);
        }
      }
    }
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
