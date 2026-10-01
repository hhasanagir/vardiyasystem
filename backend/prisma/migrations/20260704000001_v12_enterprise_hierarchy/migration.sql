-- V12: Enterprise Organization Hierarchy
-- Full multi-level hierarchy: HospitalGroup > Hospital > Directorate > Department > Unit > Area > Room
-- All tables get ltree path columns for efficient hierarchical queries.
-- Device and AssignmentSlot link into the hierarchy.

-- ===== NEW ENUMS =====
CREATE TYPE "AreaType" AS ENUM ('scanning', 'control', 'preparation', 'storage', 'waiting', 'recovery', 'office', 'utility');
CREATE TYPE "RoomType" AS ENUM ('patient_exam', 'equipment', 'control', 'preparation', 'storage', 'consultation', 'recovery', 'utility');
CREATE TYPE "AssignmentSlotStatus" AS ENUM ('available', 'occupied', 'reserved', 'maintenance', 'closed');

-- ===== EXTEND EXISTING ENUMS =====
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'ultrason';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'anjiyo';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'mamografi';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'kemik_dansitometri';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'floroskopi';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'pet_ct';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'spect_ct';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'linak';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'simutasyon_ct';
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'mobil';

-- ===== NEW TABLES =====
CREATE TABLE IF NOT EXISTS "hospital_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "path" ltree,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospital_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hospitals" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "path" ltree,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "directorates" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "path" ltree,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "directorates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "directorateId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "path" ltree,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "areas" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "AreaType" NOT NULL DEFAULT 'scanning',
    "path" ltree,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rooms" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'patient_exam',
    "path" ltree,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assignment_slots" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "deviceId" TEXT,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "status" "AssignmentSlotStatus" NOT NULL DEFAULT 'available',
    "assignedTo" TEXT,
    "scheduleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assignment_slots_pkey" PRIMARY KEY ("id")
);

-- ===== ADD COLUMNS TO EXISTING TABLES =====
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "path" ltree;

-- ===== UNIQUE CONSTRAINTS =====
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_groups_code_key" ON "hospital_groups"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "hospitals_code_key" ON "hospitals"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "directorates_hospitalId_code_key" ON "directorates"("hospitalId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "departments_hospitalId_code_key" ON "departments"("hospitalId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "areas_unitId_code_key" ON "areas"("unitId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_areaId_code_key" ON "rooms"("areaId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_slots_roomId_deviceId_date_startTime_key" ON "assignment_slots"("roomId", "deviceId", "date", "startTime");

-- ===== B-TREE INDEXES =====
CREATE INDEX IF NOT EXISTS "hospital_groups_code_idx" ON "hospital_groups"("code");
CREATE INDEX IF NOT EXISTS "hospitals_code_idx" ON "hospitals"("code");
CREATE INDEX IF NOT EXISTS "assignment_slots_date_idx" ON "assignment_slots"("date");
CREATE INDEX IF NOT EXISTS "assignment_slots_roomId_date_idx" ON "assignment_slots"("roomId", "date");
CREATE INDEX IF NOT EXISTS "assignment_slots_deviceId_date_idx" ON "assignment_slots"("deviceId", "date");
CREATE INDEX IF NOT EXISTS "assignment_slots_status_idx" ON "assignment_slots"("status");
CREATE INDEX IF NOT EXISTS "assignment_slots_assignedTo_idx" ON "assignment_slots"("assignedTo");
CREATE INDEX IF NOT EXISTS "devices_roomId_idx" ON "devices"("roomId");

-- ===== GiST INDEXES FOR LTREE HIERARCHY QUERIES =====
CREATE INDEX IF NOT EXISTS "hospital_groups_path_idx" ON "hospital_groups" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "hospitals_path_idx" ON "hospitals" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "directorates_path_idx" ON "directorates" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "departments_path_idx" ON "departments" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "areas_path_idx" ON "areas" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "rooms_path_idx" ON "rooms" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "devices_path_idx" ON "devices" USING GIST ("path");

-- ===== FOREIGN KEYS =====
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_hospitalId_fkey";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hospitals" DROP CONSTRAINT IF EXISTS "hospitals_groupId_fkey";
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "hospital_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "directorates" DROP CONSTRAINT IF EXISTS "directorates_hospitalId_fkey";
ALTER TABLE "directorates" ADD CONSTRAINT "directorates_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_hospitalId_fkey";
ALTER TABLE "departments" ADD CONSTRAINT "departments_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_directorateId_fkey";
ALTER TABLE "departments" ADD CONSTRAINT "departments_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "directorates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_departmentId_fkey";
ALTER TABLE "units" ADD CONSTRAINT "units_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_hospitalId_fkey";
ALTER TABLE "units" ADD CONSTRAINT "units_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "areas" DROP CONSTRAINT IF EXISTS "areas_unitId_fkey";
ALTER TABLE "areas" ADD CONSTRAINT "areas_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_areaId_fkey";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assignment_slots" DROP CONSTRAINT IF EXISTS "assignment_slots_roomId_fkey";
ALTER TABLE "assignment_slots" ADD CONSTRAINT "assignment_slots_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignment_slots" DROP CONSTRAINT IF EXISTS "assignment_slots_deviceId_fkey";
ALTER TABLE "assignment_slots" ADD CONSTRAINT "assignment_slots_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_roomId_fkey";
ALTER TABLE "devices" ADD CONSTRAINT "devices_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
