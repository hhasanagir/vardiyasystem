import { Entity } from './entity.base';

/**
 * Marker base for aggregates.
 *
 * P3-02 — the former `commit()` / `loadFromHistory()` / abstract `applyEvent()`
 * trio was event-sourcing scaffolding with no callers and no reducers. Replaying
 * through the empty `applyEvent()` switch silently produced empty aggregates, so
 * leaving it callable was more dangerous than removing it. Real cross-module
 * events go through the Redis/BullMQ `EventBusService`.
 */
export abstract class AggregateRoot<TProps = unknown> extends Entity<TProps> {}
