/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
// Prisma doubles are untyped on purpose: they emulate query payloads rather
// than domain types. JWT cache invalidators must not escape into other tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RbacService } from '../rbac.service';

vi.mock('../../auth/jwt-cache-invalidation', () => ({ invalidateJwtUserCache: vi.fn() }));

/**
 * Coverage wave 2 — read models, permission cache and legacy role bootstrap.
 * Dominance/guard/scope tests in `rbac-enterprise`, `5c12-ownership-hardening`
 * and the `unit-scope-*` specs are not repeated here.
 */
describe('RbacService behaviour (coverage wave 2)', () => {
  let service: RbacService;
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      role: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      permission: { findMany: vi.fn().mockResolvedValue([]) },
      rolePermission: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-assignment' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new RbacService(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('read models', () => {
    it('lists roles ordered by level with the canonical select', async () => {
      const roles = [{ id: 'r-1', name: 'SYSTEM_ADMIN', label: 'System Admin', level: 1000, parentId: null }];
      prisma.role.findMany.mockResolvedValue(roles);

      await expect(service.getAvailableRoles()).resolves.toEqual(roles);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        orderBy: { level: 'desc' },
        select: { id: true, name: true, label: true, level: true, parentId: true },
      });
    });

    it('lists permissions ordered by module then action', async () => {
      const permissions = [{ id: 'p-1', name: 'schedule.read', label: 'Read', module: 'schedule', action: 'read' }];
      prisma.permission.findMany.mockResolvedValue(permissions);

      await expect(service.getAllPermissions()).resolves.toEqual(permissions);
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      });
    });

    it('flattens role permissions to names', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { name: 'schedule.read' } },
        { permission: { name: 'schedule.update' } },
      ]);

      await expect(service.getRolePermissions('r-1')).resolves.toEqual([
        'schedule.read', 'schedule.update',
      ]);
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: 'r-1' }, include: { permission: true },
      });
    });

    it('builds the {role,label,permissions:{name:boolean}} matrix from rolePermission rows', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 'r-admin', name: 'SYSTEM_ADMIN', label: 'Admin', level: 1000 },
        { id: 'r-tech', name: 'TECHNICIAN', label: 'Technician', level: 200 },
      ]);
      prisma.permission.findMany.mockResolvedValue([
        { id: 'p-read', name: 'schedule.read' },
        { id: 'p-delete', name: 'schedule.delete' },
      ]);
      prisma.rolePermission.findMany.mockResolvedValue([
        { roleId: 'r-admin', permissionId: 'p-read' },
        { roleId: 'r-admin', permissionId: 'p-delete' },
        { roleId: 'r-tech', permissionId: 'p-read' },
      ]);

      await expect(service.getPermissionMatrix()).resolves.toEqual([
        {
          role: 'SYSTEM_ADMIN', label: 'Admin',
          permissions: { 'schedule.read': true, 'schedule.delete': true },
        },
        {
          role: 'TECHNICIAN', label: 'Technician',
          permissions: { 'schedule.read': true, 'schedule.delete': false },
        },
      ]);
    });
  });

  describe('getUserPermissions', () => {
    it('builds the five optional scope OR groups into the assignment query', async () => {
      await service.getUserPermissions('u-1', {
        organizationId: 'org-1', hospitalGroupId: 'g-1', hospitalId: 'h-1',
        departmentId: 'd-1', unitId: 'u-1',
      });

      expect(prisma.userRoleAssignment.findMany.mock.calls[0][0].where).toEqual({
        userId: 'u-1',
        isActive: true,
        AND: [{
          OR: [
            { hospitalGroupId: 'g-1' }, { hospitalGroupId: null },
            { hospitalId: 'h-1' }, { hospitalId: null },
            { departmentId: 'd-1' }, { departmentId: null },
            { organizationId: 'org-1' }, { organizationId: null },
            { unitId: 'u-1' }, { unitId: null },
          ],
        }],
      });
    });

    it('inherits child permissions only when the child level is not above the role level', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 'r-parent', name: 'SUPERVISOR', level: 500, parentId: null },
        { id: 'r-low', name: 'TECHNICIAN', level: 200, parentId: 'r-parent' },
        { id: 'r-high', name: 'SYSTEM_ADMIN', level: 1000, parentId: 'r-parent' },
      ]);
      await service.onModuleInit();
      prisma.userRoleAssignment.findMany.mockResolvedValue([{
        role: {
          level: 500,
          permissions: [{ permission: { name: 'base.read' } }],
          children: [
            { id: 'r-low', permissions: [{ permission: { name: 'child.low' } }] },
            { id: 'r-high', permissions: [{ permission: { name: 'child.high' } }] },
          ],
        },
      }]);

      await expect(service.getUserPermissions('u-1')).resolves.toEqual(['base.read', 'child.low']);
    });

    it('caches by full scope key and serves a repeated call without a new query', async () => {
      await service.getUserPermissions('u-1', { organizationId: 'org-1' });
      await service.getUserPermissions('u-1', { organizationId: 'org-1' });
      await service.getUserPermissions('u-1', { organizationId: 'org-2' });

      expect(prisma.userRoleAssignment.findMany).toHaveBeenCalledTimes(2);
      expect(Array.from((service as any).permissionCache.keys())).toContain('u-1:org-1:*:*:*:*');
    });

    it('expires the cache entry after 15 seconds', async () => {
      vi.useFakeTimers();
      await service.getUserPermissions('u-1', { organizationId: 'org-1' });
      vi.advanceTimersByTime(15_000);
      await service.getUserPermissions('u-1', { organizationId: 'org-1' });

      expect(prisma.userRoleAssignment.findMany).toHaveBeenCalledTimes(2);
    });

    it('fails closed and caches nothing when the RBAC query rejects', async () => {
      prisma.userRoleAssignment.findMany.mockRejectedValue(new Error('db unavailable'));

      await expect(service.getUserPermissions('u-1')).resolves.toEqual([]);
      expect((service as any).permissionCache.size).toBe(0);
    });
  });

  describe('ensureUserHasRbacRole', () => {
    it('maps the legacy system_admin role to SYSTEM_ADMIN and creates a scoped assignment', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r-sys' });
      (service as any).permissionCache.set('u-9:org-1:*:*:*:*', ['schedule.read']);

      await service.ensureUserHasRbacRole('u-9', 'system_admin', {
        organizationId: 'org-1', unitId: 'u-1',
      });

      expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'SYSTEM_ADMIN' } });
      expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
        data: {
          userId: 'u-9', roleId: 'r-sys', assignedBy: 'system',
          organizationId: 'org-1', hospitalGroupId: null, hospitalId: null,
          departmentId: null, unitId: 'u-1',
        },
      });
      expect((service as any).permissionCache.size).toBe(0);
    });

    it('maps an unknown legacy role to GUEST', async () => {
      await service.ensureUserHasRbacRole('u-9', 'not_a_role');

      expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'GUEST' } });
    });

    it('does not write when the user already has an active assignment', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ id: 'existing' }]);

      await service.ensureUserHasRbacRole('u-9', 'system_admin');

      expect(prisma.role.findUnique).not.toHaveBeenCalled();
      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    });

    it('does not write when no matching RBAC role row exists', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await service.ensureUserHasRbacRole('u-9', 'technician');

      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('invalidateUserCache', () => {
    it('removes only the given user prefix, then clears everything without an argument', () => {
      const cache = (service as any).permissionCache as Map<string, string[]>;
      cache.set('u-1:org-A:*:*:*:*', ['a']);
      cache.set('u-1:org-B:*:*:*:*', ['b']);
      cache.set('u-2:org-A:*:*:*:*', ['c']);

      service.invalidateUserCache('u-1');
      expect(Array.from(cache.keys())).toEqual(['u-2:org-A:*:*:*:*']);

      service.invalidateUserCache();
      expect(cache.size).toBe(0);
    });
  });
});
