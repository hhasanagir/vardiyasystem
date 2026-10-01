-- Schedule status must be a valid enum value
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_status_check" 
  CHECK ("status" IN ('draft', 'under_review', 'approved', 'published', 'archived', 'rejected'));

-- Schedule month must be 1-12
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_month_check" 
  CHECK ("month" >= 1 AND "month" <= 12);

-- Schedule year must be reasonable (2020-2099)
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_year_check" 
  CHECK ("year" >= 2020 AND "year" <= 2099);

-- Schedule version must be positive
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_version_check" 
  CHECK ("version" > 0);

-- Assignment shift type must be valid
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shifttype_check"
  CHECK ("shiftType" IN ('day', 'evening', 'night', 'morning', 'off', 'leave', 'sick', 'training', 'backup'));

-- Assignment kind must be valid
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_kind_check"
  CHECK ("kind" IN ('device', 'person'));

-- Audit log status must be valid
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_status_check" 
  CHECK ("status" IN ('SUCCESS', 'FAILURE', 'WARNING'));

-- Duty roster shift type must be valid  
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_shifttype_check" 
  CHECK ("shiftType" IN ('day', 'evening', 'night', 'morning', 'off', 'leave', 'sick', 'training', 'backup'));

-- Notification recipient isDeleted default consistency
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_deleted_check" 
  CHECK ("isDeleted" = false OR "deletedAt" IS NOT NULL);
