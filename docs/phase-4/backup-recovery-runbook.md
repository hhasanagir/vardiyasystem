# VardiyaOS — Backup & Recovery Runbook

**Phase:** 4 — Production Readiness
**Status:** Documentation Only

---

## 1. Database Backup Strategy

### Automated Backups

| Type                       | Frequency    | Retention | Storage         |
| -------------------------- | ------------ | --------- | --------------- |
| Full pg_dump               | Daily 02:00  | 30 days   | Off-site        |
| WAL archiving (continuous) | Real-time    | 7 days    | Separate volume |
| Schema-only backup         | On migration | Permanent | Git             |

### Manual Backup Commands

```bash
# Full backup
pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# Schema only (for migration review)
pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem --schema-only -f schema_$(date +%Y%m%d).sql

# Single table
pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -t schedules -t assignments -F c -f schedules_backup.dump
```

### Restore Commands

```bash
# Full restore
pg_restore -h $DB_HOST -U $DB_USER -d vardiyasystem --clean --if-exists backup.dump

# Selective restore (specific tables)
pg_restore -h $DB_HOST -U $DB_USER -d vardiyasystem -t schedules -t assignments backup.dump

# Point-in-time recovery (requires WAL archiving)
pg_ctl -D /var/lib/postgresql/data restore
# Configure recovery.conf / postgresql.conf for PITR
```

---

## 2. Migration Rollback

### Safe Rollback Process

```bash
# 1. Review the migration
cat prisma/migrations/YYYYMMDDHHMMSS_migration_name/migration.sql

# 2. Create backup BEFORE rollback
pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -F c -f pre_rollback_$(date +%Y%m%d).dump

# 3. Generate rollback migration
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script

# 4. Apply rollback (manually reviewed)
psql -h $DB_HOST -U $DB_USER -d vardiyasystem -f rollback.sql

# 5. Revert the migration record
npx prisma migrate resolve --rolled-back YYYYMMDDHHMMSS_migration_name
```

### Rollback Rules

- Never drop a table without explicit approval from DBA
- Never delete data during rollback — use soft delete
- Always verify foreign key constraints before rollback
- Test rollback on staging before production

---

## 3. Data Retention

| Data Category             | Retention Period                  | Action                    |
| ------------------------- | --------------------------------- | ------------------------- |
| **Audit logs**            | 2 years (LEGAL_POLICY_REQUIRED)   | Archive then delete       |
| **Security events**       | 2 years (LEGAL_POLICY_REQUIRED)   | Archive then delete       |
| **Active sessions**       | 7 days inactive                   | Auto-expire (Redis TTL)   |
| **Published schedules**   | Permanent (for compliance)        | Archive to cold storage   |
| **Draft schedules**       | 90 days after last modification   | Soft delete               |
| **Schedule versions**     | 1 year after rollback             | Archive                   |
| **Job queue results**     | 24 hours completed, 7 days failed | Auto-cleanup              |
| **Dead letter queue**     | 30 days                           | Manual review then delete |
| **Refresh tokens**        | 30 days                           | Auto-expire               |
| **Password reset tokens** | 1 hour                            | Auto-expire               |
| **Device incidents**      | 5 years                           | Archive                   |
| **Training records**      | Duration of employment + 1 year   | Archive                   |
| **Export files**          | 7 days                            | Auto-delete               |

### Retention Enforcement

```bash
# Scheduled cleanup (add to cron)
# Audit logs older than 2 years
psql -c "DELETE FROM audit_logs WHERE \"createdAt\" < NOW() - INTERVAL '2 years'"

# Failed jobs older than 7 days
# Handled by BullMQ: removeOnFail: { age: 86400 } (1 day)
```

---

## 4. Recovery Procedures

### Scenario: Database Failure

1. Check health endpoint: `GET /api/v1/health/ready`
2. If `database: failing`, verify PostgreSQL service
3. If data corruption suspected:
   - Stop application
   - Take pg_dump of current state
   - Restore from latest backup
   - Replay WAL if available
4. Run `npx prisma db push` to verify schema consistency
5. Restart application

### Scenario: Redis Failure

1. Check `GET /api/v1/health/ready` — `redis` check
2. If Redis is down:
   - Rate limiting falls back to in-memory (already configured)
   - BullMQ jobs pause (will resume when Redis recovers)
   - Session/JWT cache miss → DB fallback
3. Restart Redis: `systemctl restart redis`
4. Verify BullMQ consumers reconnect automatically

### Scenario: Worker Crash During Generation

1. Jobs in `RUNNING` state will be retried (3 attempts, exponential backoff)
2. Failed jobs move to `FAILED` status after all retries
3. Published schedules are NEVER modified by generation
4. DRAFT schedules remain in DRAFT on failure (transaction rollback)
5. Manual intervention: check `GET /api/v1/schedules-ddd/jobs/:jobId`

### Scenario: Partial State Corruption

1. Detect via health monitoring metrics
2. Stop writes (disable non-critical endpoints)
3. Identify last known good state via audit log timestamps
4. Restore from backup or use schedule version snapshots
5. Verify integrity: `npx prisma db execute --stdin < verify_integrity.sql`

---

## 5. Monitoring & Alerting

| Alert                         | Condition                          | Action                         |
| ----------------------------- | ---------------------------------- | ------------------------------ |
| Backup failed                 | `backup.status == 'failed'`        | Check storage, re-run manually |
| WAL gap                       | `pg_stat_replication` lag > 100MB  | Check replication slots        |
| DB connection pool exhaustion | Active connections > 80% pool size | Scale or investigate leaks     |
| Disk usage > 80%              | `df -h` on data volume             | Archive old data, expand disk  |

---

## 6. Runbook Verification Checklist

- [ ] Automated backup tested (restore to test DB)
- [ ] Migration rollback tested on staging
- [ ] Point-in-time recovery tested
- [ ] Redis failover tested
- [ ] Job retry behavior verified
- [ ] Data retention cron jobs configured
- [ ] Alert notifications reaching on-call team
- [ ] Recovery time objective (RTO) measured: < 30 minutes
- [ ] Recovery point objective (RPO) measured: < 1 hour (WAL-based)
