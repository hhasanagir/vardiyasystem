-- v18: Extend tenant isolation to Assignment, Personnel, SwapRequest
-- These models previously had no organizationId, so the tenant middleware
-- skipped them (TENANT_MODELS filter excluded them because they lacked the
-- column). Add nullable organizationId + backfill + index + FK.

-- AlterTable: assignments.organizationId
ALTER TABLE "assignments" ADD COLUMN "organizationId" TEXT;

-- Backfill assignments.organizationId from Schedule.organizationId
UPDATE "assignments" a SET "organizationId" = s."organizationId"
FROM "schedules" s
WHERE a."scheduleId" = s."id" AND s."organizationId" IS NOT NULL;

CREATE INDEX "assignments_organizationId_idx" ON "assignments"("organizationId");

-- AlterTable: personnel.organizationId
ALTER TABLE "personnel" ADD COLUMN "organizationId" TEXT;

-- Backfill personnel.organizationId from Unit.organizationId
UPDATE "personnel" p SET "organizationId" = u."organizationId"
FROM "units" u
WHERE p."unitId" = u."id" AND u."organizationId" IS NOT NULL;

CREATE INDEX "personnel_organizationId_idx" ON "personnel"("organizationId");

-- AlterTable: swap_requests.organizationId
ALTER TABLE "swap_requests" ADD COLUMN "organizationId" TEXT;

-- Backfill swap_requests.organizationId from requester's personnel.organizationId
UPDATE "swap_requests" sr SET "organizationId" = p."organizationId"
FROM "personnel" p
WHERE sr."requesterId" = p."id" AND p."organizationId" IS NOT NULL;

CREATE INDEX "swap_requests_organizationId_idx" ON "swap_requests"("organizationId");

-- ForeignKeys
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
