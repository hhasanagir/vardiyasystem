-- V5: Enterprise Audit Logging System
-- Renames columns, adds new fields for compliance, drops deprecated columns

-- Rename existing columns to new naming convention
ALTER TABLE "audit_logs" RENAME COLUMN "action" TO "actionType";
ALTER TABLE "audit_logs" RENAME COLUMN "before" TO "oldValue";
ALTER TABLE "audit_logs" RENAME COLUMN "after" TO "newValue";

-- Add new columns for enterprise audit compliance
ALTER TABLE "audit_logs" ADD COLUMN "requestId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userName" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userRole" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "hospitalId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "unitId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "description" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS';

-- Drop deprecated columns
ALTER TABLE "audit_logs" DROP COLUMN "sessionId";
ALTER TABLE "audit_logs" DROP COLUMN "reason";
ALTER TABLE "audit_logs" DROP COLUMN "comment";

-- Drop old index on renamed column and replace with new
DROP INDEX IF EXISTS "audit_logs_action_idx";
CREATE INDEX "audit_logs_actionType_idx" ON "audit_logs"("actionType");

-- Add new indexes for filtered queries
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");
CREATE INDEX "audit_logs_hospitalId_idx" ON "audit_logs"("hospitalId");
CREATE INDEX "audit_logs_unitId_idx" ON "audit_logs"("unitId");
CREATE INDEX "audit_logs_status_idx" ON "audit_logs"("status");
