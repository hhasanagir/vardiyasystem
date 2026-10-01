import { Entity } from './entity.base';
import { DomainEvent } from './domain-event.base';

export abstract class AggregateRoot<TProps = unknown> extends Entity<TProps> {
  private _isCommitting = false;

  protected addDomainEvent(event: DomainEvent): void {
    if (!this._isCommitting) {
      super.addDomainEvent(event);
    }
  }

  public commit(): DomainEvent[] {
    this._isCommitting = true;
    const events = this.domainEvents;
    this.clearDomainEvents();
    this._isCommitting = false;
    return events;
  }

  public loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
    }
  }

  protected abstract applyEvent(event: DomainEvent): void;
}
