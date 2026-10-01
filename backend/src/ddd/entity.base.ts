import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from './domain-event.base';

export type EntityId = string;

export abstract class Entity<TProps = unknown> {
  protected readonly _id: EntityId;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;
  protected _deletedAt: Date | null;
  protected _version: number;
  protected props: TProps;
  private readonly _domainEvents: DomainEvent[] = [];

  constructor(props: TProps, id?: EntityId) {
    this._id = id || uuidv4();
    this._createdAt = new Date();
    this._updatedAt = new Date();
    this._deletedAt = null;
    this._version = 1;
    this.props = props;
  }

  get id(): EntityId {
    return this._id;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get deletedAt(): Date | null {
    return this._deletedAt;
  }
  get version(): number {
    return this._version;
  }
  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }
  get domainEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }

  public softDelete(): void {
    this._deletedAt = new Date();
    this._version++;
  }

  public restore(): void {
    this._deletedAt = null;
    this._version++;
  }

  protected incrementVersion(): void {
    this._version++;
    this._updatedAt = new Date();
  }

  public equals(entity: Entity): boolean {
    return this._id === entity._id;
  }
}
