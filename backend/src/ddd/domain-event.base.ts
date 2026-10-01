import { v4 as uuidv4 } from 'uuid';

export interface DomainEventProps<T> {
  aggregateId: string;
  aggregateType: string;
  correlationId?: string;
  causationId?: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

export abstract class DomainEvent<T = unknown> {
  public readonly eventId: string;
  public readonly eventName: string;
  public readonly aggregateId: string;
  public readonly aggregateType: string;
  public readonly correlationId: string;
  public readonly causationId: string;
  public readonly timestamp: Date;
  public readonly payload: T;
  public readonly metadata: Record<string, unknown>;

  protected constructor(props: DomainEventProps<T>) {
    this.eventId = uuidv4();
    this.eventName = this.constructor.name;
    this.aggregateId = props.aggregateId;
    this.aggregateType = props.aggregateType;
    this.correlationId = props.correlationId || uuidv4();
    this.causationId = props.causationId || this.correlationId;
    this.timestamp = new Date();
    this.payload = props.payload;
    this.metadata = props.metadata || {};
  }
}
