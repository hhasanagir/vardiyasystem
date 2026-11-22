-- Backfill the tenant column on rows that were written by callers without an
-- organization (e.g. a system_admin whose user row has organizationId = NULL).
--
-- The Prisma tenant middleware injects `organizationId` into reads and writes
-- ONLY while a tenant context is active, and it skips `upsert`. Rows created
-- without a tenant are therefore invisible to every tenant-scoped reader
-- (filtered out as "not found") even though they belong to a real unit.
--
-- The owning organization is derived from the unit (server-side data), and the
-- statements are idempotent: they only touch rows where the column is NULL and
-- the unit has an organization.

UPDATE "schedules" AS s
SET "organizationId" = u."organizationId"
FROM "units" AS u
WHERE s."unitId" = u."id"
  AND s."organizationId" IS NULL
  AND u."organizationId" IS NOT NULL;

UPDATE "assignments" AS a
SET "organizationId" = s."organizationId"
FROM "schedules" AS s
WHERE a."scheduleId" = s."id"
  AND a."organizationId" IS NULL
  AND s."organizationId" IS NOT NULL;

UPDATE "personnel" AS p
SET "organizationId" = u."organizationId"
FROM "units" AS u
WHERE p."unitId" = u."id"
  AND p."organizationId" IS NULL
  AND u."organizationId" IS NOT NULL;

UPDATE "devices" AS d
SET "organizationId" = u."organizationId"
FROM "units" AS u
WHERE d."unitId" = u."id"
  AND d."organizationId" IS NULL
  AND u."organizationId" IS NOT NULL;
