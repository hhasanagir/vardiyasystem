import { Test, TestingModule } from '@nestjs/testing';
import { RbacRoleName } from '@prisma/client';
import { HierarchyService } from '../hierarchy.service';
import { PrismaService } from '../../../prisma.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * D21: the fixtures below used to be untyped string literals naming roles that
 * migration 17 deleted (ORGANIZATION_ADMIN, HOSPITAL_DIRECTOR, IMAGING_MANAGER,
 * READ_ONLY_AUDITOR). Because they were never typed as the enum, removing those
 * values broke nothing at compile time and quietly turned the assertions into
 * fiction. Paths are now built from the `RbacRoleName` enum, so any future enum
 * change fails the build instead of passing silently.
 */
const rolePath = (...segments: RbacRoleName[]): string => segments.join('.');

type RoleNode = { id: string; name: RbacRoleName; path: string };
type RoleRow = RoleNode & { depth: number };

describe('HierarchyService', () => {
  let service: HierarchyService;

  const mockQueryRaw = vi.fn();

  const mockPrisma = {
    $queryRawUnsafe: mockQueryRaw,
  };

  beforeEach(async () => {
    mockQueryRaw.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HierarchyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HierarchyService>(HierarchyService);
  });

  describe('getAncestors', () => {
    it('should return ancestors excluding self', async () => {
      const mockResult: RoleRow[] = [
        {
          id: 'root-1',
          name: RbacRoleName.SYSTEM_ADMIN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN),
          depth: 1,
        },
        {
          id: 'org-1',
          name: RbacRoleName.HOSPITAL_ADMIN,
          path: rolePath(
            RbacRoleName.SYSTEM_ADMIN,
            RbacRoleName.HOSPITAL_ADMIN,
          ),
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const leaf = rolePath(
        RbacRoleName.SYSTEM_ADMIN,
        RbacRoleName.HOSPITAL_ADMIN,
        RbacRoleName.IMAGING_DIRECTOR,
      );
      const result = await service.getAncestors('roles', leaf);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockQueryRaw).toHaveBeenCalledWith(
        expect.stringContaining('@>'),
        leaf,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDescendants', () => {
    it('should return descendants excluding self', async () => {
      const mockResult: RoleRow[] = [
        {
          id: 'child-1',
          name: RbacRoleName.TECHNICIAN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.TECHNICIAN),
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getDescendants(
        'roles',
        rolePath(RbacRoleName.SYSTEM_ADMIN),
        2,
      );

      expect(mockQueryRaw).toHaveBeenCalledWith(
        expect.stringContaining('<@'),
        rolePath(RbacRoleName.SYSTEM_ADMIN),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDescendantsIncludingSelf', () => {
    it('should return descendants including self', async () => {
      const mockResult: RoleRow[] = [
        {
          id: 'root-1',
          name: RbacRoleName.SYSTEM_ADMIN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN),
          depth: 1,
        },
        {
          id: 'child-1',
          name: RbacRoleName.TECHNICIAN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.TECHNICIAN),
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getDescendantsIncludingSelf(
        'roles',
        rolePath(RbacRoleName.SYSTEM_ADMIN),
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('getSubtree', () => {
    it('should return the subtree within the depth limit', async () => {
      const mockResult: RoleRow[] = [
        {
          id: 'root-1',
          name: RbacRoleName.SYSTEM_ADMIN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN),
          depth: 1,
        },
        {
          id: 'child-1',
          name: RbacRoleName.TECHNICIAN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.TECHNICIAN),
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getSubtree(
        'roles',
        rolePath(RbacRoleName.SYSTEM_ADMIN),
        2,
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('isDescendant', () => {
    it('should return true when the path is under the ancestor', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: true }]);

      const result = await service.isDescendant(
        rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.HOSPITAL_ADMIN),
        rolePath(RbacRoleName.SYSTEM_ADMIN),
      );

      expect(result).toBe(true);
    });

    it('should return false when the paths are unrelated', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: false }]);

      const result = await service.isDescendant(
        rolePath(RbacRoleName.GUEST),
        rolePath(RbacRoleName.SECRETARY),
      );

      expect(result).toBe(false);
    });
  });

  describe('isAncestor', () => {
    it('should return true when the path is an ancestor of the descendant', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: true }]);

      const result = await service.isAncestor(
        rolePath(RbacRoleName.SYSTEM_ADMIN),
        rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.HOSPITAL_ADMIN),
      );

      expect(result).toBe(true);
    });
  });

  describe('getLowestCommonAncestor', () => {
    it('should return the lowest common ancestor path', async () => {
      const lca = rolePath(
        RbacRoleName.SYSTEM_ADMIN,
        RbacRoleName.HOSPITAL_ADMIN,
      );
      mockQueryRaw.mockResolvedValue([{ lca }]);

      const result = await service.getLowestCommonAncestor(
        rolePath(
          RbacRoleName.SYSTEM_ADMIN,
          RbacRoleName.HOSPITAL_ADMIN,
          RbacRoleName.IMAGING_DIRECTOR,
        ),
        rolePath(
          RbacRoleName.SYSTEM_ADMIN,
          RbacRoleName.HOSPITAL_ADMIN,
          RbacRoleName.SUPERVISOR,
        ),
      );

      expect(result).toBe(lca);
    });

    it('should return null when there is no common ancestor', async () => {
      mockQueryRaw.mockResolvedValue([{ lca: null }]);

      const result = await service.getLowestCommonAncestor(
        rolePath(RbacRoleName.GUEST),
        rolePath(RbacRoleName.SECRETARY),
      );

      expect(result).toBeNull();
    });
  });

  describe('getDepth', () => {
    it('should return the correct depth', async () => {
      mockQueryRaw.mockResolvedValue([{ depth: 3 }]);

      const result = await service.getDepth(
        rolePath(
          RbacRoleName.SYSTEM_ADMIN,
          RbacRoleName.HOSPITAL_ADMIN,
          RbacRoleName.IMAGING_DIRECTOR,
        ),
      );

      expect(result).toBe(3);
    });
  });

  describe('getRootNodes', () => {
    it('should return root nodes (depth 1)', async () => {
      const mockResult: RoleNode[] = [
        {
          id: 'root-1',
          name: RbacRoleName.SYSTEM_ADMIN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN),
        },
        {
          id: 'root-2',
          name: RbacRoleName.GUEST,
          path: rolePath(RbacRoleName.GUEST),
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getRootNodes('roles');

      expect(result).toEqual(mockResult);
    });
  });

  describe('getChildren', () => {
    it('should return direct children', async () => {
      const mockResult: RoleNode[] = [
        {
          id: 'child-1',
          name: RbacRoleName.HOSPITAL_ADMIN,
          path: rolePath(
            RbacRoleName.SYSTEM_ADMIN,
            RbacRoleName.HOSPITAL_ADMIN,
          ),
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getChildren(
        'roles',
        rolePath(RbacRoleName.SYSTEM_ADMIN),
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('getLeafNodes', () => {
    it('should return leaf nodes', async () => {
      const mockResult: RoleNode[] = [
        {
          id: 'leaf-1',
          name: RbacRoleName.TECHNICIAN,
          path: rolePath(RbacRoleName.SYSTEM_ADMIN, RbacRoleName.TECHNICIAN),
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getLeafNodes('roles');

      expect(result).toEqual(mockResult);
    });
  });
});
