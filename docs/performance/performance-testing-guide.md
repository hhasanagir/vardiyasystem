# Performance Testing Guide

## Overview

This directory contains the complete performance engineering suite for VardiyaOS, covering load, stress, spike, and soak testing across 5 user tiers (100/500/1000/2500/5000).

## Test Types

| Test | File | Duration | Description |
|------|------|----------|-------------|
| Load | `scenarios/load-test.js` | ~35 min | 5 sequential tiers, ramping VUs, realistic endpoint mix |
| Stress | `scenarios/stress-test.js` | ~25 min | Ramping arrival rate from 10 to 1500 req/s until breaking |
| Spike | `scenarios/spike-test.js` | ~12 min | Instant bursts to 1K/2.5K/5K VUs in 10-30s + recovery |
| Soak | `scenarios/soak-test.js` | ~4h | Sustained: 100 VUs/30m, 500 VUs/1h, 1000 VUs/2h |
| Smoke | `load-test.js` | ~1 min | Quick validation (20 VUs, health check only) |

## Quick Start

```bash
# Prerequisites: k6 installed (https://k6.io/docs/getting-started/installation)
k6 version

# Smoke test (1min) - verify setup
k6 run k6/load-test.js -e BASE_URL=http://localhost:3000/api/v1

# Full load test (35min) - all 5 tiers
k6 run k6/scenarios/load-test.js -e BASE_URL=http://localhost:3000/api/v1

# Stress test (25min) - breaking point
k6 run k6/scenarios/stress-test.js -e BASE_URL=http://localhost:3000/api/v1

# Spike test (12min) - instant bursts
k6 run k6/scenarios/spike-test.js -e BASE_URL=http://localhost:3000/api/v1

# Soak test (4h) - overnight run
k6 run k6/scenarios/soak-test.js -e BASE_URL=http://localhost:3000/api/v1

# Run all tests with results export
pwsh k6/run-all.ps1 -BaseUrl http://localhost:3000/api/v1
```

## Running with Docker Compose

```bash
# Start monitoring stack
docker compose -f k6/docker-compose.k6.yml up -d

# Run tests with InfluxDB output
k6 run k6/scenarios/load-test.js --out influxdb=http://localhost:8086/k6

# Open Grafana at http://localhost:3002
# Login: admin/admin
# Dashboard: K6 Load Test Dashboard
```

## Architecture

```
k6/
  load-test.js              # Quick smoke test (1min)
  helpers.js                # Shared auth, metrics, thresholds
  run-all.ps1               # Orchestrator for all test types
  generate-reports.ps1      # Post-test report generation
  prometheus.yml             # Prometheus scrape config for k6
  docker-compose.k6.yml      # Monitoring stack (Prometheus + Grafana + InfluxDB)
  grafana-datasources/       # Datasource provisioning
  grafana-dashboards/        # K6 dashboard JSON
  scenarios/
    load-test.js             # 5-tier load test (100/500/1000/2500/5000)
    stress-test.js           # Ramp until breaking point
    spike-test.js            # Instant burst patterns
    soak-test.js             # Extended sustained load
  results/                   # Test output (JSON + summary)
    20260629_143000_load_test.json
    20260629_143000_load_test_summary.txt
```

## Metrics Collected

### HTTP-level
- `http_req_duration` - P50, P95, P99, max, avg
- `http_req_failed` - Error rate
- `http_reqs` - Throughput (requests/s)

### Endpoint-specific (custom)
- `auth_login_ms`, `auth_profile_ms`
- `schedules_list_ms`, `schedules_detail_ms`, `schedules_dashboard_ms`
- `personnel_list_ms`, `units_list_ms`, `devices_list_ms`
- `notifications_list_ms`, `swap_requests_list_ms`
- `attendance_today_ms`, `shift_tasks_list_ms`, `handover_notes_list_ms`
- `analytics_overview_ms`, `recommendations_list_ms`
- `health_live_ms`, `health_ready_ms`

### Resource-level (external)
- CPU, Memory, Disk I/O (via `kubectl top` / cloud metrics)
- Database connections, query duration (via `pg_stat_activity`)
- Redis memory, hit rate, connected clients (via `INFO`)
- BullMQ queue depth, job duration (via Prometheus metrics)

## Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| HTTP P95 | <2000ms | <4000ms |
| HTTP P99 | <5000ms | <8000ms |
| Error Rate | <1% | <3% |
| Health Check | <200ms P95 | <500ms P99 |
| Auth Login | <1500ms P95 | <3000ms P99 |
| Dashboard | <3000ms P95 | <5000ms P99 |
| Analytics | <3000ms P95 | <5000ms P99 |

## Reports

After running tests, generate reports:

```bash
pwsh k6/generate-reports.ps1
```

Outputs in `docs/performance/`:
- `performance-report.md` - Test results with endpoint breakdown
- `capacity-report.md` - Scaling projections and cost estimates
- `optimization-report.md` - Bottleneck detection and remediation

## Interpreting Results

### Load Test
- **PASS**: All thresholds met across all 5 tiers
- **WARN**: P95 >2000ms at >1000 users (investigate optimization)
- **FAIL**: Any threshold breached (blocking production)

### Stress Test
- Identify the breaking point (where error rate spikes or latencies diverge)
- Determine headroom: Breakpoint / Target Load should be >= 2x

### Spike Test
- Check recovery time (how fast system returns to normal after burst)
- Watch for connection pool exhaustion and rate limiting

### Soak Test
- Monitor for memory leaks (RAM growing over time)
- Watch for connection leaks (DB connections increasing)
- Check for queue buildup (BullMQ depth trending up)
