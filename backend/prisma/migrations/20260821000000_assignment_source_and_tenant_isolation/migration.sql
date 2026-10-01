-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('manual', 'auto_generated', 'override', 'swap', 'template', 'import');

-- AlterTable: Add source/override tracking columns to assignments
ALTER TABLE "assignments"
  ADD COLUMN "source" "AssignmentSource" NOT NULL DEFAULT 'manual',
  ADD COLUMN "overrideReason" TEXT,
  ADD COLUMN "overriddenBy" TEXT,
  ADD COLUMN "overriddenAt" TIMESTAMP(3);

-- AlterTable: Add organizationId to schedules for multi-tenant isolation
ALTER TABLE "schedules"
  ADD COLUMN "organizationId" TEXT;

-- Index
CREATE INDEX "assignments_source_idx" ON "assignments"("source");
CREATE INDEX "schedules_organizationId_idx" ON "schedules"("organizationId");

-- Backfill organizationId from Unit
UPDATE "schedules" s SET "organizationId" = u."organizationId"
FROM "units" u WHERE s."unitId" = u."id" AND u."organizationId" IS NOT NULL;

-- ForeignKey: schedules.organizationId → organizations.id
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
