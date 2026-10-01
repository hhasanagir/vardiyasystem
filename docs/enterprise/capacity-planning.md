# VardiyaOS — Capacity Planning

## Current Baseline (500 Users)

| Resource          | Usage     | Limit     | Utilization |
| ----------------- | --------- | --------- | ----------- |
| Backend CPU       | 0.2 cores | 1 core    | 20%         |
| Backend Memory    | 120 MB    | 512 MB    | 23%         |
| PostgreSQL CPU    | 0.1 cores | 1 core    | 10%         |
| PostgreSQL Memory | 64 MB     | 512 MB    | 12.5%       |
| Redis Memory      | 8 MB      | 128 MB    | 6%          |
| API Throughput    | 5 req/s   | 200 req/s | 2.5%        |

## Projected for 5000 Users

| Resource               | Current   | Projected (5000) | Recommended                  |
| ---------------------- | --------- | ---------------- | ---------------------------- |
| Backend CPU            | 0.2 cores | 2 cores          | 4 cores (2 pods × 2 cores)   |
| Backend Memory         | 120 MB    | 1.2 GB           | 2 GB (2 pods × 1 GB)         |
| PostgreSQL CPU         | 0.1 cores | 1 core           | 2 cores                      |
| PostgreSQL Memory      | 64 MB     | 640 MB           | 2 GB                         |
| PostgreSQL Connections | 2-3       | 20-40            | PgBouncer: 50 max            |
| Redis Memory           | 8 MB      | 80 MB            | 512 MB                       |
| Storage (DB)           | 500 MB    | 5 GB             | 10 GB                        |
| Storage (Backups)      | 500 MB    | 5 GB             | 30 GB (30-day retention)     |
| Storage (Logs)         | 100 MB    | 1 GB             | 10 GB (3 files × 10 MB each) |
| API Throughput         | 5 req/s   | 50 req/s         | 200 req/s (rate limit)       |

## Scaling Triggers

| Condition                   | Action                                       |
| --------------------------- | -------------------------------------------- |
| CPU > 70% for 5 min         | Scale backend pods +1 (max 6)                |
| Memory > 80% for 5 min      | Scale backend pods +1 (max 6)                |
| PgBouncer connections > 80% | Increase pool size or add PgBouncer instance |
| API latency p99 > 2s        | Investigate queries, add indexes, scale      |
| Error rate > 5%             | Investigate, rollback if recent deploy       |
| Disk usage > 80%            | Clean old backups, increase PV size          |
| Redis memory > 80%          | Increase maxmemory, add Redis cluster        |

## Vertical Scaling Limits (Single Host)

| Component  | Max Before Needing Horizontal Scale |
| ---------- | ----------------------------------- |
| Backend    | 2 cores / 1 GB RAM per instance     |
| PostgreSQL | 4 cores / 4 GB RAM                  |
| Redis      | 1 core / 512 MB RAM                 |

## Cost Projection (Monthly)

| Resource                   | Single Host | K8s (3 nodes) | Cloud (AWS) |
| -------------------------- | ----------- | ------------- | ----------- |
| Compute                    | $50         | $150          | $200        |
| Storage (100 GB)           | $0          | $0            | $10         |
| Database (RDS)             | N/A         | N/A           | $50         |
| CDN                        | $0          | $0            | $10         |
| Monitoring (Grafana Cloud) | $0          | $0            | $30         |
| **Total**                  | **~$50**    | **~$150**     | **~$300**   |

## Monitoring Thresholds

Configure these in Prometheus AlertManager:

```yaml
# CPU saturation
- alert: BackendCPUSaturation
  expr: rate(process_cpu_seconds_total[5m]) > 0.8
  for: 5m

# Memory threshold
- alert: BackendMemoryHigh
  expr: process_resident_memory_bytes / 512e6 > 0.8
  for: 5m

# Connection pool pressure
- alert: PgBouncerPoolExhaustion
  expr: pgbouncer_pools_client_active_connections / pgbouncer_pools_client_max_connections > 0.8
  for: 2m

# Disk prediction
- alert: DiskFillingUp
  expr: predict_linear(node_filesystem_avail_bytes[6h], 86400) < 0
  for: 1h
```
