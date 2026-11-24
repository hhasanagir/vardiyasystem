-- Attach tenant-scoped user accounts to a unit so their tenant is not NULL.
--
-- `TenantContextInterceptor` derives the tenant from `user.organizationId`.
-- A user row with organizationId = NULL therefore gets NO tenant filtering at
-- all: `TenantMiddleware` cannot inject the predicate, so every Prisma read and
-- write runs unscoped across every tenant. That is acceptable for the roles
-- that are cross-tenant BY DESIGN (system_admin, hospital_admin) and is a
-- cross-tenant data exposure for every other role.
--
-- The unit is chosen by role using the tenant's own unit vocabulary and the
-- organization is always derived from that unit, never set independently:
--   oversight roles (imaging_director, supervisor, medical_engineer, chief
--   technician, project_manager, hr, secretary, guest, field_supervisor)
--     -> the 'supervizor' desk, the organisation-wide unit
--   clinical technical roles (senior_technician, technician,
--   assistant_technician) -> 'mr', the tenant's largest modality
--
-- Only `field_supervisor` is confined to a single unit (see UnitScopeService),
-- so for every other role the unit is informational and visibility stays
-- organisation-scoped. A role is only ever attached to a unit that actually
-- exists, and the statements are idempotent: cross-tenant roles and rows that
-- are already attached are left untouched.

UPDATE "users" AS usr
SET "unitId" = u."id",
    "organizationId" = u."organizationId"
FROM "units" AS u
WHERE usr."unitId" IS NULL
  AND usr."role" IN (
    'imaging_director', 'supervisor', 'field_supervisor', 'project_manager',
    'chief_technician', 'medical_engineer', 'hr', 'secretary', 'guest'
  )
  AND u."type" = 'supervizor'
  AND u."organizationId" IS NOT NULL;

UPDATE "users" AS usr
SET "unitId" = u."id",
    "organizationId" = u."organizationId"
FROM "units" AS u
WHERE usr."unitId" IS NULL
  AND usr."role" IN ('senior_technician', 'technician', 'assistant_technician')
  AND u."type" = 'mr'
  AND u."organizationId" IS NOT NULL;
