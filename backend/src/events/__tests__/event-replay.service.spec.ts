import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventReplayService } from '../event-replay.service';
import { AGGREGATE_TYPES, EVENT_NAMES, type DomainEvent } from '../domain-event.interface';

/** Phase 5c49 — coverage wave 1: replay re-publishes stored events through the bus. */
describe('EventReplayService', () => {
  const queue = { add: vi.fn() };
  const store = {
    replayByAggregate: vi.fn(),
    replayByType: vi.fn(),
    replayAll: vi.fn(),
    getEvent: vi.fn(),
    countByAggregate: vi.fn(),
  };
  let service: EventReplayService;

  const events: DomainEvent[] = [
    {
      eventId: 'evt-1',
      eventName: EVENT_NAMES.SCHEDULE_CREATED,
      aggregateId: 'sched-1',
      aggregateType: AGGREGATE_TYPES.SCHEDULE,
      correlationId: 'corr-1',
      timestamp: new Date('2026-11-23T10:00:00.000Z'),
      payload: {},
    },
    {
      eventId: 'evt-2',
      eventName: EVENT_NAMES.SCHEDULE_UPDATED,
      aggregateId: 'sched-1',
      aggregateType: AGGREGATE_TYPES.SCHEDULE,
      correlationId: 'corr-2',
      timestamp: new Date('2026-11-23T11:00:00.000Z'),
      payload: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queue.add.mockResolvedValue(undefined);
    store.replayByAggregate.mockResolvedValue(events);
    store.replayByType.mockResolvedValue(events.slice(0, 1));
    store.replayAll.mockResolvedValue([]);
    store.getEvent.mockResolvedValue(events[0]);
    store.countByAggregate.mockResolvedValue(2);
    service = new EventReplayService(queue as any, store as any);
  });

  it('replays an aggregate and re-enqueues every event with retry options', async () => {
    await expect(service.replayByAggregate(AGGREGATE_TYPES.SCHEDULE, 'sched-1')).resolves.toBe(2);

    expect(store.replayByAggregate).toHaveBeenCalledWith(AGGREGATE_TYPES.SCHEDULE, 'sched-1');
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(events[0].eventName, events[0], {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  });

  it('passes the timestamp window through replayByType and replayAll', async () => {
    const from = Date.parse('2026-11-23T00:00:00.000Z');
    const to = Date.parse('2026-11-24T00:00:00.000Z');

    await expect(service.replayByType(AGGREGATE_TYPES.SCHEDULE, from, to)).resolves.toBe(1);
    await expect(service.replayAll(from, to)).resolves.toBe(0);

    expect(store.replayByType).toHaveBeenCalledWith(AGGREGATE_TYPES.SCHEDULE, from, to);
    expect(store.replayAll).toHaveBeenCalledWith(from, to);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('delegates single-event lookup and aggregate counting to the store', async () => {
    await expect(service.getEvent('evt-1')).resolves.toBe(events[0]);
    await expect(service.getAggregateEventCount(AGGREGATE_TYPES.SCHEDULE, 'sched-1')).resolves.toBe(2);

    expect(store.getEvent).toHaveBeenCalledWith('evt-1');
    expect(store.countByAggregate).toHaveBeenCalledWith(AGGREGATE_TYPES.SCHEDULE, 'sched-1');
  });
});
