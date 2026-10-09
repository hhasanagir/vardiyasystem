-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "ltree";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "DutyRosterRole" AS ENUM ('sorumlu_tekniker', 'tekniker', 'yardimci_tekniker', 'supervisor', 'radyolog');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_RESTRICTED');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('mri', 'ct', 'xray', 'portable_xray', 'ultrasound', 'mammography', 'fluoroscopy', 'pet_ct', 'spect_ct', 'gamma_camera', 'linac', 'mobile_carm', 'anesthesia', 'ventilator', 'patient_monitor', 'defibrillator', 'ecg', 'infusion_pump', 'syringe_pump', 'dialysis', 'sterilizer', 'surgical', 'endoscopic', 'contrast_injector', 'injector', 'ups', 'air_conditioner', 'generator', 'server', 'workstation', 'printer', 'monitor', 'lead_door', 'lead_glass', 'dosimeter', 'protective_equipment', 'furniture', 'other');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('active', 'inactive', 'under_maintenance', 'fault', 'out_of_service', 'retired', 'disposed', 'stored', 'calibration_due', 'warranty_expired');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('preventive', 'corrective', 'predictive', 'breakdown', 'calibration', 'software_update', 'hardware_upgrade', 'safety_inspection', 'quality_control', 'acceptance_test', 'commissioning', 'periodic_inspection');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('emergency', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('open', 'assigned', 'in_progress', 'waiting_parts', 'waiting_vendor', 'completed', 'verified', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('service', 'maintenance', 'warranty', 'rental', 'lease', 'software_license', 'support', 'sla');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'active', 'expired', 'terminated', 'renewed');

-- CreateEnum
CREATE TYPE "ConsumableCategory" AS ENUM ('contrast_media', 'injector_set', 'syringe', 'filter', 'cannula', 'needle', 'probe_cover', 'detector_cover', 'ultrasound_gel', 'printer_paper', 'cleaning_kit', 'disinfectant', 'glove', 'mask', 'spare_part', 'battery', 'cable', 'lamp', 'tube', 'other');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('stock_in', 'stock_out', 'transfer_in', 'transfer_out', 'adjustment_add', 'adjustment_remove', 'consumption', 'wastage', 'expired', 'return', 'recall');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'ordered', 'partial_received', 'received', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "QualityRecordType" AS ENUM ('capa', 'incident_report', 'near_miss', 'quality_audit', 'corrective_action', 'preventive_action', 'non_conformance', 'risk_assessment', 'customer_complaint', 'document_review', 'management_review');

-- CreateEnum
CREATE TYPE "QualityRecordStatus" AS ENUM ('open', 'investigation', 'action_planned', 'implemented', 'verified', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "RadiationMeasurementType" AS ENUM ('dosimeter', 'area_survey', 'leak_test', 'contamination', 'exposure_rate', 'dose_rate');

-- CreateEnum
CREATE TYPE "LifecycleEventType" AS ENUM ('planning', 'purchase', 'installation', 'acceptance', 'commissioning', 'operation', 'maintenance', 'upgrade', 'relocation', 'retirement', 'disposal');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('draft', 'pending', 'approved', 'completed', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "ConsumptionType" AS ENUM ('device_usage', 'examination', 'department', 'waste', 'expired', 'adjustment', 'transfer_out');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('low_stock', 'expiring_soon', 'expired', 'maintenance_due', 'calibration_due', 'warranty_expiring', 'contract_expiring', 'critical_fault');

-- CreateEnum
CREATE TYPE "WasteType" AS ENUM ('expired', 'damaged', 'recalled', 'contaminated', 'surplus', 'opened_unused', 'other');

-- AlterEnum
-- Every legacy RbacRoleName value is mapped before the cast so a populated
-- `roles` table cannot abort with `invalid input value for enum` (defect D16).
CREATE TYPE "RbacRoleName_new" AS ENUM ('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'IMAGING_DIRECTOR', 'SUPERVISOR', 'MEDICAL_ENGINEER', 'SENIOR_TECHNICIAN', 'TECHNICIAN', 'ASSISTANT_TECHNICIAN', 'SECRETARY', 'GUEST');

-- Collision guard (defect D16): the mapping below collapses several legacy roles
-- onto one new value, but `roles_name_key` is UNIQUE, so two rows such as
-- HOSPITAL_DIRECTOR and IMAGING_MANAGER would abort the cast with SQLSTATE 23505.
-- Merge every colliding set into a deterministic keeper (lowest `level`, then
-- lowest `id`), repoint all references, then remove the duplicates. Repointing
-- first avoids the ON DELETE CASCADE wiping their permissions and assignments.
CREATE TEMP TABLE "_role_target" AS
SELECT "id", "level",
       CASE "name"::text
           WHEN 'SYSTEM_ADMIN' THEN 'SYSTEM_ADMIN'
           WHEN 'ORGANIZATION_ADMIN' THEN 'HOSPITAL_ADMIN'
           WHEN 'HOSPITAL_DIRECTOR' THEN 'IMAGING_DIRECTOR'
           WHEN 'IMAGING_MANAGER' THEN 'IMAGING_DIRECTOR'
           WHEN 'UNIT_SUPERVISOR' THEN 'SUPERVISOR'
           WHEN 'SHIFT_COORDINATOR' THEN 'SUPERVISOR'
           WHEN 'HR_MANAGER' THEN 'SECRETARY'
           WHEN 'TECHNICIAN' THEN 'TECHNICIAN'
           WHEN 'READ_ONLY_AUDITOR' THEN 'GUEST'
           ELSE "name"::text
       END AS "target"
FROM "roles";

CREATE TEMP TABLE "_role_merge" AS
SELECT "id" AS "old_id",
       first_value("id") OVER (PARTITION BY "target" ORDER BY "level", "id") AS "keep_id"
FROM "_role_target";

-- Repoint the self-referencing hierarchy before the duplicates disappear.
UPDATE "roles" AS r
SET "parentId" = m."keep_id"
FROM "_role_merge" AS m
WHERE r."parentId" = m."old_id" AND m."old_id" <> m."keep_id";

-- role_permissions: copy each duplicate's unique permission onto the keeper,
-- then delete the rows that lived on the duplicates.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT DISTINCT ON (m."keep_id", rp."permissionId")
       md5(m."keep_id" || rp."permissionId"), m."keep_id", rp."permissionId", rp."createdAt"
FROM "role_permissions" AS rp
JOIN "_role_merge" AS m ON m."old_id" = rp."roleId"
WHERE m."old_id" <> m."keep_id"
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" AS keep
      WHERE keep."roleId" = m."keep_id" AND keep."permissionId" = rp."permissionId"
  )
ORDER BY m."keep_id", rp."permissionId", rp."createdAt";

DELETE FROM "role_permissions" AS rp
USING "_role_merge" AS m
WHERE rp."roleId" = m."old_id" AND m."old_id" <> m."keep_id";

-- user_role_assignments: same merge against its unique key.
INSERT INTO "user_role_assignments" ("id", "userId", "roleId", "organizationId", "unitId", "assignedBy", "expiresAt", "isActive", "createdAt")
SELECT DISTINCT ON (m."keep_id", ura."userId", ura."organizationId", ura."unitId")
       md5(m."keep_id" || ura."userId" || COALESCE(ura."organizationId", '') || COALESCE(ura."unitId", '')),
       ura."userId", m."keep_id", ura."organizationId", ura."unitId", ura."assignedBy", ura."expiresAt", ura."isActive", ura."createdAt"
FROM "user_role_assignments" AS ura
JOIN "_role_merge" AS m ON m."old_id" = ura."roleId"
WHERE m."old_id" <> m."keep_id"
  AND NOT EXISTS (
      SELECT 1 FROM "user_role_assignments" AS keep
      WHERE keep."roleId" = m."keep_id" AND keep."userId" = ura."userId"
        AND keep."organizationId" IS NOT DISTINCT FROM ura."organizationId"
        AND keep."unitId" IS NOT DISTINCT FROM ura."unitId"
  )
ORDER BY m."keep_id", ura."userId", ura."organizationId", ura."unitId", ura."createdAt";

DELETE FROM "user_role_assignments" AS ura
USING "_role_merge" AS m
WHERE ura."roleId" = m."old_id" AND m."old_id" <> m."keep_id";

-- The duplicates are now safe to drop: their children were merged above.
DELETE FROM "roles" AS r
USING "_role_merge" AS m
WHERE r."id" = m."old_id" AND m."old_id" <> m."keep_id";

DROP TABLE "_role_merge";
DROP TABLE "_role_target";

ALTER TABLE "roles" ALTER COLUMN "name" TYPE "RbacRoleName_new" USING (
    CASE "name"::text
        WHEN 'SYSTEM_ADMIN' THEN 'SYSTEM_ADMIN'
        WHEN 'ORGANIZATION_ADMIN' THEN 'HOSPITAL_ADMIN'
        WHEN 'HOSPITAL_DIRECTOR' THEN 'IMAGING_DIRECTOR'
        WHEN 'IMAGING_MANAGER' THEN 'IMAGING_DIRECTOR'
        WHEN 'UNIT_SUPERVISOR' THEN 'SUPERVISOR'
        WHEN 'SHIFT_COORDINATOR' THEN 'SUPERVISOR'
        WHEN 'HR_MANAGER' THEN 'SECRETARY'
        WHEN 'TECHNICIAN' THEN 'TECHNICIAN'
        WHEN 'READ_ONLY_AUDITOR' THEN 'GUEST'
        ELSE "name"::text
    END
)::"RbacRoleName_new";
ALTER TYPE "RbacRoleName" RENAME TO "RbacRoleName_old";
ALTER TYPE "RbacRoleName_new" RENAME TO "RbacRoleName";
DROP TYPE "RbacRoleName_old";

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShiftType" ADD VALUE 'morning';
ALTER TYPE "ShiftType" ADD VALUE 'off';
ALTER TYPE "ShiftType" ADD VALUE 'leave';
ALTER TYPE "ShiftType" ADD VALUE 'sick';
ALTER TYPE "ShiftType" ADD VALUE 'training';
ALTER TYPE "ShiftType" ADD VALUE 'backup';

-- AlterEnum
-- Same mapping guard for the legacy UserRole values (defect D16).
CREATE TYPE "UserRole_new" AS ENUM ('system_admin', 'hospital_admin', 'imaging_director', 'supervisor', 'medical_engineer', 'senior_technician', 'technician', 'assistant_technician', 'secretary', 'guest');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (
    CASE "role"::text
        WHEN 'super_admin' THEN 'system_admin'
        WHEN 'admin' THEN 'hospital_admin'
        WHEN 'project_manager' THEN 'imaging_director'
        WHEN 'head_technician' THEN 'senior_technician'
        WHEN 'supervisor' THEN 'supervisor'
        WHEN 'field_supervisor' THEN 'supervisor'
        WHEN 'technician' THEN 'technician'
        WHEN 'staff' THEN 'guest'
        ELSE "role"::text
    END
)::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'guest';

-- DropIndex
DROP INDEX "areas_path_idx";

-- DropIndex
DROP INDEX "departments_path_idx";

-- DropIndex
DROP INDEX "devices_path_idx";

-- DropIndex
DROP INDEX "directorates_path_idx";

-- DropIndex
DROP INDEX "hospital_groups_path_idx";

-- DropIndex
DROP INDEX "hospitals_path_idx";

-- DropIndex
DROP INDEX "roles_path_idx";

-- DropIndex
DROP INDEX "rooms_path_idx";

-- DropIndex
DROP INDEX "units_path_idx";

-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "startTime" DROP NOT NULL,
ALTER COLUMN "endTime" DROP NOT NULL,
ALTER COLUMN "durationHours" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'guest';

-- CreateTable
CREATE TABLE "duty_roster" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT,
    "deviceId" TEXT,
    "personnelId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "role" "DutyRosterRole" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "taxOffice" TEXT,
    "taxNumber" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_assets" (
    "id" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "barcode" TEXT,
    "qrCode" TEXT,
    "rfidTag" TEXT,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'active',
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "brand" TEXT,
    "yearOfManufacture" INTEGER,
    "installationDate" TIMESTAMP(3),
    "acceptanceDate" TIMESTAMP(3),
    "commissioningDate" TIMESTAMP(3),
    "warrantyStart" TIMESTAMP(3),
    "warrantyEnd" TIMESTAMP(3),
    "expectedLifetimeYears" INTEGER,
    "retirementDate" TIMESTAMP(3),
    "disposalReason" TEXT,
    "purchaseCost" DECIMAL(12,2),
    "currentValue" DECIMAL(12,2),
    "supplierId" TEXT,
    "contractNumber" TEXT,
    "invoiceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "notes" TEXT,
    "departmentId" TEXT,
    "block" TEXT,
    "floor" TEXT,
    "roomId" TEXT,
    "unitId" TEXT,
    "hospitalId" TEXT,
    "ownerDepartmentId" TEXT,
    "responsibleEngineerId" TEXT,
    "organizationId" TEXT,
    "deviceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_documents" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_movements" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT NOT NULL,
    "fromBlock" TEXT,
    "toBlock" TEXT,
    "fromFloor" TEXT,
    "toFloor" TEXT,
    "fromRoomId" TEXT,
    "toRoomId" TEXT,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "reason" TEXT NOT NULL,
    "authorizedBy" TEXT,
    "performedBy" TEXT,
    "notes" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'medium',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedById" TEXT,
    "assignedToId" TEXT,
    "vendorId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "downtimeHours" DOUBLE PRECISION,
    "cost" DECIMAL(12,2),
    "mtbf" DOUBLE PRECISION,
    "mttr" DOUBLE PRECISION,
    "rootCause" TEXT,
    "resolution" TEXT,
    "closingNotes" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_parts" (
    "id" TEXT NOT NULL,
    "maintenanceId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "supplierId" TEXT,
    "stockItemId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_documents" (
    "id" TEXT NOT NULL,
    "maintenanceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "assetId" TEXT,
    "supplierId" TEXT,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3),
    "value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "slaResponseTime" TEXT,
    "slaResolutionTime" TEXT,
    "slaPenalty" TEXT,
    "paymentTerms" TEXT,
    "scope" TEXT,
    "exclusions" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contract_documents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "calibrationNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "performedById" TEXT,
    "vendorId" TEXT,
    "standard" TEXT,
    "results" TEXT,
    "measurementValues" JSONB,
    "certificateRef" TEXT,
    "nextCalibrationDate" TIMESTAMP(3),
    "intervalDays" INTEGER,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "type" TEXT,
    "hospitalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "qrCode" TEXT,
    "name" TEXT NOT NULL,
    "category" "ConsumableCategory" NOT NULL,
    "manufacturer" TEXT,
    "brand" TEXT,
    "supplierId" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'piece',
    "packageSize" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assetId" TEXT,
    "compatibleDeviceIds" TEXT[],
    "compatibleExamTypes" TEXT[],

    CONSTRAINT "consumable_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_batches" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "serialNumber" TEXT,
    "manufacturerDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2),
    "purchaseOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumable_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_stock" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "maximumStock" INTEGER NOT NULL DEFAULT 100,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "reorderQuantity" INTEGER,
    "shelf" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumable_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_transactions" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "catalogId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "performedById" TEXT,
    "notes" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedById" TEXT,
    "departmentId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" "ProcurementStatus" NOT NULL DEFAULT 'draft',
    "estimatedCost" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "justification" TEXT,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "catalogId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'piece',
    "estimatedUnitCost" DECIMAL(12,2),
    "estimatedTotalCost" DECIMAL(12,2),
    "requiredDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "requestId" TEXT,
    "supplierId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'draft',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "totalCost" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "deliveryTerms" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "catalogId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contracts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3),
    "value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "terms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contract_documents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_records" (
    "id" TEXT NOT NULL,
    "recordNumber" TEXT NOT NULL,
    "type" "QualityRecordType" NOT NULL,
    "status" "QualityRecordStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "source" TEXT,
    "departmentId" TEXT,
    "unitId" TEXT,
    "assetId" TEXT,
    "reportedById" TEXT,
    "assignedToId" TEXT,
    "targetDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_actions" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actionNumber" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleId" TEXT,
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "effectiveness" TEXT,
    "verificationNotes" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiation_dosimeters" (
    "id" TEXT NOT NULL,
    "dosimeterNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "assignedToId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "initialReading" DOUBLE PRECISION,
    "currentReading" DOUBLE PRECISION,
    "annualLimit" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "monthlyAlertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 16,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiation_dosimeters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiation_measurements" (
    "id" TEXT NOT NULL,
    "dosimeterId" TEXT,
    "assetId" TEXT,
    "type" "RadiationMeasurementType" NOT NULL,
    "measurementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mSv',
    "location" TEXT,
    "performedById" TEXT,
    "laboratoryRef" TEXT,
    "result" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radiation_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiation_areas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "departmentId" TEXT,
    "unitId" TEXT,
    "roomId" TEXT,
    "classification" TEXT,
    "doseRateLimit" DOUBLE PRECISION,
    "lastSurveyDate" TIMESTAMP(3),
    "nextSurveyDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiation_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_lifecycle_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "eventType" "LifecycleEventType" NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "performedById" TEXT,
    "referenceNumber" TEXT,
    "referenceType" TEXT,
    "locationFrom" TEXT,
    "locationTo" TEXT,
    "documents" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "fromUnitId" TEXT,
    "toUnitId" TEXT,
    "catalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'draft',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption_records" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "consumptionType" "ConsumptionType" NOT NULL,
    "assetId" TEXT,
    "examinationType" TEXT,
    "departmentId" TEXT,
    "unitId" TEXT,
    "batchNumber" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumption_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "warehouseId" TEXT,
    "catalogId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "actualQty" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "totalDifference" DECIMAL(12,2),
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" TEXT NOT NULL,
    "wasteNumber" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "wasteType" "WasteType" NOT NULL,
    "batchNumber" TEXT,
    "reason" TEXT NOT NULL,
    "disposalMethod" TEXT,
    "disposedById" TEXT,
    "disposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "threshold" INTEGER,
    "currentValue" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duty_roster_organizationId_date_idx" ON "duty_roster"("organizationId", "date");

-- CreateIndex
CREATE INDEX "duty_roster_unitId_date_idx" ON "duty_roster"("unitId", "date");

-- CreateIndex
CREATE INDEX "duty_roster_deviceId_date_idx" ON "duty_roster"("deviceId", "date");

-- CreateIndex
CREATE INDEX "duty_roster_date_shiftType_idx" ON "duty_roster"("date", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "duty_roster_personnelId_date_shiftType_key" ON "duty_roster"("personnelId", "date", "shiftType");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_category_idx" ON "suppliers"("category");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_assets_assetNumber_key" ON "enterprise_assets"("assetNumber");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_assets_barcode_key" ON "enterprise_assets"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_assets_deviceId_key" ON "enterprise_assets"("deviceId");

-- CreateIndex
CREATE INDEX "enterprise_assets_assetNumber_idx" ON "enterprise_assets"("assetNumber");

-- CreateIndex
CREATE INDEX "enterprise_assets_barcode_idx" ON "enterprise_assets"("barcode");

-- CreateIndex
CREATE INDEX "enterprise_assets_serialNumber_idx" ON "enterprise_assets"("serialNumber");

-- CreateIndex
CREATE INDEX "enterprise_assets_category_idx" ON "enterprise_assets"("category");

-- CreateIndex
CREATE INDEX "enterprise_assets_status_idx" ON "enterprise_assets"("status");

-- CreateIndex
CREATE INDEX "enterprise_assets_departmentId_idx" ON "enterprise_assets"("departmentId");

-- CreateIndex
CREATE INDEX "enterprise_assets_unitId_idx" ON "enterprise_assets"("unitId");

-- CreateIndex
CREATE INDEX "enterprise_assets_hospitalId_idx" ON "enterprise_assets"("hospitalId");

-- CreateIndex
CREATE INDEX "enterprise_assets_supplierId_idx" ON "enterprise_assets"("supplierId");

-- CreateIndex
CREATE INDEX "enterprise_assets_responsibleEngineerId_idx" ON "enterprise_assets"("responsibleEngineerId");

-- CreateIndex
CREATE INDEX "asset_documents_assetId_idx" ON "asset_documents"("assetId");

-- CreateIndex
CREATE INDEX "asset_documents_type_idx" ON "asset_documents"("type");

-- CreateIndex
CREATE INDEX "asset_movements_assetId_idx" ON "asset_movements"("assetId");

-- CreateIndex
CREATE INDEX "asset_movements_movedAt_idx" ON "asset_movements"("movedAt");

-- CreateIndex
CREATE INDEX "asset_movements_toDepartmentId_idx" ON "asset_movements"("toDepartmentId");

-- CreateIndex
CREATE INDEX "maintenance_records_assetId_idx" ON "maintenance_records"("assetId");

-- CreateIndex
CREATE INDEX "maintenance_records_type_idx" ON "maintenance_records"("type");

-- CreateIndex
CREATE INDEX "maintenance_records_status_idx" ON "maintenance_records"("status");

-- CreateIndex
CREATE INDEX "maintenance_records_priority_idx" ON "maintenance_records"("priority");

-- CreateIndex
CREATE INDEX "maintenance_records_startDate_idx" ON "maintenance_records"("startDate");

-- CreateIndex
CREATE INDEX "maintenance_records_assignedToId_idx" ON "maintenance_records"("assignedToId");

-- CreateIndex
CREATE INDEX "maintenance_records_vendorId_idx" ON "maintenance_records"("vendorId");

-- CreateIndex
CREATE INDEX "maintenance_records_assetId_status_idx" ON "maintenance_records"("assetId", "status");

-- CreateIndex
CREATE INDEX "maintenance_records_assetId_startDate_idx" ON "maintenance_records"("assetId", "startDate");

-- CreateIndex
CREATE INDEX "maintenance_parts_maintenanceId_idx" ON "maintenance_parts"("maintenanceId");

-- CreateIndex
CREATE INDEX "maintenance_documents_maintenanceId_idx" ON "maintenance_documents"("maintenanceId");

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_contractNumber_key" ON "service_contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "service_contracts_contractNumber_idx" ON "service_contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "service_contracts_assetId_idx" ON "service_contracts"("assetId");

-- CreateIndex
CREATE INDEX "service_contracts_supplierId_idx" ON "service_contracts"("supplierId");

-- CreateIndex
CREATE INDEX "service_contracts_status_idx" ON "service_contracts"("status");

-- CreateIndex
CREATE INDEX "service_contracts_endDate_idx" ON "service_contracts"("endDate");

-- CreateIndex
CREATE INDEX "service_contracts_renewalDate_idx" ON "service_contracts"("renewalDate");

-- CreateIndex
CREATE INDEX "service_contract_documents_contractId_idx" ON "service_contract_documents"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "calibration_records_calibrationNumber_key" ON "calibration_records"("calibrationNumber");

-- CreateIndex
CREATE INDEX "calibration_records_assetId_idx" ON "calibration_records"("assetId");

-- CreateIndex
CREATE INDEX "calibration_records_calibrationNumber_idx" ON "calibration_records"("calibrationNumber");

-- CreateIndex
CREATE INDEX "calibration_records_status_idx" ON "calibration_records"("status");

-- CreateIndex
CREATE INDEX "calibration_records_scheduledDate_idx" ON "calibration_records"("scheduledDate");

-- CreateIndex
CREATE INDEX "calibration_records_nextCalibrationDate_idx" ON "calibration_records"("nextCalibrationDate");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_code_idx" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_hospitalId_idx" ON "warehouses"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "consumable_catalog_code_key" ON "consumable_catalog"("code");

-- CreateIndex
CREATE INDEX "consumable_catalog_code_idx" ON "consumable_catalog"("code");

-- CreateIndex
CREATE INDEX "consumable_catalog_barcode_idx" ON "consumable_catalog"("barcode");

-- CreateIndex
CREATE INDEX "consumable_catalog_category_idx" ON "consumable_catalog"("category");

-- CreateIndex
CREATE INDEX "consumable_catalog_supplierId_idx" ON "consumable_catalog"("supplierId");

-- CreateIndex
CREATE INDEX "consumable_catalog_assetId_idx" ON "consumable_catalog"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "consumable_batches_lotNumber_key" ON "consumable_batches"("lotNumber");

-- CreateIndex
CREATE INDEX "consumable_batches_catalogId_idx" ON "consumable_batches"("catalogId");

-- CreateIndex
CREATE INDEX "consumable_batches_lotNumber_idx" ON "consumable_batches"("lotNumber");

-- CreateIndex
CREATE INDEX "consumable_batches_expirationDate_idx" ON "consumable_batches"("expirationDate");

-- CreateIndex
CREATE INDEX "consumable_stock_warehouseId_idx" ON "consumable_stock"("warehouseId");

-- CreateIndex
CREATE INDEX "consumable_stock_catalogId_idx" ON "consumable_stock"("catalogId");

-- CreateIndex
CREATE INDEX "consumable_stock_currentStock_idx" ON "consumable_stock"("currentStock");

-- CreateIndex
CREATE UNIQUE INDEX "consumable_stock_catalogId_warehouseId_key" ON "consumable_stock"("catalogId", "warehouseId");

-- CreateIndex
CREATE INDEX "consumable_transactions_batchId_idx" ON "consumable_transactions"("batchId");

-- CreateIndex
CREATE INDEX "consumable_transactions_catalogId_idx" ON "consumable_transactions"("catalogId");

-- CreateIndex
CREATE INDEX "consumable_transactions_warehouseId_idx" ON "consumable_transactions"("warehouseId");

-- CreateIndex
CREATE INDEX "consumable_transactions_type_idx" ON "consumable_transactions"("type");

-- CreateIndex
CREATE INDEX "consumable_transactions_transactionDate_idx" ON "consumable_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "consumable_transactions_referenceType_referenceId_idx" ON "consumable_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_requests_requestNumber_key" ON "procurement_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "procurement_requests_requestNumber_idx" ON "procurement_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "procurement_requests_status_idx" ON "procurement_requests"("status");

-- CreateIndex
CREATE INDEX "procurement_requests_departmentId_idx" ON "procurement_requests"("departmentId");

-- CreateIndex
CREATE INDEX "procurement_requests_requestedById_idx" ON "procurement_requests"("requestedById");

-- CreateIndex
CREATE INDEX "procurement_request_items_requestId_idx" ON "procurement_request_items"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_orders_orderNumber_key" ON "procurement_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "procurement_orders_orderNumber_idx" ON "procurement_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "procurement_orders_supplierId_idx" ON "procurement_orders"("supplierId");

-- CreateIndex
CREATE INDEX "procurement_orders_status_idx" ON "procurement_orders"("status");

-- CreateIndex
CREATE INDEX "procurement_orders_orderDate_idx" ON "procurement_orders"("orderDate");

-- CreateIndex
CREATE INDEX "procurement_order_items_orderId_idx" ON "procurement_order_items"("orderId");

-- CreateIndex
CREATE INDEX "procurement_invoices_orderId_idx" ON "procurement_invoices"("orderId");

-- CreateIndex
CREATE INDEX "procurement_invoices_invoiceNumber_idx" ON "procurement_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "procurement_invoices_status_idx" ON "procurement_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_contracts_contractNumber_key" ON "supplier_contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "supplier_contracts_supplierId_idx" ON "supplier_contracts"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_contracts_contractNumber_idx" ON "supplier_contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "supplier_contracts_status_idx" ON "supplier_contracts"("status");

-- CreateIndex
CREATE INDEX "supplier_contracts_endDate_idx" ON "supplier_contracts"("endDate");

-- CreateIndex
CREATE INDEX "supplier_contracts_renewalDate_idx" ON "supplier_contracts"("renewalDate");

-- CreateIndex
CREATE INDEX "supplier_contract_documents_contractId_idx" ON "supplier_contract_documents"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_records_recordNumber_key" ON "quality_records"("recordNumber");

-- CreateIndex
CREATE INDEX "quality_records_recordNumber_idx" ON "quality_records"("recordNumber");

-- CreateIndex
CREATE INDEX "quality_records_type_idx" ON "quality_records"("type");

-- CreateIndex
CREATE INDEX "quality_records_status_idx" ON "quality_records"("status");

-- CreateIndex
CREATE INDEX "quality_records_severity_idx" ON "quality_records"("severity");

-- CreateIndex
CREATE INDEX "quality_records_departmentId_idx" ON "quality_records"("departmentId");

-- CreateIndex
CREATE INDEX "quality_records_unitId_idx" ON "quality_records"("unitId");

-- CreateIndex
CREATE INDEX "quality_records_assetId_idx" ON "quality_records"("assetId");

-- CreateIndex
CREATE INDEX "quality_records_assignedToId_idx" ON "quality_records"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_actions_actionNumber_key" ON "quality_actions"("actionNumber");

-- CreateIndex
CREATE INDEX "quality_actions_recordId_idx" ON "quality_actions"("recordId");

-- CreateIndex
CREATE INDEX "quality_actions_actionNumber_idx" ON "quality_actions"("actionNumber");

-- CreateIndex
CREATE INDEX "quality_actions_status_idx" ON "quality_actions"("status");

-- CreateIndex
CREATE INDEX "quality_actions_responsibleId_idx" ON "quality_actions"("responsibleId");

-- CreateIndex
CREATE UNIQUE INDEX "radiation_dosimeters_dosimeterNumber_key" ON "radiation_dosimeters"("dosimeterNumber");

-- CreateIndex
CREATE INDEX "radiation_dosimeters_dosimeterNumber_idx" ON "radiation_dosimeters"("dosimeterNumber");

-- CreateIndex
CREATE INDEX "radiation_dosimeters_assignedToId_idx" ON "radiation_dosimeters"("assignedToId");

-- CreateIndex
CREATE INDEX "radiation_dosimeters_status_idx" ON "radiation_dosimeters"("status");

-- CreateIndex
CREATE INDEX "radiation_measurements_dosimeterId_idx" ON "radiation_measurements"("dosimeterId");

-- CreateIndex
CREATE INDEX "radiation_measurements_assetId_idx" ON "radiation_measurements"("assetId");

-- CreateIndex
CREATE INDEX "radiation_measurements_type_idx" ON "radiation_measurements"("type");

-- CreateIndex
CREATE INDEX "radiation_measurements_measurementDate_idx" ON "radiation_measurements"("measurementDate");

-- CreateIndex
CREATE INDEX "radiation_measurements_result_idx" ON "radiation_measurements"("result");

-- CreateIndex
CREATE UNIQUE INDEX "radiation_areas_code_key" ON "radiation_areas"("code");

-- CreateIndex
CREATE INDEX "radiation_areas_code_idx" ON "radiation_areas"("code");

-- CreateIndex
CREATE INDEX "radiation_areas_type_idx" ON "radiation_areas"("type");

-- CreateIndex
CREATE INDEX "radiation_areas_departmentId_idx" ON "radiation_areas"("departmentId");

-- CreateIndex
CREATE INDEX "radiation_areas_unitId_idx" ON "radiation_areas"("unitId");

-- CreateIndex
CREATE INDEX "device_lifecycle_events_assetId_idx" ON "device_lifecycle_events"("assetId");

-- CreateIndex
CREATE INDEX "device_lifecycle_events_eventType_idx" ON "device_lifecycle_events"("eventType");

-- CreateIndex
CREATE INDEX "device_lifecycle_events_eventDate_idx" ON "device_lifecycle_events"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_transferNumber_key" ON "inventory_transfers"("transferNumber");

-- CreateIndex
CREATE INDEX "inventory_transfers_transferNumber_idx" ON "inventory_transfers"("transferNumber");

-- CreateIndex
CREATE INDEX "inventory_transfers_status_idx" ON "inventory_transfers"("status");

-- CreateIndex
CREATE INDEX "inventory_transfers_fromWarehouseId_idx" ON "inventory_transfers"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "inventory_transfers_toWarehouseId_idx" ON "inventory_transfers"("toWarehouseId");

-- CreateIndex
CREATE INDEX "inventory_transfers_catalogId_idx" ON "inventory_transfers"("catalogId");

-- CreateIndex
CREATE INDEX "consumption_records_catalogId_idx" ON "consumption_records"("catalogId");

-- CreateIndex
CREATE INDEX "consumption_records_assetId_idx" ON "consumption_records"("assetId");

-- CreateIndex
CREATE INDEX "consumption_records_consumptionType_idx" ON "consumption_records"("consumptionType");

-- CreateIndex
CREATE INDEX "consumption_records_recordedAt_idx" ON "consumption_records"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_countNumber_key" ON "inventory_counts"("countNumber");

-- CreateIndex
CREATE INDEX "inventory_counts_countNumber_idx" ON "inventory_counts"("countNumber");

-- CreateIndex
CREATE INDEX "inventory_counts_warehouseId_idx" ON "inventory_counts"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_counts_catalogId_idx" ON "inventory_counts"("catalogId");

-- CreateIndex
CREATE INDEX "inventory_counts_status_idx" ON "inventory_counts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_wasteNumber_key" ON "waste_records"("wasteNumber");

-- CreateIndex
CREATE INDEX "waste_records_wasteNumber_idx" ON "waste_records"("wasteNumber");

-- CreateIndex
CREATE INDEX "waste_records_catalogId_idx" ON "waste_records"("catalogId");

-- CreateIndex
CREATE INDEX "waste_records_wasteType_idx" ON "waste_records"("wasteType");

-- CreateIndex
CREATE INDEX "waste_records_disposedAt_idx" ON "waste_records"("disposedAt");

-- CreateIndex
CREATE INDEX "stock_alerts_catalogId_idx" ON "stock_alerts"("catalogId");

-- CreateIndex
CREATE INDEX "stock_alerts_alertType_idx" ON "stock_alerts"("alertType");

-- CreateIndex
CREATE INDEX "stock_alerts_isResolved_idx" ON "stock_alerts"("isResolved");

-- CreateIndex
CREATE INDEX "stock_alerts_severity_idx" ON "stock_alerts"("severity");

-- CreateIndex
CREATE INDEX "assignments_scheduleId_personnelId_idx" ON "assignments"("scheduleId", "personnelId");

-- CreateIndex
CREATE INDEX "handover_notes_unitId_status_createdAt_idx" ON "handover_notes"("unitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_attemptCount_createdAt_idx" ON "notification_deliveries"("status", "attemptCount", "createdAt");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_notificationId_idx" ON "notification_recipients"("userId", "notificationId");

-- CreateIndex
CREATE INDEX "personnel_unitId_isActive_idx" ON "personnel"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "processing_activities_activityId_idx" ON "processing_activities"("activityId");

-- AddForeignKey
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_roster" ADD CONSTRAINT "duty_roster_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_assets" ADD CONSTRAINT "enterprise_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_documents" ADD CONSTRAINT "maintenance_documents_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contract_documents" ADD CONSTRAINT "service_contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_catalog" ADD CONSTRAINT "consumable_catalog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_catalog" ADD CONSTRAINT "consumable_catalog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_batches" ADD CONSTRAINT "consumable_batches_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_stock" ADD CONSTRAINT "consumable_stock_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_stock" ADD CONSTRAINT "consumable_stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_transactions" ADD CONSTRAINT "consumable_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "consumable_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_transactions" ADD CONSTRAINT "consumable_transactions_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_transactions" ADD CONSTRAINT "consumable_transactions_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_request_items" ADD CONSTRAINT "procurement_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_items" ADD CONSTRAINT "procurement_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_invoices" ADD CONSTRAINT "procurement_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_contracts" ADD CONSTRAINT "supplier_contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_contract_documents" ADD CONSTRAINT "supplier_contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "supplier_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_actions" ADD CONSTRAINT "quality_actions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "quality_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_dosimeters" ADD CONSTRAINT "radiation_dosimeters_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_measurements" ADD CONSTRAINT "radiation_measurements_dosimeterId_fkey" FOREIGN KEY ("dosimeterId") REFERENCES "radiation_dosimeters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiation_measurements" ADD CONSTRAINT "radiation_measurements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_lifecycle_events" ADD CONSTRAINT "device_lifecycle_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "enterprise_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "consumable_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

