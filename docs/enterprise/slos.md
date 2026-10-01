# VardiyaOS — Service Level Objectives

## SLI Definitions

| Indicator      | Definition                              | Measurement                                                                              |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Availability   | % of successful HTTP requests (non-5xx) | `sum(rate(http_requests_total{status!~"5.."}[1m])) / sum(rate(http_requests_total[1m]))` |
| Latency (p50)  | Median response time                    | `histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))`               |
| Latency (p95)  | 95th percentile response time           | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`               |
| Latency (p99)  | 99th percentile response time           | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`               |
| Error Rate     | % of 5xx responses                      | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`           |
| Throughput     | Requests per second                     | `sum(rate(http_requests_total[1m]))`                                                     |
| DB Connections | Active PostgreSQL connections           | `pg_stat_database_numbackends`                                                           |
| Queue Depth    | BullMQ jobs waiting                     | `bullmq_queue_waiting`                                                                   |

## SLO Targets

| Tier                                    | Availability | Latency p99 | Error Rate | Measurement Window |
| --------------------------------------- | ------------ | ----------- | ---------- | ------------------ |
| **Critical** (auth, schedule CRUD)      | 99.99%       | <1s         | <0.1%      | 30 days            |
| **Normal** (list queries, search)       | 99.9%        | <3s         | <0.5%      | 30 days            |
| **Background** (notifications, reports) | 99.5%        | <10s        | <1%        | 30 days            |

## Error Budgets

| Tier       | Budget (30d)  | Burn Rate Warning | Burn Rate Critical |
| ---------- | ------------- | ----------------- | ------------------ |
| Critical   | 4.3m downtime | 0.5% / week       | 1% / day           |
| Normal     | 43m downtime  | 1% / week         | 2% / day           |
| Background | 3.6h downtime | 2% / week         | 5% / day           |

Burn rate alerts fire when budget consumption exceeds warning/critical thresholds within the time window. AlertManager rules trigger based on these burn rates.

## Quarterly Review

SLOs are reviewed quarterly. Changes require approval from:

- Engineering Lead
- Operations Lead
- Product Owner (for user-facing changes)
