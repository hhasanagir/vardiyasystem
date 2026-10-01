import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../../../../ddd/domain-event.base';

export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;

@Injectable()
export class ScheduleEventBus {
  private readonly logger = new Logger(ScheduleEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly eventLog: DomainEvent[] = [];

  on<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventName, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    this.eventLog.push(event);
    this.logger.log(
      `Event published: ${event.eventName} [${event.aggregateId}]`,
    );

    const handlers = this.handlers.get(event.eventName) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(`Handler error for ${event.eventName}: ${err}`);
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  getEventLog(): readonly DomainEvent[] {
    return this.eventLog;
  }
}
