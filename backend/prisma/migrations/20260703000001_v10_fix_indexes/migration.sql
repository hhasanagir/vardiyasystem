-- V10: Fix index definitions to match schema.prisma
-- v2 created partial unique indexes (WHERE ... IS NOT NULL),
-- but schema.prisma @@unique generates non-partial unique indexes.
-- v8's IF NOT EXISTS skips because the index names already exist.
-- This migration drops the partial indexes and recreates them
-- as non-partial to match schema.prisma expectations.

DROP INDEX IF EXISTS "personnel_email_key";
CREATE UNIQUE INDEX "personnel_email_key" ON "personnel"("email");

DROP INDEX IF EXISTS "personnel_employeeNo_key";
CREATE UNIQUE INDEX "personnel_employeeNo_key" ON "personnel"("employeeNo");
