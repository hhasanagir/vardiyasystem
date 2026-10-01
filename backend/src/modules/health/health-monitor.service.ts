import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EndpointHealth {
  method: string;
  path: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  lastStatusCode: number;
  lastChecked: Date | null;
  lastError: string | null;
  responseTimesMs: number[];
  statusCodes: Record<number, number>;
  isFailing: boolean;
  consecutiveErrors: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  p99ResponseMs: number;
}

export interface DbHealth {
  connected: boolean;
  latencyMs: number;
  lastChecked: Date | null;
  lastError: string | null;
}

export interface SystemHealth {
  uptime: number;
  startTime: Date;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpuLoad: number[];
  version: string;
  nodeVersion: string;
}

export interface EndpointSummary {
  path: string;
  method: string;
  status: 'healthy' | 'degraded' | 'failing';
  totalCalls: number;
  errorRate: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  lastChecked: Date | null;
}

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private readonly endpoints = new Map<string, EndpointHealth>();
  private readonly maxResponseTimes = 1000;
  private readonly errorRateThreshold: number;
  private readonly consecutiveErrorThreshold: number;
  private readonly dbCheckIntervalMs: number;
  private dbHealth: DbHealth = {
    connected: true,
    latencyMs: 0,
    lastChecked: null,
    lastError: null,
  };
  private systemHealth: SystemHealth;
  private dbCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly startTime = Date.now();
  private version = '0.0.0';

  constructor(private config: ConfigService) {
    this.errorRateThreshold = this.config.get(
      'HEALTH_ERROR_RATE_THRESHOLD',
      0.05,
    );
    this.consecutiveErrorThreshold = this.config.get(
      'HEALTH_CONSECUTIVE_ERROR_THRESHOLD',
      5,
    );
    this.dbCheckIntervalMs = this.config.get(
      'HEALTH_DB_CHECK_INTERVAL_MS',
      15000,
    );

    try {
      const pkg = require('../../package.json');
      this.version = pkg.version || '0.0.0';
    } catch {
      // keep default
    }

    this.systemHealth = {
      uptime: 0,
      startTime: new Date(),
      memory: { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 },
      cpuLoad: [],
      version: this.version,
      nodeVersion: process.version,
    };
  }

  recordSuccess(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const key = this.endpointKey(method, path);
    let ep = this.endpoints.get(key);
    if (!ep) {
      ep = this.createEndpoint(method, path);
      this.endpoints.set(key, ep);
    }

    ep.totalCalls++;
    ep.successCalls++;
    ep.lastStatusCode = statusCode;
    ep.lastChecked = new Date();
    ep.consecutiveErrors = 0;
    ep.isFailing = false;

    ep.responseTimesMs.push(durationMs);
    if (ep.responseTimesMs.length > this.maxResponseTimes) {
      ep.responseTimesMs.shift();
    }

    ep.statusCodes[statusCode] = (ep.statusCodes[statusCode] || 0) + 1;
    this.recomputePercentiles(ep);
  }

  recordError(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    error?: string,
  ): void {
    const key = this.endpointKey(method, path);
    let ep = this.endpoints.get(key);
    if (!ep) {
      ep = this.createEndpoint(method, path);
      this.endpoints.set(key, ep);
    }

    ep.totalCalls++;
    ep.errorCalls++;
    ep.lastStatusCode = statusCode;
    ep.lastChecked = new Date();
    ep.lastError = error || `HTTP ${statusCode}`;
    ep.consecutiveErrors++;
    ep.isFailing = ep.consecutiveErrors >= this.consecutiveErrorThreshold;

    ep.responseTimesMs.push(durationMs);
    if (ep.responseTimesMs.length > this.maxResponseTimes) {
      ep.responseTimesMs.shift();
    }

    ep.statusCodes[statusCode] = (ep.statusCodes[statusCode] || 0) + 1;
    this.recomputePercentiles(ep);
  }

  startDbHealthCheck(prisma: {
    $queryRaw: (q: TemplateStringsArray) => Promise<unknown>;
  }): void {
    this.dbCheckTimer = setInterval(async () => {
      const start = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        this.dbHealth = {
          connected: true,
          latencyMs: Date.now() - start,
          lastChecked: new Date(),
          lastError: null,
        };
      } catch (err) {
        this.dbHealth = {
          connected: false,
          latencyMs: Date.now() - start,
          lastChecked: new Date(),
          lastError: (err as Error).message,
        };
        this.logger.error(
          'Database health check failed',
          (err as Error).message,
        );
      }
    }, this.dbCheckIntervalMs);
  }

  stopDbHealthCheck(): void {
    if (this.dbCheckTimer) {
      clearInterval(this.dbCheckTimer);
      this.dbCheckTimer = null;
    }
  }

  getEndpointHealth(method: string, path: string): EndpointHealth | undefined {
    return this.endpoints.get(this.endpointKey(method, path));
  }

  getEndpointStatuses(): EndpointSummary[] {
    const result: EndpointSummary[] = [];
    for (const ep of this.endpoints.values()) {
      const errorRate = ep.totalCalls > 0 ? ep.errorCalls / ep.totalCalls : 0;
      let status: 'healthy' | 'degraded' | 'failing';
      if (ep.isFailing || errorRate > this.errorRateThreshold * 3) {
        status = 'failing';
      } else if (
        errorRate > this.errorRateThreshold ||
        ep.consecutiveErrors > 0
      ) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      result.push({
        path: ep.path,
        method: ep.method,
        status,
        totalCalls: ep.totalCalls,
        errorRate: Math.round(errorRate * 10000) / 100,
        avgResponseMs: Math.round(ep.avgResponseMs),
        p95ResponseMs: Math.round(ep.p95ResponseMs),
        lastChecked: ep.lastChecked,
      });
    }
    return result.sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    );
  }

  getFailingEndpoints(): EndpointSummary[] {
    return this.getEndpointStatuses().filter((e) => e.status === 'failing');
  }

  getDegradedEndpoints(): EndpointSummary[] {
    return this.getEndpointStatuses().filter((e) => e.status === 'degraded');
  }

  getDatabaseHealth(): DbHealth {
    return { ...this.dbHealth };
  }

  updateSystemHealth(): void {
    const mem = process.memoryUsage();
    this.systemHealth = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      startTime: new Date(this.startTime),
      memory: {
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        external: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      },
      cpuLoad: process.cpuUsage
        ? [
            Math.round(process.cpuUsage().user / 1000),
            Math.round(process.cpuUsage().system / 1000),
          ]
        : [],
      version: this.version,
      nodeVersion: process.version,
    };
  }

  getSystemHealth(): SystemHealth {
    this.updateSystemHealth();
    return { ...this.systemHealth };
  }

  getOverview(): {
    totalEndpoints: number;
    healthyEndpoints: number;
    degradedEndpoints: number;
    failingEndpoints: number;
    totalCalls: number;
    totalErrors: number;
    overallErrorRate: number;
    databaseConnected: boolean;
    uptimeSeconds: number;
  } {
    const statuses = this.getEndpointStatuses();
    const totalCalls = Array.from(this.endpoints.values()).reduce(
      (s, e) => s + e.totalCalls,
      0,
    );
    const totalErrors = Array.from(this.endpoints.values()).reduce(
      (s, e) => s + e.errorCalls,
      0,
    );

    return {
      totalEndpoints: statuses.length,
      healthyEndpoints: statuses.filter((e) => e.status === 'healthy').length,
      degradedEndpoints: statuses.filter((e) => e.status === 'degraded').length,
      failingEndpoints: statuses.filter((e) => e.status === 'failing').length,
      totalCalls,
      totalErrors,
      overallErrorRate:
        totalCalls > 0
          ? Math.round((totalErrors / totalCalls) * 10000) / 100
          : 0,
      databaseConnected: this.dbHealth.connected,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  getTopSlowestEndpoints(limit = 10): EndpointSummary[] {
    return this.getEndpointStatuses()
      .filter((e) => e.totalCalls > 0)
      .sort((a, b) => b.p95ResponseMs - a.p95ResponseMs)
      .slice(0, limit);
  }

  resetEndpoint(method: string, path: string): void {
    this.endpoints.delete(this.endpointKey(method, path));
  }

  resetAll(): void {
    this.endpoints.clear();
  }

  private endpointKey(method: string, path: string): string {
    return `${method}:${path}`;
  }

  private createEndpoint(method: string, path: string): EndpointHealth {
    return {
      method,
      path,
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      lastStatusCode: 0,
      lastChecked: null,
      lastError: null,
      responseTimesMs: [],
      statusCodes: {},
      isFailing: false,
      consecutiveErrors: 0,
      avgResponseMs: 0,
      p95ResponseMs: 0,
      p99ResponseMs: 0,
    };
  }

  private recomputePercentiles(ep: EndpointHealth): void {
    const times = ep.responseTimesMs;
    if (times.length === 0) return;

    const sum = times.reduce((a, b) => a + b, 0);
    ep.avgResponseMs = sum / times.length;

    const sorted = [...times].sort((a, b) => a - b);
    ep.p95ResponseMs =
      sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    ep.p99ResponseMs =
      sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
  }
}
