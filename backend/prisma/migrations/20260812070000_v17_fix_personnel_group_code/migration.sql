-- PersonnelGroup.code artık birim bazında benzersiz (küresel unique yerine)
DROP INDEX IF EXISTS "personnel_groups_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "personnel_groups_unitId_code_key"
  ON "personnel_groups" ("unitId", "code");
