-- CreateIndex: Composite index on schedules (organizationId, status) for filtered tenant queries
CREATE INDEX "schedules_organizationId_status_idx" ON "schedules"("organizationId", "status");

-- CreateIndex: Composite index on assignments (scheduleId, date) for date-range queries on a schedule
CREATE INDEX "assignments_scheduleId_date_idx" ON "assignments"("scheduleId", "date");

-- CreateIndex: Composite index on audit_logs (organizationId, createdAt) for tenant-scoped time-range queries
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
