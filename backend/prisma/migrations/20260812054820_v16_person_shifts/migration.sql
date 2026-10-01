-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('device', 'person');

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_deviceId_fkey";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "kind" "AssignmentKind" NOT NULL DEFAULT 'device',
ADD COLUMN     "personnelGroupId" TEXT,
ADD COLUMN     "shiftTemplateId" TEXT,
ADD COLUMN     "unitId" TEXT,
ALTER COLUMN "deviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "personnel" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "personnel_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_shift_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "unitId" TEXT NOT NULL,
    "personnelGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personnel_groups_unitId_idx" ON "personnel_groups"("unitId");

-- CreateIndex
CREATE INDEX "personnel_groups_isActive_idx" ON "personnel_groups"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_groups_code_key" ON "personnel_groups"("code");

-- CreateIndex
CREATE INDEX "person_shift_templates_unitId_idx" ON "person_shift_templates"("unitId");

-- CreateIndex
CREATE INDEX "person_shift_templates_personnelGroupId_idx" ON "person_shift_templates"("personnelGroupId");

-- CreateIndex
CREATE INDEX "person_shift_templates_isActive_idx" ON "person_shift_templates"("isActive");

-- CreateIndex
CREATE INDEX "assignments_unitId_idx" ON "assignments"("unitId");

-- CreateIndex
CREATE INDEX "assignments_personnelGroupId_idx" ON "assignments"("personnelGroupId");

-- CreateIndex
CREATE INDEX "assignments_kind_idx" ON "assignments"("kind");

-- CreateIndex
CREATE INDEX "personnel_groupId_idx" ON "personnel"("groupId");

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "personnel_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_groups" ADD CONSTRAINT "personnel_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_groups" ADD CONSTRAINT "personnel_groups_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_shift_templates" ADD CONSTRAINT "person_shift_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_shift_templates" ADD CONSTRAINT "person_shift_templates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_shift_templates" ADD CONSTRAINT "person_shift_templates_personnelGroupId_fkey" FOREIGN KEY ("personnelGroupId") REFERENCES "personnel_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_personnelGroupId_fkey" FOREIGN KEY ("personnelGroupId") REFERENCES "personnel_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "person_shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "assignments_scheduleId_deviceId_date_shiftType_personnelType_ke" RENAME TO "assignments_scheduleId_deviceId_date_shiftType_personnelTyp_key";

-- Person shift slot uniqueness: at most one person-shift per (schedule, date, shiftType, personnelGroupId)
CREATE UNIQUE INDEX "assignments_person_shift_slot_key"
  ON "assignments"("scheduleId", "date", "shiftType", "personnelGroupId")
  WHERE "kind" = 'person' AND "personnelGroupId" IS NOT NULL;
