import { Controller, Get, UseGuards, Res, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { SkipCsrf } from '../auth/csrf';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma.service';
import { AlertingService } from '../../alerting/alerting.service';
import { HealthMonitorService } from './health-monitor.service';
import { MetricsService } from '../../metrics/metrics.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();
  private readonly version: string;
  private lastAlertTime = 0;
  private readonly alertCooldownMs = 300_000;

  constructor(
    private prisma: PrismaService,
    private alerting: AlertingService,
    private monitor: HealthMonitorService,
    @InjectQueue('schedule-jobs') private scheduleQueue: Queue,
    private metrics?: MetricsService,
  ) {
    let ver = '0.0.0';
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        ver = pkg.version || ver;
      }
    } catch {
      // keep default
    }
    this.version = ver;

    this.monitor.startDbHealthCheck(this.prisma);
  }

  @Get('live')
  @SkipCsrf()
  @ApiOperation({
    summary:
      'Kubernetes liveness probe — always returns ok if process is alive',
  })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('ready')
  @SkipCsrf()
  @ApiOperation({
    summary:
      'Kubernetes readiness probe — checks DB, Redis, queue, memory, and system health',
  })
  async ready() {
    const checks: Record<string, string> = {};

    checks.database = await this.checkDatabase(true);
    checks.redis = await this.checkRedis();
    checks.queue = await this.checkQueue();
    checks.memory = this.checkMemory();
    checks.endpoints = this.checkEndpointHealth();

    const allOk = Object.values(checks).every((s) => s === 'ok');
    const status = allOk ? 'ok' : 'degraded';

    if (status === 'degraded') {
      const now = Date.now();
      if (now - this.lastAlertTime > this.alertCooldownMs) {
        this.lastAlertTime = now;
        const failed = Object.entries(checks)
          .filter(([, v]) => v !== 'ok')
          .map(([k]) => k);
        this.alerting.sendAlert({
          title: 'Readiness degraded',
          message: `Health check failure: ${failed.join(', ')}`,
          severity: 'warning',
          source: 'health-controller',
          metadata: { checks, uptime: Math.floor(process.uptime()) },
        });
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  @Get()
  @SkipCsrf()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Full health check with system metrics (requires auth)',
  })
  async check() {
    const start = Date.now();

    const dbStatus = await this.checkDatabase(false);
    const system = this.monitor.getSystemHealth();
    const overview = this.monitor.getOverview();

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      version: this.version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      responseTimeMs: Date.now() - start,
      database: {
        status: dbStatus,
        latencyMs: this.monitor.getDatabaseHealth().latencyMs,
        lastChecked: this.monitor.getDatabaseHealth().lastChecked,
      },
      redis: await this.checkRedis(),
      queue: await this.checkQueue(),
      memory: system.memory,
      endpoints: overview,
      failing: this.monitor.getFailingEndpoints().slice(0, 10),
    };
  }

  @Get('dashboard')
  @SkipCsrf()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Full API health dashboard with per-endpoint metrics',
  })
  async dashboard(@Req() req: Request, @Res() res: Response) {
    const accept = req.headers.accept || '';

    this.monitor.updateSystemHealth();
    const system = this.monitor.getSystemHealth();
    const overview = this.monitor.getOverview();
    const endpoints = this.monitor.getEndpointStatuses();
    const failing = this.monitor.getFailingEndpoints();
    const degraded = this.monitor.getDegradedEndpoints();
    const slowest = this.monitor.getTopSlowestEndpoints(10);
    const db = this.monitor.getDatabaseHealth();

    if (accept.includes('text/html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        this.renderDashboardHtml({
          overview,
          endpoints,
          failing,
          degraded,
          slowest,
          db,
          system,
        }),
      );
      return;
    }

    return res.json({
      overview: {
        ...overview,
        uptimeHuman: this.formatUptime(overview.uptimeSeconds),
        uptimeSeconds: overview.uptimeSeconds,
      },
      database: {
        ...db,
        lastChecked: db.lastChecked?.toISOString() || null,
      },
      system: {
        ...system,
        startTime: system.startTime.toISOString(),
      },
      endpoints: {
        total: endpoints.length,
        healthy: endpoints.filter((e) => e.status === 'healthy').length,
        degraded: degraded.length,
        failing: failing.length,
        list: endpoints,
      },
      slowestEndpoints: slowest,
      failingEndpoints: failing,
      degradedEndpoints: degraded,
      timestamp: new Date().toISOString(),
    });
  }

  private async checkDatabase(silent: boolean): Promise<string> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      if (!silent) {
        this.monitor.recordSuccess('GET', '/health/ready', 200, latency);
      }
      return 'ok';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!silent) {
        this.monitor.recordError('GET', '/health/ready', 503, 0, msg);
      }
      return `error: ${msg}`;
    }
  }

  private checkMemory(): string {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    if (heapTotalMB > 0 && heapUsedMB / heapTotalMB > 0.9) {
      return 'warning';
    }
    return 'ok';
  }

  private checkEndpointHealth(): string {
    const failing = this.monitor.getFailingEndpoints();
    const degraded = this.monitor.getDegradedEndpoints();
    if (failing.length > 0)
      return `degraded: ${failing.length} endpoints failing`;
    if (degraded.length > 0)
      return `degraded: ${degraded.length} endpoints degraded`;
    return 'ok';
  }

  private async checkRedis(): Promise<string> {
    try {
      await this.scheduleQueue.getJobCounts('waiting');
      return 'ok';
    } catch {
      return 'failing: redis unreachable';
    }
  }

  private async checkQueue(): Promise<string> {
    try {
      const counts = await this.scheduleQueue.getJobCounts(
        'active',
        'waiting',
        'completed',
        'failed',
      );
      if (counts.failed > 100) return `warning: ${counts.failed} failed jobs`;
      return 'ok';
    } catch {
      return 'warning: queue check failed';
    }
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}g`);
    if (h > 0) parts.push(`${h}s`);
    if (m > 0) parts.push(`${m}d`);
    parts.push(`${s}sn`);
    return parts.join(' ');
  }

  private renderDashboardHtml(data: {
    overview: ReturnType<HealthMonitorService['getOverview']>;
    endpoints: ReturnType<HealthMonitorService['getEndpointStatuses']>;
    failing: ReturnType<HealthMonitorService['getFailingEndpoints']>;
    degraded: ReturnType<HealthMonitorService['getDegradedEndpoints']>;
    slowest: ReturnType<HealthMonitorService['getTopSlowestEndpoints']>;
    db: ReturnType<HealthMonitorService['getDatabaseHealth']>;
    system: ReturnType<HealthMonitorService['getSystemHealth']>;
  }): string {
    const { overview, endpoints, failing, degraded, slowest, db, system } =
      data;

    const statusColor = (s: string) =>
      s === 'healthy' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : '#ef4444';
    const statusIcon = (s: string) =>
      s === 'healthy' ? '✓' : s === 'degraded' ? '⚠' : '✕';

    const endpointRows = endpoints
      .map(
        (e) => `
      <tr>
        <td><span class="method method-${e.method.toLowerCase()}">${e.method}</span></td>
        <td class="path">${e.path}</td>
        <td><span class="status-dot" style="background:${statusColor(e.status)}" title="${e.status}">${statusIcon(e.status)}</span></td>
        <td>${e.totalCalls}</td>
        <td>${e.errorRate}%</td>
        <td>${e.avgResponseMs}ms</td>
        <td>${e.p95ResponseMs}ms</td>
        <td>${e.lastChecked ? new Date(e.lastChecked).toLocaleTimeString('tr-TR') : '-'}</td>
      </tr>
    `,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Health Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
h1 { font-size: 20px; color: #f8fafc; margin-bottom: 4px; }
.subtitle { color: #94a3b8; font-size: 13px; margin-bottom: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
.card .label { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px; }
.card .value { font-size: 28px; font-weight: 600; }
.card .value.green { color: #22c55e; }
.card .value.yellow { color: #f59e0b; }
.card .value.red { color: #ef4444; }
.card .value.blue { color: #3b82f6; }
.section-title { font-size: 14px; font-weight: 600; color: #f1f5f9; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #334155; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; padding: 8px 12px; color: #94a3b8; font-weight: 500; text-transform: uppercase; font-size: 11px; border-bottom: 1px solid #334155; }
td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
tr:hover { background: #1e293b; }
.method { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; color: #fff; width: 56px; text-align: center; }
.method-get { background: #2563eb; }
.method-post { background: #16a34a; }
.method-put { background: #ca8a04; }
.method-patch { background: #9333ea; }
.method-delete { background: #dc2626; }
.path { font-family: 'Monaco', 'Consolas', monospace; font-size: 12px; color: #e2e8f0; }
.status-dot { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: #fff; font-size: 12px; font-weight: bold; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.badge-green { background: #22c55e20; color: #22c55e; border: 1px solid #22c55e40; }
.badge-yellow { background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b40; }
.badge-red { background: #ef444420; color: #ef4444; border: 1px solid #ef444440; }
.health-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 8px; }
.health-bar .seg { transition: width 0.3s; }
.meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 13px; }
.meta-grid .key { color: #64748b; }
@media (max-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
  table { font-size: 11px; }
  td, th { padding: 6px 8px; }
}
</style>
</head>
<body>
<h1>🩺 API Health Dashboard</h1>
<p class="subtitle">${new Date().toLocaleString('tr-TR')} &middot; v${system.version} &middot; Node ${system.nodeVersion}</p>

<div class="grid">
  <div class="card">
    <div class="label">Genel Durum</div>
    <div class="value ${overview.failingEndpoints > 0 ? 'red' : overview.degradedEndpoints > 0 ? 'yellow' : 'green'}">
      ${overview.failingEndpoints > 0 ? 'Kritik' : overview.degradedEndpoints > 0 ? 'Uyarı' : 'Sağlıklı'}
    </div>
  </div>
  <div class="card">
    <div class="label">API Uç Noktaları</div>
    <div class="value blue">${overview.totalEndpoints}</div>
    <div class="health-bar">
      <div class="seg" style="width:${overview.totalEndpoints > 0 ? (overview.healthyEndpoints / overview.totalEndpoints) * 100 : 0}%;background:#22c55e"></div>
      <div class="seg" style="width:${overview.totalEndpoints > 0 ? (overview.degradedEndpoints / overview.totalEndpoints) * 100 : 0}%;background:#f59e0b"></div>
      <div class="seg" style="width:${overview.totalEndpoints > 0 ? (overview.failingEndpoints / overview.totalEndpoints) * 100 : 0}%;background:#ef4444"></div>
    </div>
    <div style="margin-top:6px;font-size:11px;color:#94a3b8">
      <span style="color:#22c55e">● ${overview.healthyEndpoints} sağlıklı</span>
      <span style="color:#f59e0b;margin-left:8px">● ${overview.degradedEndpoints} uyarı</span>
      <span style="color:#ef4444;margin-left:8px">● ${overview.failingEndpoints} hata</span>
    </div>
  </div>
  <div class="card">
    <div class="label">Veritabanı</div>
    <div class="value ${db.connected ? 'green' : 'red'}">${db.connected ? 'Bağlı' : 'Kopuk'}</div>
    <div style="margin-top:6px;font-size:11px;color:#94a3b8">${db.latencyMs}ms gecikme</div>
  </div>
  <div class="card">
    <div class="label">Bellek Kullanımı</div>
    <div class="value">${system.memory.heapUsed}MB</div>
    <div style="margin-top:6px;font-size:11px;color:#94a3b8">${system.memory.heapTotal}MB toplam</div>
  </div>
  <div class="card">
    <div class="label">Çalışma Süresi</div>
    <div class="value green">${this.formatUptime(overview.uptimeSeconds)}</div>
  </div>
  <div class="card">
    <div class="label">Toplam İstek</div>
    <div class="value blue">${overview.totalCalls}</div>
    <div style="margin-top:6px;font-size:11px;color:#94a3b8">${overview.totalErrors} hata (${overview.overallErrorRate}%)</div>
  </div>
</div>

${
  failing.length > 0
    ? `
<div class="section-title" style="color:#ef4444">✕ Başarısız Uç Noktalar (${failing.length})</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Durum</th><th>Hata Oranı</th><th>Ort. Süre</th><th>P95</th><th>Son</th></tr></thead>
<tbody>${failing
        .map(
          (e) => `
  <tr>
    <td><span class="method method-${e.method.toLowerCase()}">${e.method}</span></td>
    <td class="path">${e.path}</td>
    <td><span class="badge badge-red">Başarısız</span></td>
    <td>${e.errorRate}%</td>
    <td>${e.avgResponseMs}ms</td>
    <td>${e.p95ResponseMs}ms</td>
    <td>${e.lastChecked ? new Date(e.lastChecked).toLocaleTimeString('tr-TR') : '-'}</td>
  </tr>`,
        )
        .join('\n')}</tbody></table>`
    : ''
}

${
  degraded.length > 0
    ? `
<div class="section-title" style="color:#f59e0b">⚠ Uyarılı Uç Noktalar (${degraded.length})</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Durum</th><th>Hata Oranı</th><th>Ort. Süre</th><th>P95</th><th>Son</th></tr></thead>
<tbody>${degraded
        .map(
          (e) => `
  <tr>
    <td><span class="method method-${e.method.toLowerCase()}">${e.method}</span></td>
    <td class="path">${e.path}</td>
    <td><span class="badge badge-yellow">Uyarı</span></td>
    <td>${e.errorRate}%</td>
    <td>${e.avgResponseMs}ms</td>
    <td>${e.p95ResponseMs}ms</td>
    <td>${e.lastChecked ? new Date(e.lastChecked).toLocaleTimeString('tr-TR') : '-'}</td>
  </tr>`,
        )
        .join('\n')}</tbody></table>`
    : ''
}

<div class="section-title">En Yavaş Uç Noktalar (P95)</div>
<table>
<thead><tr><th>#</th><th>Method</th><th>Path</th><th>Ort. Süre</th><th>P95</th><th>Toplam</th><th>Hata %</th></tr></thead>
<tbody>${slowest
      .map(
        (e, i) => `
  <tr>
    <td>${i + 1}</td>
    <td><span class="method method-${e.method.toLowerCase()}">${e.method}</span></td>
    <td class="path">${e.path}</td>
    <td>${e.avgResponseMs}ms</td>
    <td><strong>${e.p95ResponseMs}ms</strong></td>
    <td>${e.totalCalls}</td>
    <td>${e.errorRate}%</td>
  </tr>`,
      )
      .join('\n')}</tbody></table>

<div class="section-title">Tüm Uç Noktalar (${endpoints.length})</div>
<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
  <input type="text" id="filter" placeholder="Uç nokta ara..." oninput="filterTable()" style="background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:6px 12px;border-radius:6px;font-size:13px;width:300px">
  <span style="color:#64748b;font-size:12px;padding:6px 0">Tümü · Sağlıklı · Uyarı · Hata</span>
</div>
<table id="endpoint-table">
<thead><tr><th>Method</th><th>Path</th><th>Durum</th><th>İstek</th><th>Hata %</th><th>Ort. Süre</th><th>P95</th><th>Son Kontrol</th></tr></thead>
<tbody>${endpointRows}</tbody></table>

<script>
function filterTable() {
  const q = document.getElementById('filter').value.toLowerCase();
  document.querySelectorAll('#endpoint-table tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body>
</html>`;
  }
}
