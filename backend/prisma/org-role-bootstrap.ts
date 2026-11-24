import { PrismaClient } from '@prisma/client';
import { RbacRolesSeed, RbacPermissionsSeed, RbacRolePermissionSeed } from '../src/modules/rbac/seeds/rbac-seed.data';

const prisma = new PrismaClient();

const TARGET = new Set(['FIELD_SUPERVISOR', 'PROJECT_MANAGER', 'CHIEF_TECHNICIAN', 'HR']);

async function main() {
  const created: Record<string, string> = {};
  const existing = await prisma.role.findMany();
  const existingByName = new Map(existing.map((r) => [r.name as string, r.id]));

  for (const rd of RbacRolesSeed) {
    if (!TARGET.has(rd.name)) continue;
    if (existingByName.has(rd.name)) {
      console.log(`Role exists, keeping: ${rd.name} (${existingByName.get(rd.name)})`);
      created[rd.name] = existingByName.get(rd.name)!;
      continue;
    }
    const role = await prisma.role.create({
      data: {
        name: rd.name as any,
        label: rd.label,
        description: rd.description,
        level: rd.level,
        isSystem: rd.isSystem,
      },
    });
    created[rd.name] = role.id;
    console.log(`Created role: ${rd.name} (${role.id})`);
  }

  for (const rd of RbacRolesSeed) {
    if (!TARGET.has(rd.name)) continue;
    if (!rd.parentName) continue;
    const childId = created[rd.name];
    if (!childId) continue;
    const parent = await prisma.role.findUnique({ where: { name: rd.parentName as any } });
    if (parent) {
      await prisma.role.update({
        where: { id: childId },
        data: { parentId: parent.id },
      });
      console.log(`Linked parent of ${rd.name} -> ${rd.parentName} (${parent.id})`);
    } else {
      console.log(`Parent not found for ${rd.name} -> ${rd.parentName}`);
    }
  }

  for (const pd of RbacPermissionsSeed) {
    await prisma.permission.upsert({
      where: { name: pd.name },
      create: { name: pd.name, label: pd.label, module: pd.module, action: pd.action },
      update: { label: pd.label, module: pd.module, action: pd.action },
    });
  }
  console.log('Ensured all RbacPermissionsSeed permissions exist');

  for (const [roleName, permNames] of Object.entries(RbacRolePermissionSeed)) {
    const roleId = created[roleName];
    if (!roleId) continue;
    for (const permName of permNames) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (!perm) {
        console.log(`  (missing permission, skipped) ${permName}`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        create: { roleId, permissionId: perm.id },
        update: {},
      });
    }
    console.log(`Linked ${permNames.length} permissions for ${roleName}`);
  }

  const targetIds = [...TARGET].map((n) => created[n]).filter(Boolean);
  const idList = targetIds.map((id) => `'${id}'`).join(',');
  await prisma.$queryRawUnsafe(
    `WITH RECURSIVE role_tree AS (
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
     WHERE roles.id = role_tree.id AND roles.id IN (${idList})`,
  );
  console.log('Computed ltree paths for new roles');

  await prisma.$disconnect();
  console.log('DONE');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
