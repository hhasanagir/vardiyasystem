-- V7: Create missing compliance tables and repair audit_logs schema drift
-- These tables+columns were defined in schema.prisma but never created in any migration.
-- The v8 migration assumes the compliance tables exist; this ensures the shadow database can build.

-- Create enums used by compliance models
DO $$ BEGIN
    CREATE TYPE "ConsentStatus" AS ENUM ('GIVEN', 'WITHDRAWN', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ConsentPurpose" AS ENUM ('DATA_PROCESSING', 'COMMUNICATION', 'BIOMETRIC_AUTH', 'PUSH_NOTIFICATIONS', 'EMAIL_NOTIFICATIONS', 'SMS_NOTIFICATIONS', 'DATA_SHARING', 'THIRD_PARTY_PROCESSING', 'EMERGENCY_ACCESS', 'RESEARCH_ANALYTICS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'PORTABILITY', 'OBJECTION', 'WITHDRAW_CONSENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('PENDING', 'VERIFYING_IDENTITY', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "EmergencyAccessReason" AS ENUM ('SYSTEM_OUTAGE', 'USER_INCAPACITATED', 'URGENT_SCHEDULE_CHANGE', 'CRITICAL_PATIENT_NEED', 'DISASTER_RECOVERY', 'LEGAL_REQUIREMENT', 'AUDIT_REQUIREMENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: consent_templates
CREATE TABLE IF NOT EXISTS "consent_templates" (
    "id" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: consent_records
CREATE TABLE IF NOT EXISTS "consent_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GIVEN',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentVersion" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_subject_requests
CREATE TABLE IF NOT EXISTS "data_subject_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestType" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerifiedAt" TIMESTAMP(3),
    "identityVerifiedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "dataSnapshot" JSONB,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_subject_request_audit_logs
CREATE TABLE IF NOT EXISTS "data_subject_request_audit_logs" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_subject_request_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_retention_policies
CREATE TABLE IF NOT EXISTS "data_retention_policies" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "archiveAfterDays" INTEGER,
    "purgeAfterDays" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_retention_jobs
CREATE TABLE IF NOT EXISTS "data_retention_jobs" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'ARCHIVE_OR_PURGE',
    "recordsAffected" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "data_retention_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: emergency_access_grants
CREATE TABLE IF NOT EXISTS "emergency_access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" "EmergencyAccessReason" NOT NULL,
    "justification" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'read',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "accessLog" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "emergency_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_breach_records
CREATE TABLE IF NOT EXISTS "data_breach_records" (
    "id" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedBy" TEXT NOT NULL,
    "breachType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "affectedEntities" TEXT[] NOT NULL,
    "affectedRecords" INTEGER NOT NULL DEFAULT 0,
    "containmentAt" TIMESTAMP(3),
    "notifiedAuthorityAt" TIMESTAMP(3),
    "notifiedSubjectsAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "remediation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_breach_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: processing_activities
CREATE TABLE IF NOT EXISTS "processing_activities" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "controller" TEXT NOT NULL,
    "processor" TEXT,
    "purpose" TEXT NOT NULL,
    "dataCategories" TEXT[] NOT NULL,
    "dataSubjects" TEXT[] NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "retentionPeriod" TEXT NOT NULL,
    "securityMeasures" TEXT[] NOT NULL,
    "crossBorderTransfer" TEXT,
    "dpiaRequired" BOOLEAN NOT NULL DEFAULT false,
    "dpiaCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: data_protection_impact_assessments
CREATE TABLE IF NOT EXISTS "data_protection_impact_assessments" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "assessor" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "risks" JSONB NOT NULL,
    "mitigations" JSONB NOT NULL,
    "residualRisk" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_protection_impact_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: breach_notifications
CREATE TABLE IF NOT EXISTS "breach_notifications" (
    "id" TEXT NOT NULL,
    "breachId" TEXT NOT NULL,
    "notifiedTo" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL DEFAULT 'AUTHORITY',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breach_notifications_pkey" PRIMARY KEY ("id")
);

-- Unique indexes from @@unique
CREATE UNIQUE INDEX IF NOT EXISTS "consent_templates_purpose_version_key" ON "consent_templates"("purpose", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "consent_records_userId_templateId_key" ON "consent_records"("userId", "templateId");
CREATE UNIQUE INDEX IF NOT EXISTS "data_retention_policies_entityType_key" ON "data_retention_policies"("entityType");
CREATE UNIQUE INDEX IF NOT EXISTS "processing_activities_activityId_key" ON "processing_activities"("activityId");
CREATE UNIQUE INDEX IF NOT EXISTS "data_protection_impact_assessments_activityId_key" ON "data_protection_impact_assessments"("activityId");

-- Indexes from @@index
CREATE INDEX IF NOT EXISTS "consent_templates_purpose_isActive_idx" ON "consent_templates"("purpose", "isActive");
CREATE INDEX IF NOT EXISTS "consent_records_userId_status_idx" ON "consent_records"("userId", "status");
CREATE INDEX IF NOT EXISTS "consent_records_templateId_idx" ON "consent_records"("templateId");
CREATE INDEX IF NOT EXISTS "consent_records_expiresAt_idx" ON "consent_records"("expiresAt");
CREATE INDEX IF NOT EXISTS "data_subject_requests_userId_status_idx" ON "data_subject_requests"("userId", "status");
CREATE INDEX IF NOT EXISTS "data_subject_requests_requestType_status_idx" ON "data_subject_requests"("requestType", "status");
CREATE INDEX IF NOT EXISTS "data_subject_requests_requestedAt_idx" ON "data_subject_requests"("requestedAt");
CREATE INDEX IF NOT EXISTS "data_subject_request_audit_logs_requestId_idx" ON "data_subject_request_audit_logs"("requestId");
CREATE INDEX IF NOT EXISTS "data_subject_request_audit_logs_createdAt_idx" ON "data_subject_request_audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "data_retention_jobs_policyId_startedAt_idx" ON "data_retention_jobs"("policyId", "startedAt");
CREATE INDEX IF NOT EXISTS "data_retention_jobs_status_idx" ON "data_retention_jobs"("status");
CREATE INDEX IF NOT EXISTS "emergency_access_grants_userId_isActive_idx" ON "emergency_access_grants"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "emergency_access_grants_expiresAt_idx" ON "emergency_access_grants"("expiresAt");
CREATE INDEX IF NOT EXISTS "emergency_access_grants_grantedAt_idx" ON "emergency_access_grants"("grantedAt");
CREATE INDEX IF NOT EXISTS "data_breach_records_detectedAt_idx" ON "data_breach_records"("detectedAt");
CREATE INDEX IF NOT EXISTS "data_breach_records_status_severity_idx" ON "data_breach_records"("status", "severity");
CREATE INDEX IF NOT EXISTS "processing_activities_purpose_idx" ON "processing_activities"("purpose");
CREATE INDEX IF NOT EXISTS "data_protection_impact_assessments_status_idx" ON "data_protection_impact_assessments"("status");
CREATE INDEX IF NOT EXISTS "breach_notifications_breachId_idx" ON "breach_notifications"("breachId");
CREATE INDEX IF NOT EXISTS "breach_notifications_notificationType_status_idx" ON "breach_notifications"("notificationType", "status");

-- Fix audit_logs: add missing enum and columns that were never in any migration
DO $$ BEGIN
    CREATE TYPE "AuditDataClassification" AS ENUM ('UNCLASSIFIED', 'PERSONAL', 'SENSITIVE_PERSONAL', 'HEALTH', 'FINANCIAL', 'SYSTEM');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "dataClassification" "AuditDataClassification" NOT NULL DEFAULT 'UNCLASSIFIED';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "retentionHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "consentId" TEXT;

-- Missing indexes on audit_logs from schema.prisma @@index annotations
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_dataClassification_idx" ON "audit_logs"("dataClassification");
CREATE INDEX IF NOT EXISTS "audit_logs_retentionHash_idx" ON "audit_logs"("retentionHash");
