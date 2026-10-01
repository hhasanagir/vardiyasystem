-- Add deviceId and personnelType columns to shifts for device-specific/personnel-type shift definitions
ALTER TABLE "shifts" 
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "personnelType" TEXT DEFAULT 'technician';

-- Add foreign key for device reference
ALTER TABLE "shifts" 
  ADD CONSTRAINT "shifts_deviceId_fkey" 
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for device-specific shift lookups
CREATE INDEX IF NOT EXISTS "shifts_deviceId_idx" 
  ON "shifts"("deviceId");
