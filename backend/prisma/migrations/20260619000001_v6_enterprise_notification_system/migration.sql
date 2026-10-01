-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "DeviceOperationalStatus" AS ENUM ('active', 'maintenance', 'fault', 'out_of_service');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCHEDULE_CHANGED', 'SCHEDULE_APPROVED', 'SCHEDULE_REJECTED', 'SHIFT_SWAP_REQUESTED', 'SHIFT_SWAP_APPROVED', 'SHIFT_SWAP_REJECTED', 'TRAINING_ASSIGNED', 'TRAINING_EXPIRING', 'TRAINING_EXPIRED', 'CERTIFICATION_EXPIRING', 'CERTIFICATION_EXPIRED', 'DEVICE_INCIDENT', 'DEVICE_INCIDENT_CRITICAL', 'SYSTEM_ANNOUNCEMENT', 'ROLE_ASSIGNED', 'PERMISSION_CHANGED', 'ATTENDANCE_ALERT', 'EMERGENCY_ALERT', 'CLOCK_IN_REMINDER', 'SCHEDULE_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'WEB_PUSH', 'FCM', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'CLICKED', 'FAILED');

-- CreateEnum
CREATE TYPE "RbacRoleName" AS ENUM ('SYSTEM_ADMIN', 'ORGANIZATION_ADMIN', 'HOSPITAL_DIRECTOR', 'IMAGING_MANAGER', 'UNIT_SUPERVISOR', 'SHIFT_COORDINATOR', 'HR_MANAGER', 'TECHNICIAN', 'READ_ONLY_AUDITOR');

-- DropForeignKey
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey";

-- DropIndex
DROP INDEX "auth_attempts_created_at_idx";

-- DropIndex
DROP INDEX "auth_attempts_email_created_at_idx";

-- DropIndex
DROP INDEX "auth_attempts_ip_address_created_at_idx";

-- DropIndex
DROP INDEX "auth_attempts_user_id_created_at_idx";

-- DropIndex
DROP INDEX "auth_sessions_expires_at_idx";

-- DropIndex
DROP INDEX "auth_sessions_hashed_token_idx";

-- DropIndex
DROP INDEX "auth_sessions_user_id_revoked_at_idx";

-- DropIndex
DROP INDEX "notifications_createdAt_idx";

-- DropIndex
DROP INDEX "notifications_organizationId_idx";

-- DropIndex
DROP INDEX "notifications_userId_isRead_idx";

-- AlterTable
ALTER TABLE "auth_attempts" DROP COLUMN "attempt_type",
DROP COLUMN "created_at",
DROP COLUMN "ip_address",
DROP COLUMN "lockout_until",
DROP COLUMN "user_agent",
DROP COLUMN "user_id",
ADD COLUMN     "attemptType" TEXT NOT NULL DEFAULT 'LOGIN',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lockoutUntil" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "auth_sessions" DROP COLUMN "created_at",
DROP COLUMN "device_info",
DROP COLUMN "expires_at",
DROP COLUMN "hashed_token",
DROP COLUMN "ip_address",
DROP COLUMN "last_used_at",
DROP COLUMN "revoked_at",
DROP COLUMN "user_agent",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deviceInfo" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "hashedToken" TEXT NOT NULL,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "isRead",
DROP COLUMN "readAt",
DROP COLUMN "userId",
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "senderId" TEXT,
ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RbacRoleName" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "organizationId" TEXT,
    "unitId" TEXT,
    "assignedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "deviceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'imaging',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_skills" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "certificationLevel" TEXT NOT NULL DEFAULT 'certified',
    "certifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_blacklist" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "announcementEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trainingReminders" BOOLEAN NOT NULL DEFAULT true,
    "scheduleReminders" BOOLEAN NOT NULL DEFAULT true,
    "emergencyAlerts" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'IN_APP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT,
    "shiftType" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'active',
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "date" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_incidents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "date" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_trainings" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_status_logs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_shift_checklists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "date" TEXT NOT NULL,
    "deviceOpened" BOOLEAN NOT NULL DEFAULT false,
    "calibrationChecked" BOOLEAN NOT NULL DEFAULT false,
    "protectiveEquipment" BOOLEAN NOT NULL DEFAULT false,
    "roomPrepared" BOOLEAN NOT NULL DEFAULT false,
    "suppliesReady" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_shift_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "user_role_assignments_userId_isActive_idx" ON "user_role_assignments"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_role_assignments_roleId_idx" ON "user_role_assignments"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_userId_roleId_organizationId_unitId_key" ON "user_role_assignments"("userId", "roleId", "organizationId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "push_tokens_token_idx" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_isActive_idx" ON "push_tokens"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_key" ON "web_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "web_push_subscriptions_userId_idx" ON "web_push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_category_idx" ON "skills"("category");

-- CreateIndex
CREATE INDEX "personnel_skills_personnelId_idx" ON "personnel_skills"("personnelId");

-- CreateIndex
CREATE INDEX "personnel_skills_skillId_idx" ON "personnel_skills"("skillId");

-- CreateIndex
CREATE INDEX "personnel_skills_expiresAt_idx" ON "personnel_skills"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_skills_personnelId_skillId_key" ON "personnel_skills"("personnelId", "skillId");

-- CreateIndex
CREATE INDEX "shifts_unitId_idx" ON "shifts"("unitId");

-- CreateIndex
CREATE INDEX "shifts_organizationId_idx" ON "shifts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_code_idx" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_organizationId_idx" ON "invite_codes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_jti_key" ON "token_blacklist"("jti");

-- CreateIndex
CREATE INDEX "token_blacklist_jti_idx" ON "token_blacklist"("jti");

-- CreateIndex
CREATE INDEX "token_blacklist_expiresAt_idx" ON "token_blacklist"("expiresAt");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_isRead_idx" ON "notification_recipients"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_isDeleted_idx" ON "notification_recipients"("userId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notificationId_userId_key" ON "notification_recipients"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_idx" ON "notification_deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "notification_deliveries_recipientId_idx" ON "notification_deliveries"("recipientId");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_attemptCount_idx" ON "notification_deliveries"("status", "attemptCount");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_name_key" ON "notification_templates"("name");

-- CreateIndex
CREATE INDEX "notification_templates_type_idx" ON "notification_templates"("type");

-- CreateIndex
CREATE INDEX "handover_notes_userId_idx" ON "handover_notes"("userId");

-- CreateIndex
CREATE INDEX "handover_notes_unitId_idx" ON "handover_notes"("unitId");

-- CreateIndex
CREATE INDEX "handover_notes_status_idx" ON "handover_notes"("status");

-- CreateIndex
CREATE INDEX "handover_notes_createdAt_idx" ON "handover_notes"("createdAt");

-- CreateIndex
CREATE INDEX "attendance_records_userId_idx" ON "attendance_records"("userId");

-- CreateIndex
CREATE INDEX "attendance_records_date_idx" ON "attendance_records"("date");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_userId_date_key" ON "attendance_records"("userId", "date");

-- CreateIndex
CREATE INDEX "device_incidents_userId_idx" ON "device_incidents"("userId");

-- CreateIndex
CREATE INDEX "device_incidents_unitId_idx" ON "device_incidents"("unitId");

-- CreateIndex
CREATE INDEX "device_incidents_deviceId_idx" ON "device_incidents"("deviceId");

-- CreateIndex
CREATE INDEX "device_incidents_status_idx" ON "device_incidents"("status");

-- CreateIndex
CREATE INDEX "device_incidents_severity_idx" ON "device_incidents"("severity");

-- CreateIndex
CREATE INDEX "device_incidents_reportedAt_idx" ON "device_incidents"("reportedAt");

-- CreateIndex
CREATE INDEX "shift_tasks_userId_date_idx" ON "shift_tasks"("userId", "date");

-- CreateIndex
CREATE INDEX "shift_tasks_date_idx" ON "shift_tasks"("date");

-- CreateIndex
CREATE INDEX "shift_tasks_assignmentId_idx" ON "shift_tasks"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_tasks_userId_date_taskType_key" ON "shift_tasks"("userId", "date", "taskType");

-- CreateIndex
CREATE INDEX "trainings_category_idx" ON "trainings"("category");

-- CreateIndex
CREATE INDEX "trainings_name_idx" ON "trainings"("name");

-- CreateIndex
CREATE INDEX "personnel_trainings_personnelId_idx" ON "personnel_trainings"("personnelId");

-- CreateIndex
CREATE INDEX "personnel_trainings_trainingId_idx" ON "personnel_trainings"("trainingId");

-- CreateIndex
CREATE INDEX "personnel_trainings_expiryDate_idx" ON "personnel_trainings"("expiryDate");

-- CreateIndex
CREATE INDEX "personnel_trainings_status_idx" ON "personnel_trainings"("status");

-- CreateIndex
CREATE INDEX "device_status_logs_deviceId_createdAt_idx" ON "device_status_logs"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "device_status_logs_createdAt_idx" ON "device_status_logs"("createdAt");

-- CreateIndex
CREATE INDEX "pre_shift_checklists_userId_date_idx" ON "pre_shift_checklists"("userId", "date");

-- CreateIndex
CREATE INDEX "pre_shift_checklists_assignmentId_idx" ON "pre_shift_checklists"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "pre_shift_checklists_userId_date_key" ON "pre_shift_checklists"("userId", "date");

-- CreateIndex
CREATE INDEX "assignments_deviceId_idx" ON "assignments"("deviceId");

-- CreateIndex
CREATE INDEX "assignments_date_idx" ON "assignments"("date");

-- CreateIndex
CREATE INDEX "assignments_scheduleId_idx" ON "assignments"("scheduleId");

-- CreateIndex
CREATE INDEX "auth_attempts_email_createdAt_idx" ON "auth_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "auth_attempts_ipAddress_createdAt_idx" ON "auth_attempts"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "auth_attempts_createdAt_idx" ON "auth_attempts"("createdAt");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_revokedAt_idx" ON "auth_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_sessions_hashedToken_idx" ON "auth_sessions"("hashedToken");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "devices_unitId_idx" ON "devices"("unitId");

-- CreateIndex
CREATE INDEX "devices_organizationId_idx" ON "devices"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_priority_idx" ON "notifications"("priority");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "personnel_unitId_idx" ON "personnel"("unitId");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE INDEX "schedules_createdById_idx" ON "schedules"("createdById");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_skills" ADD CONSTRAINT "personnel_skills_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_skills" ADD CONSTRAINT "personnel_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_notes" ADD CONSTRAINT "handover_notes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_incidents" ADD CONSTRAINT "device_incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_incidents" ADD CONSTRAINT "device_incidents_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_incidents" ADD CONSTRAINT "device_incidents_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_trainings" ADD CONSTRAINT "personnel_trainings_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_trainings" ADD CONSTRAINT "personnel_trainings_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_status_logs" ADD CONSTRAINT "device_status_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_status_logs" ADD CONSTRAINT "device_status_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_shift_checklists" ADD CONSTRAINT "pre_shift_checklists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_shift_checklists" ADD CONSTRAINT "pre_shift_checklists_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

