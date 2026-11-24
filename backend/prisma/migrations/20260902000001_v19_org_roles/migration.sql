-- v19: Add organizational roles (PROJECT_MANAGER, CHIEF_TECHNICIAN, HR)
-- Additive enum extensions. Uses ADD VALUE IF NOT EXISTS for idempotency.

-- Extend RbacRoleName enum (roles table)
ALTER TYPE "RbacRoleName" ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';
ALTER TYPE "RbacRoleName" ADD VALUE IF NOT EXISTS 'CHIEF_TECHNICIAN';
ALTER TYPE "RbacRoleName" ADD VALUE IF NOT EXISTS 'HR';

-- Extend UserRole enum (users.role)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'project_manager';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'chief_technician';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'hr';
