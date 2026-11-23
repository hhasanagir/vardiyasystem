import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGGREGATE_TYPES, EVENT_NAMES, type DomainEvent } from '../domain-event.interface';

/** Phase 5c49 — coverage wave 1: Prometheus labels and millisecond→second conversion. */
interface MetricOptions {
  name: string;
  labelNames: readonly string[];
  help?: string;
  buckets?: readonly number[];
}

const promState = vi.hoisted(() => ({
  counters: [] as Array<{ options: MetricOptions; inc: ReturnType<typeof vi.fn> }>,
  histograms: [] as Array<{ options: MetricOptions; observe: ReturnType<typeof vi.fn> }>,
  exponentialBuckets: vi.fn(() => [0.01, 1]),
}));

vi.mock('prom-client', () => ({
  default: {
    Counter: class {
      inc = vi.fn();
      constructor(options: MetricOptions) {
        promState.counters.push({ options, inc: this.inc });
      }
    },
    Histogram: class {
      observe = vi.fn();
      constructor(options: MetricOptions) {
        promState.histograms.push({ options, observe: this.observe });
      }
    },
    exponentialBuckets: promState.exponentialBuckets,
  },
}));

import { EventMonitoringService } from '../event-monitoring.service';

describe('EventMonitoringService', () => {
  let service: EventMonitoringService;

  const event = {
    eventId: 'evt-1',
    eventName: EVENT_NAMES.SCHEDULE_CREATED,
    aggregateId: 'sched-1',
    aggregateType: AGGREGATE_TYPES.SCHEDULE,
    correlationId: 'corr-1',
    timestamp: new Date('2026-11-23T10:00:00.000Z'),
    payload: {},
  } as DomainEvent;

  beforeEach(() => {
    promState.counters.length = 0;
    promState.histograms.length = 0;
    promState.exponentialBuckets.mockClear();
    service = new EventMonitoringService();
  });

  it('registers four counters and two histograms under the vardiya_events prefix', () => {
    expect(promState.counters.map((item) => item.options.name)).toEqual([
      'vardiya_events_published_total',
      'vardiya_events_processed_total',
      'vardiya_events_failed_total',
      'vardiya_events_dlq_total',
    ]);
    expect(promState.counters.every((item) => item.options.labelNames.includes('event_name'))).toBe(true);
    expect(promState.histograms.map((item) => item.options.name)).toEqual([
      'vardiya_events_processing_duration_seconds',
      'vardiya_events_latency_seconds',
    ]);
    expect(promState.exponentialBuckets).toHaveBeenCalledTimes(2);
  });

  it('records every lifecycle counter with the event name label', () => {
    service.recordPublished(event);
    service.recordFailed(event.eventName);
    service.recordDlq(event.eventName);

    expect(promState.counters[0].inc).toHaveBeenCalledWith({ event_name: event.eventName });
    expect(promState.counters[2].inc).toHaveBeenCalledWith({ event_name: event.eventName });
    expect(promState.counters[3].inc).toHaveBeenCalledWith({ event_name: event.eventName });
  });

  it('observes processing duration and latency in seconds', () => {
    service.recordProcessed(event.eventName, 1500);
    service.recordLatency(event.eventName, 250);

    expect(promState.counters[1].inc).toHaveBeenCalledWith({ event_name: event.eventName });
    expect(promState.histograms[0].observe).toHaveBeenCalledWith({ event_name: event.eventName }, 1.5);
    expect(promState.histograms[1].observe).toHaveBeenCalledWith({ event_name: event.eventName }, 0.25);
  });
});
