import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ROLE_LEVELS,
  RbacUser,
  RbacRoleName,
  PermissionScope,
} from './interfaces/rbac.types';
import { invalidateJwtUserCache } from '../auth/jwt-cache-invalidation';

const SYSTEM_ADMIN_LEVEL = ROLE_LEVELS.SYSTEM_ADMIN;

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);
  private roleCache: Map<
    string,
    { name: RbacRoleName; level: number; parentId: string | null }
  > = new Map();
  private permissionCache: Map<string, string[]> = new Map();
  private roleLevelByName: Map<string, number> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.warmCache();
  }

  private async warmCache() {
    try {
      const roles = await this.prisma.role.findMany();
      for (const role of roles) {
        this.roleCache.set(role.id, {
          name: role.name as RbacRoleName,
          level: role.level,
          parentId: role.parentId,
        });
        this.roleLevelByName.set(role.name, role.level);
      }
      this.logger.log(`RBAC cache warmed: ${roles.length} roles`);
    } catch (err) {
      this.logger.warn('RBAC tables not available yet, cache stays empty');
    }
  }

  async getUserPermissions(
    userId: string,
    scope?: PermissionScope,
  ): Promise<string[]> {
    const cacheKey = `${userId}:${scope?.organizationId ?? '*'}:${scope?.hospitalGroupId ?? '*'}:${scope?.hospitalId ?? '*'}:${scope?.departmentId ?? '*'}:${scope?.unitId ?? '*'}`;
    const cached = this.permissionCache.get(cacheKey);
    if (cached) return cached;

    let assignments: any[];
    try {
      const where: any = { userId, isActive: true };

      const orConditions: any[] = [];
      if (scope?.hospitalGroupId) {
        orConditions.push(
          { hospitalGroupId: scope.hospitalGroupId },
          { hospitalGroupId: null },
        );
      }
      if (scope?.hospitalId) {
        orConditions.push(
          { hospitalId: scope.hospitalId },
          { hospitalId: null },
        );
      }
      if (scope?.departmentId) {
        orConditions.push(
          { departmentId: scope.departmentId },
          { departmentId: null },
        );
      }
      if (scope?.organizationId) {
        orConditions.push(
          { organizationId: scope.organizationId },
          { organizationId: null },
        );
      }
      if (scope?.unitId) {
        orConditions.push({ unitId: scope.unitId }, { unitId: null });
      }

      if (orConditions.length > 0) {
        where.AND = orConditions.map((cond) => ({
          OR: [
            cond,
            ...Object.keys(cond)
              .filter((k) => cond[k] !== null)
              .map((k) => ({ [k]: null })),
          ],
        }));
        where.AND = [{ OR: orConditions }];
      }

      assignments = await this.prisma.userRoleAssignment.findMany({
        where,
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
              children: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      });
    } catch {
      this.logger.warn('RBAC query failed, returning empty permissions');
      return [];
    }

    const permissionSet = new Set<string>();

    for (const assignment of assignments as any[]) {
      const role = assignment.role;
      for (const rp of role.permissions) {
        permissionSet.add(rp.permission.name);
      }
      for (const child of role.children) {
        const childLevel = this.roleCache.get(child.id);
        if (childLevel && childLevel.level <= role.level) {
          for (const rp of child.permissions) {
            permissionSet.add(rp.permission.name);
          }
        }
      }
    }

    const permissions = Array.from(permissionSet);
    this.permissionCache.set(cacheKey, permissions);
    setTimeout(() => this.permissionCache.delete(cacheKey), 15_000);

    return permissions;
  }

  async getUserRbacRoles(
    userId: string,
  ): Promise<
    {
      roleId: string;
      roleName: RbacRoleName;
      organizationId: string | null;
      hospitalGroupId: string | null;
      hospitalId: string | null;
      departmentId: string | null;
      unitId: string | null;
      level: number;
    }[]
  > {
    try {
      const assignments = await this.prisma.userRoleAssignment.findMany({
        where: { userId, isActive: true },
        include: { role: true },
      });

      return assignments.map((a: any) => ({
        roleId: a.roleId,
        roleName: a.role.name,
        organizationId: a.organizationId,
        hospitalGroupId: a.hospitalGroupId,
        hospitalId: a.hospitalId,
        departmentId: a.departmentId,
        unitId: a.unitId,
        level: a.role.level,
      }));
    } catch {
      return [];
    }
  }

  async getUserMaxRoleLevel(userId: string): Promise<number> {
    const roles = await this.getUserRbacRoles(userId);
    return Math.max(0, ...roles.map((r) => r.level));
  }

  async isSystemAdmin(userId: string): Promise<boolean> {
    return this.hasMinRoleLevel(userId, SYSTEM_ADMIN_LEVEL);
  }

  async hasPermission(
    userId: string,
    permission: string,
    scope?: PermissionScope,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, scope);
    return permissions.includes(permission);
  }

  async hasAnyPermission(
    userId: string,
    permissions: string[],
    scope?: PermissionScope,
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, scope);
    return permissions.some((p) => userPerms.includes(p));
  }

  async hasAllPermissions(
    userId: string,
    permissions: string[],
    scope?: PermissionScope,
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, scope);
    return permissions.every((p) => userPerms.includes(p));
  }

  async hasMinRoleLevel(
    userId: string,
    requiredLevel: number,
  ): Promise<boolean> {
    const roles = await this.getUserRbacRoles(userId);
    return roles.some((r) => r.level >= requiredLevel);
  }

  async hasMinRoleName(
    userId: string,
    requiredRole: RbacRoleName,
  ): Promise<boolean> {
    const requiredLevel = ROLE_LEVELS[requiredRole] ?? 0;
    return this.hasMinRoleLevel(userId, requiredLevel);
  }

  async enrichUserWithPermissions(user: any): Promise<RbacUser> {
    const rbacRoles = await this.getUserRbacRoles(user.id);
    const permissions = await this.getUserPermissions(user.id, {
      organizationId: user.organizationId,
      unitId: user.unitId,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      unitId: user.unitId,
      rbacRoles,
      permissions,
    };
  }

  private legacyRoleToRbacName(legacyRole: string): RbacRoleName {
    const mapping: Record<string, RbacRoleName> = {
      system_admin: 'SYSTEM_ADMIN' as RbacRoleName,
      hospital_admin: 'HOSPITAL_ADMIN' as RbacRoleName,
      imaging_director: 'IMAGING_DIRECTOR' as RbacRoleName,
      supervisor: 'SUPERVISOR' as RbacRoleName,
      medical_engineer: 'MEDICAL_ENGINEER' as RbacRoleName,
      senior_technician: 'SENIOR_TECHNICIAN' as RbacRoleName,
      technician: 'TECHNICIAN' as RbacRoleName,
      assistant_technician: 'ASSISTANT_TECHNICIAN' as RbacRoleName,
      secretary: 'SECRETARY' as RbacRoleName,
      guest: 'GUEST' as RbacRoleName,
    };
    return mapping[legacyRole] || ('GUEST' as RbacRoleName);
  }

  async ensureUserHasRbacRole(
    userId: string,
    legacyRole: string,
    scope?: PermissionScope,
  ): Promise<void> {
    const existingAssignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId, isActive: true },
    });
    if (existingAssignments.length > 0) return;

    const rbacRoleName = this.legacyRoleToRbacName(legacyRole);
    const role = await this.prisma.role.findUnique({
      where: { name: rbacRoleName },
    });
    if (!role) {
      this.logger.warn(`No RBAC role found for ${rbacRoleName}`);
      return;
    }

    await this.prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId: role.id,
        assignedBy: 'system',
        organizationId: scope?.organizationId ?? null,
        hospitalGroupId: scope?.hospitalGroupId ?? null,
        hospitalId: scope?.hospitalId ?? null,
        departmentId: scope?.departmentId ?? null,
        unitId: scope?.unitId ?? null,
      },
    });
    this.logger.log(
      `Auto-assigned RBAC role ${rbacRoleName} to user ${userId}`,
    );
    this.invalidateUserCache(userId);
  }

  invalidateUserCache(userId?: string): void {
    if (userId) {
      for (const key of this.permissionCache.keys()) {
        if (key.startsWith(userId)) this.permissionCache.delete(key);
      }
    } else {
      this.permissionCache.clear();
    }
  }

  async assignRoleToUser(
    userId: string,
    roleId: string,
    assignedBy: string,
    scope?: PermissionScope,
  ): Promise<void> {
    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        roleId,
        organizationId: scope?.organizationId ?? null,
        hospitalGroupId: scope?.hospitalGroupId ?? null,
        hospitalId: scope?.hospitalId ?? null,
        departmentId: scope?.departmentId ?? null,
        unitId: scope?.unitId ?? null,
      },
    });

    if (existing) {
      await this.prisma.userRoleAssignment.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    } else {
      await this.prisma.userRoleAssignment.create({
        data: {
          userId,
          roleId,
          assignedBy,
          organizationId: scope?.organizationId ?? null,
          hospitalGroupId: scope?.hospitalGroupId ?? null,
          hospitalId: scope?.hospitalId ?? null,
          departmentId: scope?.departmentId ?? null,
          unitId: scope?.unitId ?? null,
        },
      });
    }

    this.invalidateUserCache(userId);
    invalidateJwtUserCache(userId);
  }

  async removeRoleFromUser(
    userId: string,
    roleId: string,
    scope?: PermissionScope,
  ): Promise<void> {
    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        roleId,
        organizationId: scope?.organizationId ?? null,
        hospitalGroupId: scope?.hospitalGroupId ?? null,
        hospitalId: scope?.hospitalId ?? null,
        departmentId: scope?.departmentId ?? null,
        unitId: scope?.unitId ?? null,
        isActive: true,
      },
    });

    if (existing) {
      await this.prisma.userRoleAssignment.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    this.invalidateUserCache(userId);
    invalidateJwtUserCache(userId);
  }

  async getAvailableRoles(): Promise<
    {
      id: string;
      name: RbacRoleName;
      label: string;
      level: number;
      parentId: string | null;
    }[]
  > {
    return this.prisma.role.findMany({
      orderBy: { level: 'desc' },
      select: {
        id: true,
        name: true,
        label: true,
        level: true,
        parentId: true,
      },
    });
  }

  async getAllPermissions(): Promise<
    {
      id: string;
      name: string;
      label: string;
      module: string;
      action: string;
    }[]
  > {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const rps = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rps.map((rp: any) => rp.permission.name);
  }

  async updateRolePermissions(
    roleId: string,
    permissionNames: string[],
  ): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: permissionNames } },
    });

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissions.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissions.map((p: any) => ({ roleId, permissionId: p.id })),
      });
    }

    this.permissionCache.clear();
  }

  async getPermissionMatrix(): Promise<
    { role: string; label: string; permissions: Record<string, boolean> }[]
  > {
    const roles = await this.prisma.role.findMany({
      orderBy: { level: 'desc' },
    });
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    const rps = await this.prisma.rolePermission.findMany();

    const rpSet = new Set(
      rps.map((rp: any) => `${rp.roleId}:${rp.permissionId}`),
    );

    return roles.map((role: any) => {
      const permMap: Record<string, boolean> = {};
      for (const perm of permissions) {
        permMap[perm.name] = rpSet.has(`${role.id}:${perm.id}`);
      }
      return { role: role.name, label: role.label, permissions: permMap };
    });
  }
}
