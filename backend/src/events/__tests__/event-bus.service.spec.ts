import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusService } from '../event-bus.service';
import { AGGREGATE_TYPES, EVENT_NAMES, createEvent, type DomainEvent } from '../domain-event.interface';

/**
 * Phase 5c49 — coverage wave 1. The bus is the publish boundary: metrics must be
 * recorded first, the event must be persisted second, and only then may the job
 * be handed to BullMQ with retry/retention options that keep the DLQ meaningful.
 */
describe('EventBusService — publish boundary', () => {
  let service: EventBusService;
  let calls: string[];

  const queue = { add: vi.fn() };
  const store = { store: vi.fn() };
  const monitoring = { recordPublished: vi.fn() };
  const dlq = {};

  const event = (suffix = '1'): DomainEvent => ({
    ...createEvent(
      EVENT_NAMES.SCHEDULE_CREATED,
      `sched-${suffix}`,
      AGGREGATE_TYPES.SCHEDULE,
      { month: 11, year: 2026 },
      `corr-${suffix}`,
    ),
    eventId: `evt-${suffix}`,
  });

  beforeEach(() => {
    calls = [];
    queue.add.mockReset().mockImplementation(() => {
      calls.push('queue.add');
      return Promise.resolve(undefined);
    });
    store.store.mockReset().mockImplementation(() => {
      calls.push('store.store');
      return Promise.resolve(undefined);
    });
    monitoring.recordPublished.mockReset().mockImplementation(() => {
      calls.push('monitoring.recordPublished');
    });
    service = new EventBusService(
      queue as any,
      store as any,
      monitoring as any,
      dlq as any,
    );
  });

  it('records, stores and enqueues an event in that order with retry options', async () => {
    const published = event('a');

    await service.publish(published);

    expect(calls).toEqual([
      'monitoring.recordPublished',
      'store.store',
      'queue.add',
    ]);
    expect(monitoring.recordPublished).toHaveBeenCalledWith(published);
    expect(store.store).toHaveBeenCalledWith(published);
    expect(queue.add).toHaveBeenCalledWith(published.eventName, published, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
  });

  it('does not swallow an enqueue failure after the event was persisted', async () => {
    queue.add.mockRejectedValueOnce(new Error('bull unavailable'));

    await expect(service.publish(event('b'))).rejects.toThrow('bull unavailable');
    expect(store.store).toHaveBeenCalledTimes(1);
  });

  it('publishBatch publishes every event once and is a no-op for an empty batch', async () => {
    const events = [event('c'), event('d')];

    await service.publishBatch(events);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(events.every((item) => store.store.mock.calls.some(([arg]) => arg === item))).toBe(true);

    queue.add.mockClear();
    store.store.mockClear();
    monitoring.recordPublished.mockClear();

    await service.publishBatch([]);

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.store).not.toHaveBeenCalled();
    expect(monitoring.recordPublished).not.toHaveBeenCalled();
  });
});
