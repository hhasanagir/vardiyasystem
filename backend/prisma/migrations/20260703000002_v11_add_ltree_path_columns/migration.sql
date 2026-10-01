-- V11: Add ltree path columns for hierarchy queries
-- Enables efficient ancestry/descendant/subtree queries via ltree operators.

-- Add path column to roles table
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "path" ltree;

-- Add path column to units table
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "path" ltree;

-- Create GiST indexes for ltree path columns
CREATE INDEX IF NOT EXISTS "roles_path_idx" ON "roles" USING GIST ("path");
CREATE INDEX IF NOT EXISTS "units_path_idx" ON "units" USING GIST ("path");

-- Populate path for existing roles based on parent hierarchy
WITH RECURSIVE role_tree AS (
  SELECT id, text2ltree(name::text) AS path
  FROM roles
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT r.id, rt.path || replace(r.name::text, '-', '_')
  FROM roles r
  INNER JOIN role_tree rt ON r."parentId" = rt.id
)
UPDATE roles SET path = role_tree.path
FROM role_tree
WHERE roles.id = role_tree.id;

-- Populate path for existing units: organization_code.unit_code
-- Hyphens in org codes are replaced with underscores (ltree labels: [A-Za-z0-9_]+)
UPDATE units
SET path = text2ltree(
  replace((SELECT o.code FROM organizations o WHERE o.id = units."organizationId"), '-', '_')
  || '.' || units.code
)
WHERE "organizationId" IS NOT NULL;
