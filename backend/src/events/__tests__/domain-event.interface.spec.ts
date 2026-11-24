import { describe, it, expect } from 'vitest';
import {
  createEvent,
  deserializeDomainEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
  type DomainEvent,
} from '../domain-event.interface';

describe('deserializeDomainEvent — serialisation boundary', () => {
  const iso = '2026-09-26T12:00:00.000Z';

  const raw = (overrides: Partial<DomainEvent> = {}): DomainEvent => ({
    eventId: 'evt-1',
    eventName: EVENT_NAMES.SCHEDULE_CREATED,
    aggregateId: 'sched-1',
    aggregateType: AGGREGATE_TYPES.SCHEDULE,
    correlationId: 'corr-1',
    timestamp: iso as unknown as Date,
    payload: { month: 9, year: 2026 },
    ...overrides,
  });

  it('rehydrates an ISO string timestamp (the BullMQ/Redis shape)', () => {
    const event = deserializeDomainEvent(raw());

    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.timestamp.toISOString()).toBe(iso);
    expect(event.timestamp.getTime()).toBe(Date.parse(iso));
  });

  it('survives the JSON round trip that a queue actually performs', () => {
    const queued = JSON.parse(JSON.stringify(createEvent(
      EVENT_NAMES.SCHEDULE_CREATED,
      'sched-1',
      AGGREGATE_TYPES.SCHEDULE,
      { month: 9 },
      'corr-1',
    ))) as DomainEvent;

    expect(typeof queued.timestamp).toBe('string');

    const event = deserializeDomainEvent(queued);
    // The exact call the consumers make; it throws on a plain string.
    expect(() => event.timestamp.getTime()).not.toThrow();
    expect(event.payload).toEqual({ month: 9 });
    expect(event.correlationId).toBe('corr-1');
  });

  it('keeps a Date instance untouched instead of re-parsing it', () => {
    const date = new Date(iso);
    const event = deserializeDomainEvent(raw({ timestamp: date }));

    expect(event.timestamp).toBe(date);
  });

  it('accepts a numeric epoch timestamp', () => {
    const epoch = Date.parse(iso);
    const event = deserializeDomainEvent(
      raw({ timestamp: epoch as unknown as Date }),
    );

    expect(event.timestamp.getTime()).toBe(epoch);
  });

  it('throws a diagnosable error for an unusable timestamp', () => {
    expect(() => deserializeDomainEvent(raw())).not.toThrow();

    for (const bad of ['', 'not-a-date', null, undefined, {}]) {
      expect(() => deserializeDomainEvent(raw({ timestamp: bad as unknown as Date })))
        .toThrow(/unusable timestamp/);
    }
  });

  it('names the offending event so the dead-letter entry is actionable', () => {
    expect(() => deserializeDomainEvent(raw({ eventId: 'evt-broken', timestamp: 'nope' as unknown as Date })))
      .toThrow(/evt-broken/);
  });
});
