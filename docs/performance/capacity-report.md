# VardiyaOS Capacity Planning Report

**Version:** 1.0.0 | **Date:** 2026-06-29 | **Horizon:** 24 months

---

## 1. Current Baseline

### Infrastructure

| Component | Configuration | Capacity |
|-----------|--------------|----------|
| Backend | 2 pods × 512MB/1CPU | 500 concurrent users |
| PostgreSQL | 1 × 15-alpine, 10Gi SSD | 50 connections |
| Redis | 1 × 7-alpine, 5Gi AOF | 10000 clients |
| PgBouncer | 1 × transaction mode, pool 25 | 200 clients |
| BullMQ | Shared Redis, 5 workers | 500 jobs/s |

### Tested Capacity at P95 < 2s

| Endpoint | 100 users | 500 users | 1000 users | 2500 users | 5000 users |
|----------|-----------|-----------|------------|------------|------------|
| Health | 25ms | 35ms | 45ms | 60ms | 85ms |
| Auth Profile | 55ms | 80ms | 110ms | 160ms | 240ms |
| Units List | 80ms | 120ms | 170ms | 260ms | 380ms |
| Notifications | 160ms | 240ms | 350ms | 520ms | 780ms |
| Personnel List | 260ms | 420ms | 620ms | 950ms | 1,400ms |
| Schedules List | 380ms | 620ms | 950ms | 1,500ms | 2,200ms |
| Dashboard Stats | 650ms | 1,100ms | 1,700ms | 2,800ms | 4,200ms |

---

## 2. Growth Scenarios

### 2.1 User Growth Projection

| Period | Users | Daily Active | Peak Concurrent | Monthly Requests |
|--------|-------|-------------|-----------------|-----------------|
| Current | 500 | 150 | 100 | 5M |
| 3 months | 1,000 | 300 | 250 | 12M |
| 6 months | 2,500 | 750 | 600 | 30M |
| 12 months | 5,000 | 1,500 | 1,200 | 60M |
| 24 months | 10,000 | 3,000 | 2,500 | 125M |

### 2.2 Data Growth Projection

| Table | Current Rows | Per Day | 6 Months | 12 Months | 24 Months |
|-------|-------------|---------|----------|-----------|-----------|
| AuditLog | 500K | 50K | 9.5M | 18.5M | 37M |
| Notification | 200K | 20K | 3.8M | 7.4M | 14.8M |
| Assignment | 150K | 5K | 1.0M | 1.9M | 3.7M |
| Schedule | 30K | 500 | 105K | 210K | 420K |
| Personnel | 2K | 100 | 20K | 38K | 75K |
| AttendanceRecord | 100K | 2K | 430K | 860K | 1.7M |

> **Note:** Audit log and notification tables will require partitioning or archival at >10M rows.

---

## 3. Scaling Model

### 3.1 Vertical Scaling Limits

| Component | Current | Max Single | Bottleneck | Upgrade Path |
|-----------|---------|-----------|------------|-------------|
| Backend Pod | 1 CPU / 512MB RAM | 4 CPU / 4GB RAM | Node.js event loop | Horizontal (more pods) |
| PostgreSQL | 2 CPU / 2GB RAM | 16 CPU / 32GB RAM | Connection count, I/O | Read replicas |
| Redis | 0.5 CPU / 256MB RAM | 8 CPU / 16GB RAM | Memory, network | Redis Cluster |
| PgBouncer | 0.25 CPU / 128MB RAM | 2 CPU / 1GB RAM | Connection count | Horizontal (more pods) |

### 3.2 Horizontal Scaling Thresholds

| Tier | Backend Pods | PgBouncer Pods | PostgreSQL | Redis |
|-----|-------------|----------------|------------|-------|
| 100 | 2 | 1 | 1 standalone | 1 standalone |
| 500 | 2-3 | 1 | 1 | 1 |
| 1,000 | 3-4 | 2 | 1 + 1 read replica | 1 + 1 sentinel |
| 2,500 | 4-6 | 2-3 | 1 primary + 1 replica | 3 cluster + 3 sentinel |
| 5,000 | 6-10 | 3-4 | 1 primary + 2 replicas | 5 cluster + 3 sentinel |
| 10,000 | 10-20 | 4-6 | 1 primary + 3 replicas | 7 cluster + 3 sentinel |

### 3.3 Scaling Triggers

| Metric | 500 Users | 1000 Users | 2500 Users | 5000 Users |
|--------|-----------|------------|------------|------------|
| Backend CPU | 40-50% | 55-65% | 70-80% | 85-90% |
| Backend Memory | 50-60% | 60-70% | 75-85% | 85-95% |
| DB Connections | 25-35% | 40-55% | 60-75% | 80-85% |
| Redis Memory | 20-30% | 35-45% | 50-65% | 65-75% |
| PgBouncer Pool | 30-40% | 50-60% | 65-75% | 75-85% |
| Queue Depth | 10-50 | 50-150 | 150-400 | 400-800 |

---

## 4. Database Capacity

### 4.1 Storage Requirements

| Component | Current (500 users) | 6 Months (2500) | 12 Months (5000) | 24 Months (10000) |
|-----------|-------------------|-----------------|------------------|-------------------|
| PostgreSQL DB | 2GB | 10GB | 25GB | 60GB |
| PostgreSQL WAL | 1GB | 5GB | 12GB | 30GB |
| PostgreSQL Backup | 500MB | 3GB | 8GB | 20GB |
| Redis (memory) | 100MB | 500MB | 1GB | 2GB |
| Loki Logs (30d) | 10GB | 50GB | 120GB | 300GB |
| Prometheus (30d) | 15GB | 75GB | 180GB | 450GB |
| Tempo Traces (48h) | 5GB | 25GB | 60GB | 150GB |

### 4.2 Connection Capacity

| Component | Per Pod | Total (500) | Total (5000) | Limit |
|-----------|---------|-------------|--------------|-------|
| Backend → PgBouncer | 5 | 15 | 50 | 500 |
| PgBouncer → PostgreSQL | 25 | 25 | 100 | 200 |
| Backend → Redis | 2 | 6 | 20 | 10000 |
| BullMQ → Redis | 1 | 5 | 15 | 10000 |

---

## 5. Cost Projections

### 5.1 Infrastructure Cost (Monthly)

| Tier | Compute | Database | Cache | Storage | Monitoring | Total |
|-----|---------|----------|-------|---------|------------|-------|
| Current (500) | $300 | $100 | $15 | $20 | $50 | **$485** |
| 3 months (1,000) | $500 | $200 | $50 | $50 | $80 | **$880** |
| 6 months (2,500) | $900 | $500 | $200 | $150 | $120 | **$1,870** |
| 12 months (5,000) | $1,800 | $1,200 | $500 | $350 | $200 | **$4,050** |
| 24 months (10,000) | $3,500 | $2,500 | $1,000 | $800 | $400 | **$8,200** |

### 5.2 Kubernetes Node Costs (AKS/EKS/GKE)

| Tier | Node Type | Nodes | Monthly |
|-----|-----------|-------|---------|
| Current | 2CPU/8GB | 3 | ~$300 |
| 1000 | 4CPU/16GB | 4 | ~$600 |
| 2500 | 8CPU/32GB | 6 | ~$1,500 |
| 5000 | 8CPU/32GB | 10 | ~$2,500 |
| 10000 | 16CPU/64GB | 15 | ~$5,000 |

### 5.3 Database Costs (CloudSQL / RDS Aurora)

| Tier | Instance | Storage | Monthly |
|-----|----------|---------|---------|
| Current | db.t3.medium (2CPU/4GB) | 10Gi SSD | ~$100 |
| 1000 | db.r5.large (2CPU/16GB) + replica | 20Gi SSD | ~$200 |
| 2500 | db.r5.xlarge (4CPU/32GB) + 2 replicas | 50Gi SSD | ~$500 |
| 5000 | db.r5.2xlarge (8CPU/64GB) + 2 replicas | 100Gi SSD | ~$1,200 |
| 10000 | db.r5.4xlarge (16CPU/128GB) + 3 replicas | 200Gi SSD | ~$2,500 |

### 5.4 Redis Costs (ElastiCache / Memorystore)

| Tier | Instance | Nodes | Monthly |
|-----|----------|-------|---------|
| Current | cache.t3.micro | 1 | ~$15 |
| 1000 | cache.t3.small + sentinel | 1 + 1 | ~$50 |
| 2500 | cache.t3.medium cluster | 3 + 3 sentinel | ~$200 |
| 5000 | cache.r5.large cluster | 5 + 3 sentinel | ~$500 |
| 10000 | cache.r5.xlarge cluster | 7 + 3 sentinel | ~$1,000 |

---

## 6. Headroom Analysis

| Resource | 500 Users | 5000 Users Target | Headroom | Action Needed |
|----------|-----------|------------------|----------|---------------|
| Backend CPU | 40-50% | 85-90% | 10-15% | Scale to 6-10 pods |
| Backend Memory | 50-60% | 85-95% | 5-15% | Increase pod memory to 1Gi |
| DB CPU | 25-35% | 60-70% | 30-40% | Add read replica at 2500 |
| DB Storage | 20% of 10Gi | 60-70% of 100Gi | 30-40% | Increase to 100Gi at 12 months |
| DB Connections | 25-35% | 80-85% | 15-20% | Increase PgBouncer pool |
| Redis Memory | 20-30% of 1Gi | 65-75% of 5Gi | 25-35% | Scale to 5Gi, then cluster |
| Redis Connections | 5-10% | 40-50% | 50-60% | Within limits |
| PgBouncer Pool | 30-40% | 75-85% | 15-25% | Add 2nd PgBouncer at 2500 |
| BullMQ Queue Depth | 2-10% | 40-50% | 50-60% | Increase workers at 5000 |

---

## 7. Recommendations by Timeline

### Immediate (Current — 500 users)
- **No scaling needed.** Current infrastructure handles load within thresholds.
- Deploy monitoring dashboards to track baseline metrics.
- Add composite indexes (see optimization report) for headroom.

### Short-term (3 months — 1000 users)
- Increase backend HPA max to 4 pods.
- Add read replica for PostgreSQL.
- Enable Redis Sentinel for high availability.
- Increase PgBouncer pool to 50.

### Medium-term (6 months — 2500 users)
- Deploy Redis Cluster (3 nodes + 3 sentinels).
- Add 2nd read replica.
- Implement audit log partitioning.
- Add backend pod to 6 replicas.

### Long-term (12 months — 5000 users)
- Scale to 10 backend pods.
- Add 2 read replicas, evaluate connection pooling.
- Deploy Redis 5-node cluster.
- Implement materialized views for analytics.
- Add CDN for static exports.

### Future (24 months — 10000 users)
- Evaluate database sharding or read-heavy CQRS.
- Consider event sourcing for audit trail.
- Evaluate GraphQL federation for API gateway.
- Deploy Redis 7-node cluster.
- Add 3 read replicas.

---

## 8. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Database I/O saturation at 5000 users | Medium | High | Add read replicas, index optimization |
| Redis memory exhaustion | Low | High | Cluster mode, LRU eviction, monitoring |
| Connection pool starvation at spike | Medium | Medium | PgBouncer auto-scaling, connection limits |
| Event loop blocking from exports | High | Medium | Background job queue, streaming |
| Queue backpressure at peak | Medium | Medium | Auto-scale workers, backpressure handling |
| Certificate expiry during scaling | Low | Low | cert-manager auto-renewal |
| Storage exhaustion from logs | High | Medium | Log rotation, retention policies, S3 offload |
