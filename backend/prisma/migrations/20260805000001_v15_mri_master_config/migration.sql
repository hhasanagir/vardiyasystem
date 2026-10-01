-- v15: MRI master configuration support
-- 1) Shift template metadata (immutable master templates, shared block shifts, optional weekend/holiday shifts)
ALTER TABLE "shifts" ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shifts" ADD COLUMN "blockId" TEXT;
ALTER TABLE "shifts" ADD COLUMN "optionalOnWeekends" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shifts" ADD COLUMN "optionalOnHolidays" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "shifts_blockId_idx" ON "shifts"("blockId");

-- 2) Device block grouping + master flag
ALTER TABLE "devices" ADD COLUMN "blockCode" TEXT;
ALTER TABLE "devices" ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT false;

-- 3) Assignment personnelType discriminator so a device can have technician + assistant
--    shifts of the same shiftType on the same day (e.g. day technician 08:00-20:00 and
--    day assistant 08:00-20:00 in B/C blocks).
ALTER TABLE "assignments" ADD COLUMN "personnelType" TEXT NOT NULL DEFAULT 'technician';
DROP INDEX "assignments_scheduleId_deviceId_date_shiftType_key";
CREATE UNIQUE INDEX "assignments_scheduleId_deviceId_date_shiftType_personnelType_key"
  ON "assignments"("scheduleId", "deviceId", "date", "shiftType", "personnelType");

-- 4) Field Supervisor per-date overrides for optional weekend/holiday assistant shifts
CREATE TABLE "shift_date_overrides" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_date_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shift_date_overrides_shiftId_date_key" ON "shift_date_overrides"("shiftId", "date");
CREATE INDEX "shift_date_overrides_date_idx" ON "shift_date_overrides"("date");
ALTER TABLE "shift_date_overrides" ADD CONSTRAINT "shift_date_overrides_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
