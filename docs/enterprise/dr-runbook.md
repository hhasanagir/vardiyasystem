# VardiyaOS — Disaster Recovery Runbook

## RTO/RPO Targets

| Metric               | Target     | Current Capability      |
| -------------------- | ---------- | ----------------------- |
| RTO (Recovery Time)  | 15 minutes | 1 hour (backup restore) |
| RPO (Recovery Point) | 5 minutes  | 24 hours (daily backup) |

## Disaster Scenarios

### 1. Database Corruption or Data Loss

**Symptoms**: Application errors, data inconsistencies, failed queries.

**Recovery Procedure**:

```bash
# 1. Stop the backend to prevent further writes
docker stop vardiya-backend

# 2. Identify the latest good backup
ls -la /backups/vardiya-*.sql.gz

# 3. Restore from backup
docker exec -it vardiya-backup-cron sh
# Inside container:
PGPASSWORD=$(cat /run/secrets/db_password) pg_restore -h postgres -U vardiya -d vardiyasystem --clean --if-exists /backups/latest.sql.gz

# 4. Verify data integrity
docker exec vardiya-postgres psql -U vardiya -d vardiyasystem -c "SELECT count(*) FROM users;"
docker exec vardiya-postgres psql -U vardiya -d vardiyasystem -c "SELECT count(*) FROM schedules;"

# 5. Restart backend
docker start vardiya-backend

# 6. Verify health
curl http://localhost:3000/api/v1/health/dashboard
```

### 2. Complete Server Failure

**Recovery Procedure**:

```bash
# 1. Provision new server (bare metal or cloud VM)
# 2. Install Docker + Docker Compose
# 3. Clone repository
git clone https://github.com/anomalyco/vardiyasystem.git
cd vardiyasystem

# 4. Restore secrets from vault or secure backup
# 5. Restore database from offsite backup
aws s3 cp s3://vardiya-backups/production/latest.sql.gz ./backups/
docker compose -f docker-compose.prod.yml up -d postgres
# Wait for postgres healthy, then:
gunzip -c ./backups/latest.sql.gz | docker exec -i vardiya-postgres psql -U vardiya -d vardiyasystem

# 6. Start all services
docker compose -f docker-compose.prod.yml up -d

# 7. Run startup verification
docker compose -f docker-compose.prod.yml run startup-verifier
```

### 3. Kubernetes Cluster Failure

```bash
# 1. Apply manifests to new cluster
kubectl apply -k k8s/

# 2. Restore database PVC from backup
# (Create PVC first, then restore data to the PV)

# 3. Verify deployment
kubectl get all -n vardiya
kubectl rollout status deployment/vardiya-backend -n vardiya
```

### 4. Data Corruption (Point-in-Time Recovery)

**Prerequisite**: WAL archiving enabled.

```bash
# 1. Find the target recovery time
# 2. Restore base backup
pg_basebackup -h postgres -U vardiya -D /backup/base -P

# 3. Configure recovery.conf with target time
echo "restore_command = 'cp /wal_archive/%f %p'" > recovery.conf
echo "recovery_target_time = '2026-06-26 14:30:00 UTC'" >> recovery.conf

# 4. Start PostgreSQL in recovery mode
pg_ctl -D /backup/base start

# 5. Verify data at target point
# 6. If correct, promote: pg_ctl -D /backup/base promote
```

## Backup Verification (Weekly)

```bash
# Automated verification
docker exec vardiya-backup-cron sh /usr/local/bin/verify-backup.sh /backups/latest.sql.gz

# Manual integrity check
gunzip -t /backups/latest.sql.gz
pg_restore --list /backups/latest.sql.gz | head -20
```

## Offsite Backup (Daily)

```bash
# Upload to S3-compatible storage
aws s3 cp /backups/ s3://vardiya-backups/production/ --recursive

# Retention: 30 days local, 90 days offsite, 1 year monthly
```

## Recovery Drill Schedule

| Type                | Frequency | Description                                       |
| ------------------- | --------- | ------------------------------------------------- |
| Backup restore test | Weekly    | Restore latest backup to staging, verify data     |
| PITR test           | Monthly   | Test point-in-time recovery to specific timestamp |
| Full DR drill       | Quarterly | Complete server rebuild from scratch              |
| Chaos testing       | Quarterly | Kill random containers, verify recovery           |
