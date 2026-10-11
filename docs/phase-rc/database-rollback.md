# Database rollback runbook (defect D19)

Migration analysis (D19) found no rollback path at all: no inverse migrations, no
compensating scripts, and no documented procedure. Prisma has no `migrate down`.
This runbook is that procedure. It is **fails-closed**: every destructive change
must clear the snapshot gate before it reaches a populated database.

## What is already guaranteed

- **Each migration file is atomic.** `prisma migrate deploy` wraps every
  migration in a transaction, so a migration that fails leaves **no partial
  state**. Verified after the D15 failure: `auth_attempts` kept its original
  columns, both FKs were intact, all 15 indexes survived and all 9 rows were
  present. A failed deploy is safe to fix and re-run; it is not a rollback.
- **Backups exist.** `scripts/backup-db.sh` writes a `gzip`-wrapped custom dump
  (`pg_dump --format=custom` then `gzip -f`), verified by
  `scripts/verify-backup.sh` and restored with `scripts/restore-db.sh`
  (`gunzip -c | pg_restore`). This is the exact framing the release
  `Integration Test` round-trips.

## Required procedure before any migration against a populated database

1. **Snapshot.**
   `scripts/backup-db.sh <backup-dir>` (or the `backup-cron` sidecar). This
   produces `<backup-dir>/latest.sql.gz`.
2. **Verify the snapshot (not optional).**
   `scripts/verify-backup.sh <backup-dir>/latest.sql.gz`. A snapshot that has
   not been restored is not a rollback point. The verify step rewrites into a
   scratch database and fails on any `pg_restore` error.
3. **Record the migration set.** Note `migrate status` output and the current
   `_prisma_migrations` tail so the applied set is known.
4. **Apply and verify.**
   `npx prisma migrate deploy` then the application smoke (`/health/ready`,
   one read/write round trip).
5. **If it fails at runtime (not at apply), roll back with the snapshot:**
   `scripts/restore-db.sh <backup-dir>/latest.sql.gz` into a scratch database
   first, confirm, then repoint. Restoring over live data is a last resort.

## Compensating scripts for destructive migrations

Prisma marks a migration applied; `migrate resolve --rolled-back <name>` only
lets it be re-run — it does **not** undo SQL. For every destructive migration, a
compensating script must exist under `backend/prisma/rollback/` and be executed
**manually, after restoring into a scratch database**, before touching
production.

Naming: `backend/prisma/rollback/<migration-name>.down.sql`.

A compensating script must be written against the **snapshot**, never invented:

```sql
-- Rollback for <migration-name>.
-- Preconditions: a verified snapshot from before <migration-name> is restored
-- into a scratch database. This script assumes that snapshot, not live data.
BEGIN;

-- Example: re-add a column that was dropped, from the snapshot.
-- ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
-- UPDATE "audit_logs" a SET "reason" = s."reason"
--   FROM snapshot_audit_logs s WHERE s.id = a.id;

-- Restore enum vocabularies, rows, constraints and indexes the migration removed.
COMMIT;
```

Do **not** re-add a dropped column empty to "undo" it — that implies the data is
recoverable when it is not (this is the D17 rule).

## Dispositions driven by this runbook

- **D17** (`20260618000001_v5_enterprise_audit_system` drops
  `audit_logs.sessionId/reason/comment`): dispositioned as an **accepted
  compliance decision** made before any populated production database existed,
  so no snapshot-based compensation is required. If a populated database ever
  needs the fields, they are reintroduced as new columns and backfilled from a
  verified snapshot. The migration now says this inline instead of dropping
  silently.
- **D15 / D16** (destructive `rename`/enum casts): fixed in the migration
  itself (`fix/migration-safety`) rather than papered over with a rollback, which
  is the correct action before the migration reaches a populated database.
