-- Add unique indexes for personnel
CREATE UNIQUE INDEX IF NOT EXISTS "personnel_email_key" ON "personnel"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "personnel_employeeNo_key" ON "personnel"("employeeNo");

-- Add index for schedules
CREATE INDEX IF NOT EXISTS "schedules_unitId_createdAt_idx" ON "schedules"("unitId", "createdAt");

-- Add foreign keys for compliance tables
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "consent_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_subject_request_audit_logs" ADD CONSTRAINT "data_subject_request_audit_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "data_subject_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_retention_jobs" ADD CONSTRAINT "data_retention_jobs_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "data_retention_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_access_grants" ADD CONSTRAINT "emergency_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_access_grants" ADD CONSTRAINT "emergency_access_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_protection_impact_assessments" ADD CONSTRAINT "data_protection_impact_assessments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "processing_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breach_notifications" ADD CONSTRAINT "breach_notifications_breachId_fkey" FOREIGN KEY ("breachId") REFERENCES "data_breach_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
