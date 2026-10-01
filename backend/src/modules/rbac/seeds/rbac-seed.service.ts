import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import {
  RbacRolesSeed,
  RbacPermissionsSeed,
  RbacRolePermissionSeed,
} from './rbac-seed.data';

@Injectable()
export class RbacSeedService {
  private readonly logger = new Logger(RbacSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed() {
    try {
      const existingRoles = await this.prisma.role.count();
      if (existingRoles > 0) {
        this.logger.log('RBAC data already seeded, skipping.');
        return;
      }
    } catch {
      this.logger.warn('RBAC tables not available yet, skipping seed');
      return;
    }

    this.logger.log('Seeding RBAC roles and permissions...');
    const roles = await this.prisma.$transaction(
      async (tx: any) => {
        const createdRoles: Record<string, string> = {};
        for (const roleData of RbacRolesSeed) {
          const role = await tx.role.create({
            data: {
              name: roleData.name as any,
              label: roleData.label,
              description: roleData.description,
              level: roleData.level,
              isSystem: roleData.isSystem,
            },
          });
          createdRoles[roleData.name] = role.id;
        }

        for (const roleData of RbacRolesSeed) {
          if (roleData.parentName && createdRoles[roleData.parentName]) {
            await tx.role.update({
              where: { id: createdRoles[roleData.name] },
              data: { parentId: createdRoles[roleData.parentName] },
            });
          }
        }

        const permissionIds: Record<string, string> = {};
        for (const permData of RbacPermissionsSeed) {
          const perm = await tx.permission.upsert({
            where: { name: permData.name },
            create: {
              name: permData.name,
              label: permData.label,
              module: permData.module,
              action: permData.action,
            },
            update: {
              label: permData.label,
              module: permData.module,
              action: permData.action,
            },
          });
          permissionIds[permData.name] = perm.id;
        }

        for (const [roleName, permNames] of Object.entries(
          RbacRolePermissionSeed,
        )) {
          const roleId = createdRoles[roleName];
          if (!roleId) continue;

          const rpData = permNames
            .filter((pn) => permissionIds[pn])
            .map((pn) => ({
              roleId,
              permissionId: permissionIds[pn],
            }));

          if (rpData.length > 0) {
            await tx.rolePermission.createMany({
              data: rpData,
              skipDuplicates: true,
            });
          }
        }

        return createdRoles;
      },
      { timeout: 60000 },
    );

    this.logger.log(
      `Seeded ${Object.keys(roles).length} roles with ${RbacPermissionsSeed.length} permissions`,
    );

    await this.computeRolePaths();
  }

  private async computeRolePaths(): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(
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
         WHERE roles.id = role_tree.id AND roles.path IS NULL`,
      );
      this.logger.log('Computed ltree paths for roles');
    } catch (err) {
      this.logger.warn(
        'Failed to compute role paths (ltree may not be available)',
      );
    }
  }
}
