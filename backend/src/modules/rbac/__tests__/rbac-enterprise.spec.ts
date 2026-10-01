import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScopeResolutionService } from '../services/scope-resolution.service';
import { RbacService } from '../rbac.service';
import { PrismaService } from '../../../prisma.service';

describe('RbacEnterprise', () => {
  describe('ScopeResolutionService', () => {
    let service: ScopeResolutionService;
    const mockPrisma = {
      userRoleAssignment: {
        findMany: vi.fn(),
      },
    };

    beforeEach(async () => {
      mockPrisma.userRoleAssignment.findMany.mockReset();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScopeResolutionService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();
      service = module.get(ScopeResolutionService);
    });

    const mockAssignments = [
      {
        roleId: 'role-1',
        userId: 'user-1',
        organizationId: null,
        hospitalGroupId: 'group-1',
        hospitalId: null,
        departmentId: null,
        unitId: null,
      },
      {
        roleId: 'role-2',
        userId: 'user-1',
        organizationId: null,
        hospitalGroupId: null,
        hospitalId: 'hospital-1',
        departmentId: null,
        unitId: null,
      },
      {
        roleId: 'role-3',
        userId: 'user-1',
        organizationId: null,
        hospitalGroupId: null,
        hospitalId: null,
        departmentId: 'dept-1',
        unitId: null,
      },
      {
        roleId: 'role-4',
        userId: 'user-1',
        organizationId: null,
        hospitalGroupId: null,
        hospitalId: null,
        departmentId: null,
        unitId: 'unit-1',
      },
    ];

    it('should resolve group-level assignments covering hospitals in the group', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        hospitalGroupId: 'group-1',
        hospitalId: 'hospital-1',
      });
      expect(covering).toHaveLength(2);
      expect(covering.map((a) => a.roleId)).toContain('role-1');
      expect(covering.map((a) => a.roleId)).toContain('role-2');
    });

    it('should resolve hospital-level assignments covering units', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        hospitalId: 'hospital-1',
        unitId: 'unit-1',
      });
      expect(covering).toHaveLength(2);
      expect(covering.map((a) => a.roleId)).toContain('role-2');
      expect(covering.map((a) => a.roleId)).toContain('role-4');
    });

    it('should resolve department-level assignments covering units', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        departmentId: 'dept-1',
        unitId: 'unit-1',
      });
      expect(covering).toHaveLength(2);
      expect(covering.map((a) => a.roleId)).toContain('role-3');
      expect(covering.map((a) => a.roleId)).toContain('role-4');
    });

    it('should not resolve assignments for non-matching scopes', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        hospitalGroupId: 'group-2',
      });
      expect(covering).toHaveLength(0);
    });

    it('should resolve direct unit-level assignment', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        unitId: 'unit-1',
      });
      expect(covering).toHaveLength(1);
      expect(covering[0].roleId).toBe('role-4');
    });

    it('should return empty for non-matching unit', () => {
      const covering = service.resolveCoveringAssignments(mockAssignments, {
        unitId: 'unit-999',
      });
      expect(covering).toHaveLength(0);
    });

    it('should correctly identify scope levels', () => {
      expect(service.getScopeLevel(mockAssignments[0])).toBe('group');
      expect(service.getScopeLevel(mockAssignments[1])).toBe('hospital');
      expect(service.getScopeLevel(mockAssignments[2])).toBe('department');
      expect(service.getScopeLevel(mockAssignments[3])).toBe('unit');
    });
  });

  describe('RbacService hierarchy scope methods', () => {
    let service: RbacService;
    const mockPrisma = {
      role: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
      },
      userRoleAssignment: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      rolePermission: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      permission: {
        findMany: vi.fn(),
      },
    };

    beforeEach(async () => {
      mockPrisma.role.findMany.mockReset();
      mockPrisma.role.findUnique.mockReset();
      mockPrisma.userRoleAssignment.findMany.mockReset();
      mockPrisma.userRoleAssignment.findFirst.mockReset();
      mockPrisma.userRoleAssignment.create.mockReset();
      mockPrisma.userRoleAssignment.update.mockReset();
      mockPrisma.rolePermission.findMany.mockReset();
      mockPrisma.permission.findMany.mockReset();

      mockPrisma.role.findMany.mockResolvedValue([]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RbacService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();
      service = module.get(RbacService);
    });

    it('should assign role with hierarchy scope', async () => {
      mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.userRoleAssignment.create.mockResolvedValue({
        id: 'new-assignment',
      });

      await service.assignRoleToUser('user-1', 'role-1', 'admin', {
        hospitalId: 'hospital-1',
        departmentId: 'dept-1',
      });

      expect(mockPrisma.userRoleAssignment.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          roleId: 'role-1',
          assignedBy: 'admin',
          organizationId: null,
          hospitalGroupId: null,
          hospitalId: 'hospital-1',
          departmentId: 'dept-1',
          unitId: null,
        },
      });
    });

    it('should reactivate existing role assignment', async () => {
      mockPrisma.userRoleAssignment.findFirst.mockResolvedValue({
        id: 'existing',
        isActive: false,
      });
      mockPrisma.userRoleAssignment.update.mockResolvedValue({
        id: 'existing',
        isActive: true,
      });

      await service.assignRoleToUser('user-1', 'role-1', 'admin', {
        hospitalGroupId: 'group-1',
      });

      expect(mockPrisma.userRoleAssignment.update).toHaveBeenCalledWith({
        where: { id: 'existing' },
        data: { isActive: true },
      });
    });

    it('should remove role assignment with hierarchy scope', async () => {
      mockPrisma.userRoleAssignment.findFirst.mockResolvedValue({
        id: 'existing',
        isActive: true,
      });
      mockPrisma.userRoleAssignment.update.mockResolvedValue({
        id: 'existing',
        isActive: false,
      });

      await service.removeRoleFromUser('user-1', 'role-1', {
        hospitalGroupId: 'group-1',
        hospitalId: 'hospital-1',
      });

      expect(mockPrisma.userRoleAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          roleId: 'role-1',
          organizationId: null,
          hospitalGroupId: 'group-1',
          hospitalId: 'hospital-1',
          departmentId: null,
          unitId: null,
          isActive: true,
        },
      });
    });

    it('should get user RBAC roles with hierarchy scopes', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        {
          roleId: 'role-1',
          role: { name: 'HOSPITAL_DIRECTOR', level: 600 },
          organizationId: null,
          hospitalGroupId: null,
          hospitalId: 'hospital-1',
          departmentId: null,
          unitId: null,
        },
      ]);

      const roles = await service.getUserRbacRoles('user-1');
      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({
        roleName: 'HOSPITAL_DIRECTOR',
        hospitalId: 'hospital-1',
      });
    });
  });
});
