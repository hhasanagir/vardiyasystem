import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsConsumer } from '../handlers/events.consumer';
import { AGGREGATE_TYPES, EVENT_NAMES, type DomainEvent } from '../domain-event.interface';

/** Phase 5c49 — coverage wave 1: consumer routing, retry and DLQ escalation. */
describe('EventsConsumer', () => {
  const dlq = { sendToDlq: vi.fn() };
  const monitoring = {
    recordLatency: vi.fn(),
    recordProcessed: vi.fn(),
    recordFailed: vi.fn(),
  };
  let consumer: EventsConsumer;

  const jobFor = (eventName: string, attemptsMade = 0): any => {
    const event = {
      eventId: 'evt-1',
      eventName,
      aggregateId: 'agg-1',
      aggregateType: AGGREGATE_TYPES.SCHEDULE,
      correlationId: 'corr-1',
      // BullMQ round-trips the Date as a string — the consumer must rehydrate it.
      timestamp: '2026-11-23T10:00:00.000Z' as unknown as Date,
      payload: { scheduleId: 'sched-1', month: 11, year: 2026 },
    } as unknown as DomainEvent;
    return { id: 'job-1', data: event, attemptsMade };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dlq.sendToDlq.mockResolvedValue(undefined);
    consumer = new EventsConsumer(dlq as any, monitoring as any);
  });

  it.each([
    EVENT_NAMES.SCHEDULE_CREATED,
    EVENT_NAMES.SCHEDULE_UPDATED,
    EVENT_NAMES.SCHEDULE_APPROVED,
    EVENT_NAMES.SHIFT_SWAPPED,
    EVENT_NAMES.DEVICE_INCIDENT_CREATED,
    EVENT_NAMES.PERSONNEL_CREATED,
    EVENT_NAMES.NOTIFICATION_SENT,
  ])('routes %s to its handler and records success', async (eventName) => {
    await consumer.process(jobFor(eventName));

    expect(monitoring.recordLatency).toHaveBeenCalledWith(eventName, expect.any(Number));
    expect(monitoring.recordProcessed).toHaveBeenCalledWith(eventName, expect.any(Number));
    expect(monitoring.recordFailed).not.toHaveBeenCalled();
    expect(dlq.sendToDlq).not.toHaveBeenCalled();
  });

  it('marks unknown event names as processed without a handler', async () => {
    await consumer.process(jobFor('unknown.event'));

    expect(monitoring.recordProcessed).toHaveBeenCalledWith('unknown.event', expect.any(Number));
  });

  it('rethrows handler failures while attempts remain and records the failure', async () => {
    vi.spyOn(consumer as any, 'handleScheduleEvent').mockRejectedValueOnce(new Error('boom'));

    await expect(consumer.process(jobFor(EVENT_NAMES.SCHEDULE_CREATED, 0))).rejects.toThrow('boom');

    expect(monitoring.recordFailed).toHaveBeenCalledWith(EVENT_NAMES.SCHEDULE_CREATED);
    expect(dlq.sendToDlq).not.toHaveBeenCalled();
  });

  it('sends the event to the DLQ on the last attempt without rethrowing', async () => {
    const error = new Error('final failure');
    vi.spyOn(consumer as any, 'handleScheduleEvent').mockRejectedValueOnce(error);

    await expect(consumer.process(jobFor(EVENT_NAMES.SCHEDULE_CREATED, 2))).resolves.toBeUndefined();

    expect(monitoring.recordFailed).toHaveBeenCalledWith(EVENT_NAMES.SCHEDULE_CREATED);
    expect(dlq.sendToDlq).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1' }),
      error,
      3,
    );
    expect(monitoring.recordProcessed).not.toHaveBeenCalled();
  });

  it('exposes worker lifecycle hooks without throwing', () => {
    expect(() => consumer.onFailed({ id: 'job-1' } as any, new Error('x'))).not.toThrow();
    expect(() => consumer.onCompleted({ id: 'job-1' } as any)).not.toThrow();
  });
});
