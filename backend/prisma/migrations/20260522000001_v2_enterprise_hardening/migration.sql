-- V2 Enterprise Hardening: Integrity constraints, FKs, unique indexes

-- Personnel: unique email and employeeNo (nulls allowed, PG unique ignores nulls)
ALTER TABLE "personnel" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "personnel_email_key" ON "personnel"("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "personnel_employeeNo_key" ON "personnel"("employeeNo") WHERE "employeeNo" IS NOT NULL;

-- Assignment: prevent same person on same shift type same date across devices
CREATE UNIQUE INDEX "assignments_personnelId_date_shiftType_key" ON "assignments"("personnelId", "date", "shiftType");
CREATE INDEX "assignments_personnelId_date_idx" ON "assignments"("personnelId", "date");

-- SwapRequest: Add proper FK constraints
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_targetPersonnelId_fkey" FOREIGN KEY ("targetPersonnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_fromAssignmentId_fkey" FOREIGN KEY ("fromAssignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_toAssignmentId_fkey" FOREIGN KEY ("toAssignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SwapRequest indexes
CREATE INDEX "swap_requests_requesterId_idx" ON "swap_requests"("requesterId");
CREATE INDEX "swap_requests_targetPersonnelId_idx" ON "swap_requests"("targetPersonnelId");
CREATE INDEX "swap_requests_status_idx" ON "swap_requests"("status");

-- Notification: Add user FK
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification indexes
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");
