-- v21: Phase 5C.7 — Supervisor RBAC hierarchy & scope alignment (additive, reversible)
--
-- E. SUPERVISOR inherits from CHIEF_TECHNICIAN (was IMAGING_DIRECTOR).
-- F. SUPERVISOR gains the 4 schedule-workflow permissions it was missing vs seed (42 -> 46).
-- G. Bind the 3 legacy "orphan" supervisors (users.role=supervisor with no active RBAC
--    assignment) to an active, ORG-SCOPED SUPERVISOR role assignment (unitId = NULL so a
--    supervisor keeps broad operational scope, never a single unitId).
--
-- No schema change, no destructive op, no role/permission/user deletion.

-- ============================================================
-- Part E — Re-parent SUPERVISOR under CHIEF_TECHNICIAN and recompute ltree paths
-- ============================================================
UPDATE "roles"
   SET "parentId" = '54ee9134-90ac-4537-bf3f-e868768c056d'  -- CHIEF_TECHNICIAN
 WHERE name = 'SUPERVISOR'
   AND "parentId" IS DISTINCT FROM '54ee9134-90ac-4537-bf3f-e868768c056d';

-- Recompute ltree paths for the whole role tree from the root (idempotent given parent links).
WITH RECURSIVE role_tree AS (
  SELECT id, text2ltree(name::text) AS path
  FROM "roles"
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT r.id, rt.path || replace(r.name::text, '-', '_')
  FROM "roles" r
  INNER JOIN role_tree rt ON r."parentId" = rt.id
)
UPDATE "roles" SET path = role_tree.path
FROM role_tree
WHERE "roles".id = role_tree.id;

-- ============================================================
-- Part F — Add the 4 missing schedule-workflow permissions to SUPERVISOR (46 total)
-- ============================================================
INSERT INTO role_permissions ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'SUPERVISOR'
  AND p.name IN ('schedule.generate', 'schedule.validate', 'schedule.submit', 'schedule.override')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- ============================================================
-- Part G — Bind the 3 orphan supervisors to active org-scoped SUPERVISOR assignments
-- ============================================================
INSERT INTO user_role_assignments ("id", "userId", "roleId", "organizationId", "unitId", "assignedBy", "isActive", "createdAt")
SELECT
  gen_random_uuid()::text,
  u.id,
  'a879f500-7c01-45cd-b881-8754c21b072d',  -- SUPERVISOR
  u."organizationId",                      -- keep legacy org (991dd0a2-...)
  NULL,                                    -- org-scoped, NOT unit-scoped
  'migration-v21',
  true,
  now()
FROM "users" u
WHERE u.role = 'supervisor'
  AND u.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_role_assignments ura
    WHERE ura."userId" = u.id AND ura."isActive" = true
  )
  AND u."organizationId" IS NOT NULL;
