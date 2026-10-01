# VardiyaOS — On-Call Guide

## Quick Start

### Before Your Shift

1. Verify you have access to:
   - Grafana (http://localhost:3001 or https://grafana.vardiya.internal)
   - Prometheus (http://localhost:9090)
   - Loki (http://localhost:3100)
   - Docker logs: `docker logs <container>`
   - K8s: `kubectl logs -n vardiya <pod>`
   - Production server SSH/K8s access
   - Slack channels: #alerts, #alerts-critical, #incident-\*
   - PagerDuty/OpsGenie login (if configured)

2. Check current open incidents and alerts

3. Verify all services are healthy:
   - `curl http://localhost:3000/api/v1/health`
   - `curl http://localhost:3000/api/v1/health/dashboard`

### Common Alert Responses

#### Backend Down

```bash
docker ps | grep vardiya-backend
docker logs vardiya-backend --tail 50
docker restart vardiya-backend
```

If crash-looping: `docker logs vardiya-backend --tail 200` and look for OOM or startup errors.

#### High Error Rate

1. Check Grafana dashboard → API Error Rate panel
2. Check logs: `docker logs vardiya-backend --tail 100 | grep ERROR`
3. Check Loki: `{container="vardiya-backend"} |= "error"`
4. Check if recent deploy caused regression → rollback

#### Database Alert

```bash
docker exec vardiya-postgres pg_isready -U vardiya
docker logs vardiya-pgbouncer --tail 30
psql -h localhost -U vardiya -d vardiyasystem -c "SELECT count(*) FROM pg_stat_activity;"
```

#### High Memory/Latency

1. Check resource usage: `docker stats`
2. Restart backend: `docker restart vardiya-backend`
3. If recurring, scale up: adjust `ecosystem.config.js` instances or K8s HPA min

### Escalation Criteria

- No progress in 30 minutes → escalate to Engineering Lead
- User data at risk → escalate immediately
- Third-party service failure (AWS, GitHub, Docker Hub) → check status page, escalate
- Security incident → escalate to CTO + Security Lead

## Runbook Index

| Condition               | Runbook                                       |
| ----------------------- | --------------------------------------------- |
| Alert firing            | docs/enterprise/incident-response.md          |
| Need to rollback        | docs/devops/rollback.md                       |
| Need to deploy          | docs/devops/deployment.md                     |
| Database corruption     | docs/enterprise/dr-runbook.md                 |
| Need to restore backup  | docs/devops/dr-runbook.md → Restore Procedure |
| Performance degradation | Grafana → Performance Dashboard               |
