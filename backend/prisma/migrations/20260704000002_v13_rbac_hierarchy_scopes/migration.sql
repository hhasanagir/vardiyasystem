-- Add hierarchy scope columns to user_role_assignments for enterprise RBAC
ALTER TABLE "user_role_assignments" 
  ADD COLUMN IF NOT EXISTS "hospitalGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "hospitalId" TEXT,
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

-- Add foreign keys for hierarchy scope references
ALTER TABLE "user_role_assignments" 
  ADD CONSTRAINT "user_role_assignments_hospitalGroupId_fkey" 
  FOREIGN KEY ("hospitalGroupId") REFERENCES "hospital_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments" 
  ADD CONSTRAINT "user_role_assignments_hospitalId_fkey" 
  FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments" 
  ADD CONSTRAINT "user_role_assignments_departmentId_fkey" 
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for hierarchy scope lookups
CREATE INDEX IF NOT EXISTS "user_role_assignments_hospitalGroupId_idx" 
  ON "user_role_assignments"("hospitalGroupId");
CREATE INDEX IF NOT EXISTS "user_role_assignments_hospitalId_idx" 
  ON "user_role_assignments"("hospitalId");
CREATE INDEX IF NOT EXISTS "user_role_assignments_departmentId_idx" 
  ON "user_role_assignments"("departmentId");
