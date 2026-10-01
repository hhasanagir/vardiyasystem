# VardiyaOS Performance Optimization Report

**Version:** 1.0.0 | **Date:** 2026-06-29 | **Based on:** Load/Stress/Spike/Soak test results

---

## 1. Bottleneck Summary

| Priority | Component | Issue | Threshold | Observed | Impact |
|----------|-----------|-------|-----------|----------|--------|
| **P0** | Schedule Export | PDF/Excel generation blocking event loop | P95 <2s | 3,500ms | Direct user-facing timeout |
| **P0** | Dashboard Stats | Multi-query aggregation slow at scale | P95 <2s | 850ms at 1000 users, 1.8s at 5000 | Scales poorly |
| **P1** | Analytics Service | Heavy OLAP queries timeout | P95 <3s | 1.2s at 1000, 2.5s at 5000 | Affects reporting |
| **P1** | Database | Connection pool exhaustion at spike | P95 <2s | 3.2s at 5000 spike | Spike recovery slow |
| **P2** | Redis | Cache miss rate high for schedules | Hit rate <80% | 62% | Unnecessary DB load |
| **P2** | API Gateway | Rate limiting too aggressive on burst | Spike P95 <4s | 6.8s | False positive 429s |

---

## 2. Database Optimizations

### 2.1 Missing Indexes

```sql
-- Index 1: Schedule dashboard aggregation (HIGH IMPACT)
CREATE INDEX IF NOT EXISTS idx_schedules_org_status_month
ON "Schedule" ("organizationId", "status", "month", "year");

-- Index 2: Assignment lookup by schedule+personnel (HIGH IMPACT)
CREATE INDEX IF NOT EXISTS idx_assignments_schedule_personnel
ON "Assignment" ("scheduleId", "personnelId");

-- Index 3: Notification listing by user (HIGH IMPACT)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON "Notification" ("userId", "createdAt" DESC);

-- Index 4: Attendance by personnel+date (MEDIUM IMPACT)
CREATE INDEX IF NOT EXISTS idx_attendance_personnel_date
ON "AttendanceRecord" ("personnelId", "date");

-- Index 5: Audit log by user+time (MEDIUM IMPACT)
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
ON "AuditLog" ("userId", "createdAt" DESC);

-- Index 6: Schedule status filter (MEDIUM IMPACT)
CREATE INDEX IF NOT EXISTS idx_schedules_status_org
ON "Schedule" ("status", "organizationId");
```

**Estimated Impact:** 60-80% reduction in query time for dashboard, notifications, and attendance queries.

### 2.2 Query Optimization

```typescript
// BEFORE: N+1 queries for dashboard
async getDashboardStats(organizationId: string) {
  const personnel = await this.prisma.personnel.count({ where: { organizationId } });
  const units = await this.prisma.unit.findMany({ where: { organizationId } });
  const schedules = await this.prisma.schedule.findMany({ where: { organizationId }, include: { assignments: true } });
  // Client-side aggregation loops
  const todayShifts = schedules.filter(s => /* client-side date filter */);
  // 5+ separate queries + client-side processing
}

// AFTER: Single aggregated query with caching
async getDashboardStats(organizationId: string) {
  const cacheKey = `dashboard:${organizationId}`;
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [stats] = await this.prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Personnel" WHERE "organizationId" = ${organizationId} AND "isActive" = true) AS "activePersonnel",
      (SELECT COUNT(*) FROM "Assignment" a JOIN "Schedule" s ON a."scheduleId" = s.id
       WHERE s."organizationId" = ${organizationId} AND a.date = CURRENT_DATE) AS "todayShifts",
      (SELECT COUNT(*) FROM "Schedule" WHERE "organizationId" = ${organizationId} AND "status" = 'pending_approval') AS "pendingApprovals"
  `;

  const result = { ...stats, alerts: await this.getAlertsSummary(organizationId) };
  await this.redis.setex(cacheKey, 30, JSON.stringify(result));
  return result;
}
```

**Estimated Impact:** Dashboard endpoint: 800-1800ms → 50-100ms (90-95% improvement)

### 2.3 Materialized View for Analytics

```sql
-- Create materialized view for recurring analytics queries
CREATE MATERIALIZED VIEW mv_schedule_analytics AS
SELECT
  s."organizationId",
  u.id AS "unitId",
  u.name AS "unitName",
  s.month,
  s.year,
  s.status,
  COUNT(DISTINCT a."personnelId") AS "assignedPersonnel",
  COUNT(a.id) AS "totalAssignments",
  COUNT(CASE WHEN a."isOvertime" THEN 1 END) AS "overtimeCount"
FROM "Schedule" s
JOIN "Unit" u ON u.id = s."unitId"
LEFT JOIN "Assignment" a ON a."scheduleId" = s.id
GROUP BY s."organizationId", u.id, u.name, s.month, s.year, s.status;

-- Refresh every 5 minutes
CREATE INDEX IF NOT EXISTS idx_mv_schedule_analytics_org
ON mv_schedule_analytics ("organizationId");
```

## 3. Redis Optimizations

### 3.1 Cache Strategy

| Cache Key | Current TTL | Recommended TTL | Size | Est. Hit Rate |
|-----------|------------|-----------------|------|---------------|
| `schedules:list:{orgId}:{month}:{year}` | None | 60s | 50KB | 90% |
| `schedules:dashboard:{orgId}` | None | 30s | 5KB | 95% |
| `personnel:list:{orgId}` | None | 120s | 100KB | 85% |
| `units:list:{orgId}` | None | 300s | 10KB | 95% |
| `devices:list:{orgId}` | None | 300s | 8KB | 95% |
| `analytics:overview:{orgId}` | None | 60s | 15KB | 90% |

### 3.2 Configuration Tuning

```conf
# redis.conf
maxmemory 5gb
maxmemory-policy allkeys-lru
maxclients 20000
timeout 300
tcp-keepalive 60
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes
```

### 3.3 BullMQ Queue Tuning

| Queue | Current Concurrency | Recommended | Max Jobs | Rationale |
|-------|-------------------|-------------|----------|-----------|
| Notification | 5 | 15 | 2000 | Scale with users |
| Export | 2 | 4 | 100 | CPU-intensive, limit |
| Schedule Generation | 1 | 2 | 20 | CPU-intensive |
| Audit Log | 10 | 25 | 10000 | High throughput, batch |

## 4. Application Optimizations

### 4.1 Move Heavy Operations to Background Jobs

```typescript
// BEFORE: Synchronous export blocks event loop
@Get('export/excel')
async exportExcel(@Query() query: ExportDto, @Res() res: Response) {
  const buf = await this.exportService.exportExcel(query.unit, query.month, query.year);
  // User waits 3-5 seconds for response
  res.send(buf);
}

// AFTER: Background job with progress tracking
@Get('export/excel')
async exportExcel(@Query() query: ExportDto) {
  const job = await this.exportQueue.add('excel-export', {
    unit: query.unit,
    month: query.month,
    year: query.year,
    userId: req.user.id,
  });
  return { jobId: job.id, status: 'processing', estimatedSeconds: 30 };
}

@Get('export/status/:jobId')
async getExportStatus(@Param('jobId') jobId: string) {
  const job = await this.exportQueue.getJob(jobId);
  return {
    status: await job.getState(),
    progress: job.progress,
    downloadUrl: job.returnvalue ? `/api/v1/exports/download/${job.returnvalue}` : null,
  };
}
```

### 4.2 Optimize Prisma Queries

| Pattern | Before | After | Improvement |
|---------|--------|-------|-------------|
| Select all columns | `findMany()` | `findMany({ select: { id: true, name: true } })` | 40-60% less data |
| Nested `forEach` loop | `items.forEach(i => findUnique(i.id))` | `findMany({ where: { id: { in: ids } } })` | 80-90% fewer queries |
| Client-side date filter | `all.filter(s => s.date >= start)` | `findMany({ where: { date: { gte: start } } })` | 70-90% faster |
| Full table scan | No where clause | Indexed where clause | 90-99% faster |

### 4.3 Connection Pool Management

```typescript
// backend/src/prisma.service.ts
import { PrismaClient } from '@prisma/client';

export class PrismaService extends PrismaClient {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'info', 'warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Connection pool configuration
      connection: {
        pool: {
          min: 2,
          max: 15,
          idleTimeoutMillis: 10000,
          acquireTimeoutMillis: 5000,
        },
      },
    });
  }
}
```

## 5. Infrastructure Optimizations

### 5.1 HPA with Custom Metrics

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vardiya-backend
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 50
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

### 5.2 PgBouncer Pool Tuning

```ini
# pgbouncer.ini - Production tuning
pool_mode = transaction
default_pool_size = 50          # Increased from 25
max_client_conn = 500           # Increased from 200
max_db_connections = 100        # Increased from 50
server_idle_timeout = 300       # Decreased from 600
query_timeout = 30
query_wait_timeout = 10         # New: fail fast on congestion
```

### 5.3 PostgreSQL Configuration

```ini
# postgresql.conf - Production tuning
max_connections = 200
shared_buffers = '1GB'          # 25% of available RAM
effective_cache_size = '4GB'    # 75% of available RAM
work_mem = '32MB'               # Increased from 4MB
maintenance_work_mem = '256MB'
random_page_cost = 1.1          # SSD optimization
effective_io_concurrency = 200  # SSD
wal_buffers = '64MB'
checkpoint_completion_target = 0.9
default_statistics_target = 500
```

### 5.4 Recommended Pod Resources

```yaml
# Backend
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2
    memory: 1Gi

# PgBouncer
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

## 6. Optimization Roadmap

### Phase 1 (Day 1 — Before Production)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Create 6 composite indexes | 30m | High (60-80% query reduction) | Backend |
| Enable Redis caching for dashboard | 1h | High (90% dashboard improvement) | Backend |
| Move exports to background queue | 2h | High (eliminates 3.5s blocking) | Backend |
| Tune PgBouncer pool sizes | 15m | High (handles 5000 user spikes) | DevOps |
| Update HPA thresholds | 30m | Medium (faster scale-up) | DevOps |

### Phase 2 (Week 1)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Fix N+1 queries in all services | 4h | High | Backend |
| Create materialized view for analytics | 2h | Medium | Backend |
| Implement cursor-based pagination | 3h | Medium | Backend |
| Tune PostgreSQL config | 1h | High | DevOps |
| Add connection pool config to Prisma | 1h | Medium | Backend |

### Phase 3 (Week 2)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Redis Cluster deployment | 4h | Medium | DevOps |
| Read replica setup + query routing | 3h | High | DevOps |
| Audit log partitioning | 4h | Medium | Backend |
| Add request compression (gzip/brotli) | 1h | Medium | Backend |
| CDN for static exports | 2h | Low | DevOps |

### Phase 4 (Month 1)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Implement caching for all read endpoints | 3h | High | Backend |
| Response payload optimization | 2h | Medium | Backend |
| WebSocket connection pooling | 2h | Medium | Backend |
| Benchmark verification (repeat all tests) | 4h | High | QA/DevOps |

## 7. Expected Improvements After Optimization

| Endpoint | Before (P95) | After (P95) | Improvement |
|----------|-------------|-------------|-------------|
| Dashboard Stats | 1,800ms | 100ms | 95% |
| Schedule Export | 3,500ms | 400ms (background) | 89% |
| Analytics | 2,500ms | 500ms | 80% |
| Schedules List | 450ms | 120ms | 73% |
| Personnel List | 280ms | 90ms | 68% |
| Notifications | 180ms | 70ms | 61% |
| System P95 (5000 users) | 1,800ms | 600ms | 67% |
| System P99 (5000 users) | 3,500ms | 1,200ms | 66% |
