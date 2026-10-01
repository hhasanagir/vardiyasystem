import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import prometheus from 'prom-client';
import { winstonLogger } from '../logger/winston-logger';

@Injectable()
export class MetricsService implements OnModuleInit {
  private registry: prometheus.Registry;
  private prefix = 'vardiya_';

  httpRequestDuration: prometheus.Histogram<string>;
  httpRequestsTotal: prometheus.Counter<string>;
  httpInFlight: prometheus.Gauge<string>;

  authLoginTotal: prometheus.Counter<string>;
  authLoginDuration: prometheus.Histogram<string>;

  shiftCreatedTotal: prometheus.Counter<string>;
  swapRequestTotal: prometheus.Counter<string>;

  notificationDeliveredTotal: prometheus.Counter<string>;
  notificationFailedTotal: prometheus.Counter<string>;

  dbQueryDuration: prometheus.Histogram<string>;
  dbSlowQueriesTotal: prometheus.Counter<string>;
  dbQueriesTotal: prometheus.Counter<string>;

  wsConnectionsGauge: prometheus.Gauge<string>;
  wsEventsTotal: prometheus.Counter<string>;
  wsErrorsTotal: prometheus.Counter<string>;

  incidentCreatedTotal: prometheus.Counter<string>;

  scheduleGenerationDuration: prometheus.Histogram<string>;
  scheduleGenerationTotal: prometheus.Counter<string>;
  queueJobDuration: prometheus.Histogram<string>;
  queueJobTotal: prometheus.Counter<string>;
  activeSessionsGauge: prometheus.Gauge<string>;

  private slowQueryThresholdMs: number;

  constructor(private config: ConfigService) {
    this.slowQueryThresholdMs = this.config.get('SLOW_QUERY_THRESHOLD_MS', 100);
  }

  onModuleInit() {
    this.registry = new prometheus.Registry();
    prometheus.collectDefaultMetrics({
      register: this.registry,
      prefix: this.prefix,
    });

    this.httpRequestDuration = new prometheus.Histogram({
      name: `${this.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new prometheus.Counter({
      name: `${this.prefix}http_requests_total`,
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpInFlight = new prometheus.Gauge({
      name: `${this.prefix}http_in_flight_requests`,
      help: 'Currently in-flight HTTP requests',
      registers: [this.registry],
    });

    this.authLoginTotal = new prometheus.Counter({
      name: `${this.prefix}auth_login_total`,
      help: 'Authentication attempts',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.authLoginDuration = new prometheus.Histogram({
      name: `${this.prefix}auth_login_duration_seconds`,
      help: 'Authentication request duration',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.shiftCreatedTotal = new prometheus.Counter({
      name: `${this.prefix}shift_created_total`,
      help: 'Total shifts created',
      labelNames: ['unit_id'],
      registers: [this.registry],
    });

    this.swapRequestTotal = new prometheus.Counter({
      name: `${this.prefix}swap_request_total`,
      help: 'Total swap requests',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.notificationDeliveredTotal = new prometheus.Counter({
      name: `${this.prefix}notification_delivered_total`,
      help: 'Notifications successfully delivered',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.notificationFailedTotal = new prometheus.Counter({
      name: `${this.prefix}notification_failed_total`,
      help: 'Notifications that failed to deliver',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.dbQueryDuration = new prometheus.Histogram({
      name: `${this.prefix}db_query_duration_seconds`,
      help: 'Database query duration in seconds',
      labelNames: ['model', 'action'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    this.dbSlowQueriesTotal = new prometheus.Counter({
      name: `${this.prefix}db_slow_queries_total`,
      help: 'Slow database queries exceeding threshold',
      labelNames: ['model', 'action'],
      registers: [this.registry],
    });

    this.dbQueriesTotal = new prometheus.Counter({
      name: `${this.prefix}db_queries_total`,
      help: 'Total database queries',
      labelNames: ['model', 'action'],
      registers: [this.registry],
    });

    this.wsConnectionsGauge = new prometheus.Gauge({
      name: `${this.prefix}ws_connections`,
      help: 'Current WebSocket connections',
      registers: [this.registry],
    });

    this.wsEventsTotal = new prometheus.Counter({
      name: `${this.prefix}ws_events_total`,
      help: 'WebSocket events emitted',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.wsErrorsTotal = new prometheus.Counter({
      name: `${this.prefix}ws_errors_total`,
      help: 'WebSocket errors',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.incidentCreatedTotal = new prometheus.Counter({
      name: `${this.prefix}incident_created_total`,
      help: 'Device incidents created',
      labelNames: ['severity'],
      registers: [this.registry],
    });

    this.scheduleGenerationDuration = new prometheus.Histogram({
      name: `${this.prefix}schedule_generation_duration_seconds`,
      help: 'Schedule generation duration in seconds',
      labelNames: ['unit_id', 'status'],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });

    this.scheduleGenerationTotal = new prometheus.Counter({
      name: `${this.prefix}schedule_generation_total`,
      help: 'Total schedule generation attempts',
      labelNames: ['unit_id', 'status'],
      registers: [this.registry],
    });

    this.queueJobDuration = new prometheus.Histogram({
      name: `${this.prefix}queue_job_duration_seconds`,
      help: 'Queue job processing duration',
      labelNames: ['queue', 'type', 'status'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
      registers: [this.registry],
    });

    this.queueJobTotal = new prometheus.Counter({
      name: `${this.prefix}queue_job_total`,
      help: 'Total queue jobs processed',
      labelNames: ['queue', 'type', 'status'],
      registers: [this.registry],
    });

    this.activeSessionsGauge = new prometheus.Gauge({
      name: `${this.prefix}active_sessions`,
      help: 'Number of active user sessions',
      registers: [this.registry],
    });

    winstonLogger.info('metrics_registered', {
      count: Object.keys(this.registry.getMetricsAsJSON()).length,
    });
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  recordDbQuery(model: string, action: string, durationMs: number) {
    this.dbQueryDuration.observe({ model, action }, durationMs / 1000);
    this.dbQueriesTotal.inc({ model, action });

    if (durationMs > this.slowQueryThresholdMs) {
      this.dbSlowQueriesTotal.inc({ model, action });
      winstonLogger.warn('slow_query_detected', {
        model,
        action,
        durationMs: Math.round(durationMs),
        threshold: this.slowQueryThresholdMs,
      });
    }
  }
}
