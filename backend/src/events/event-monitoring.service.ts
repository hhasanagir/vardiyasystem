import { Injectable } from '@nestjs/common';
import prometheus from 'prom-client';
import { DomainEvent, EVENT_NAMES } from './domain-event.interface';

@Injectable()
export class EventMonitoringService {
  readonly eventsPublishedTotal: prometheus.Counter<string>;
  readonly eventsProcessedTotal: prometheus.Counter<string>;
  readonly eventsFailedTotal: prometheus.Counter<string>;
  readonly eventsDlqTotal: prometheus.Counter<string>;
  readonly eventProcessingDuration: prometheus.Histogram<string>;
  readonly eventsLatencySeconds: prometheus.Histogram<string>;

  constructor() {
    const prefix = 'vardiya_events_';

    this.eventsPublishedTotal = new prometheus.Counter({
      name: `${prefix}published_total`,
      help: 'Total events published to the event bus',
      labelNames: ['event_name'] as const,
    });

    this.eventsProcessedTotal = new prometheus.Counter({
      name: `${prefix}processed_total`,
      help: 'Total events successfully processed',
      labelNames: ['event_name'] as const,
    });

    this.eventsFailedTotal = new prometheus.Counter({
      name: `${prefix}failed_total`,
      help: 'Total events that failed processing',
      labelNames: ['event_name'] as const,
    });

    this.eventsDlqTotal = new prometheus.Counter({
      name: `${prefix}dlq_total`,
      help: 'Total events sent to dead letter queue',
      labelNames: ['event_name'] as const,
    });

    this.eventProcessingDuration = new prometheus.Histogram({
      name: `${prefix}processing_duration_seconds`,
      help: 'Event processing duration in seconds',
      labelNames: ['event_name'] as const,
      buckets: prometheus.exponentialBuckets(0.01, 2, 10),
    });

    this.eventsLatencySeconds = new prometheus.Histogram({
      name: `${prefix}latency_seconds`,
      help: 'Event latency (time between publish and processing start)',
      labelNames: ['event_name'] as const,
      buckets: prometheus.exponentialBuckets(0.1, 2, 10),
    });
  }

  recordPublished(event: DomainEvent): void {
    this.eventsPublishedTotal.inc({ event_name: event.eventName });
  }

  recordProcessed(eventName: string, durationMs: number): void {
    this.eventsProcessedTotal.inc({ event_name: eventName });
    this.eventProcessingDuration.observe(
      { event_name: eventName },
      durationMs / 1000,
    );
  }

  recordFailed(eventName: string): void {
    this.eventsFailedTotal.inc({ event_name: eventName });
  }

  recordDlq(eventName: string): void {
    this.eventsDlqTotal.inc({ event_name: eventName });
  }

  recordLatency(eventName: string, latencyMs: number): void {
    this.eventsLatencySeconds.observe(
      { event_name: eventName },
      latencyMs / 1000,
    );
  }
}
