-- v20: Add FIELD_SUPERVISOR to RbacRoleName enum
-- FIELD_SUPERVISOR was declared in the Prisma schema and seed data but was
-- missing from the actual database enum (the existing DB had only 10 roles).
-- Add it additively so saha sorumlusu (field responsible) is a first-class,
-- unit-scoped role backed by the DB.
ALTER TYPE "RbacRoleName" ADD VALUE IF NOT EXISTS 'FIELD_SUPERVISOR';
