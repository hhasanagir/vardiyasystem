import { Test, TestingModule } from '@nestjs/testing';
import { HierarchyService } from '../hierarchy.service';
import { PrismaService } from '../../../prisma.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HierarchyService', () => {
  let service: HierarchyService;
  let prisma: PrismaService;

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
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getAncestors', () => {
    it('should return ancestors excluding self', async () => {
      const mockResult = [
        { id: 'root-1', name: 'SYSTEM_ADMIN', path: 'SYSTEM_ADMIN', depth: 1 },
        {
          id: 'org-1',
          name: 'ORGANIZATION_ADMIN',
          path: 'SYSTEM_ADMIN.ORGANIZATION_ADMIN',
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getAncestors(
        'roles',
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR',
      );

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockQueryRaw).toHaveBeenCalledWith(
        expect.stringContaining('@>'),
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDescendants', () => {
    it('should return descendants excluding self', async () => {
      const mockResult = [
        {
          id: 'child-1',
          name: 'TECHNICIAN',
          path: 'SYSTEM_ADMIN.TECHNICIAN',
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getDescendants('roles', 'SYSTEM_ADMIN', 2);

      expect(mockQueryRaw).toHaveBeenCalledWith(
        expect.stringContaining('<@'),
        'SYSTEM_ADMIN',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDescendantsIncludingSelf', () => {
    it('should return descendants including self', async () => {
      const mockResult = [
        { id: 'root-1', name: 'SYSTEM_ADMIN', path: 'SYSTEM_ADMIN', depth: 1 },
        {
          id: 'child-1',
          name: 'TECHNICIAN',
          path: 'SYSTEM_ADMIN.TECHNICIAN',
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getDescendantsIncludingSelf(
        'roles',
        'SYSTEM_ADMIN',
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('getSubtree', () => {
    it('should return subtree with max depth', async () => {
      const mockResult = [
        { id: 'root-1', name: 'SYSTEM_ADMIN', path: 'SYSTEM_ADMIN', depth: 1 },
        {
          id: 'child-1',
          name: 'ORGANIZATION_ADMIN',
          path: 'SYSTEM_ADMIN.ORGANIZATION_ADMIN',
          depth: 2,
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getSubtree('roles', 'SYSTEM_ADMIN', 1);

      expect(result).toEqual(mockResult);
    });
  });

  describe('isDescendant', () => {
    it('should return true when descendant is under ancestor', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: true }]);

      const result = await service.isDescendant(
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN',
        'SYSTEM_ADMIN',
      );

      expect(result).toBe(true);
    });

    it('should return false when descendant is not under ancestor', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: false }]);

      const result = await service.isDescendant('SYSTEM_ADMIN', 'OTHER_PATH');

      expect(result).toBe(false);
    });
  });

  describe('isAncestor', () => {
    it('should return true when path is ancestor of descendant', async () => {
      mockQueryRaw.mockResolvedValue([{ is_descendant: true }]);

      const result = await service.isAncestor(
        'SYSTEM_ADMIN',
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN',
      );

      expect(result).toBe(true);
    });
  });

  describe('getLowestCommonAncestor', () => {
    it('should return the lowest common ancestor path', async () => {
      mockQueryRaw.mockResolvedValue([
        { lca: 'SYSTEM_ADMIN.ORGANIZATION_ADMIN' },
      ]);

      const result = await service.getLowestCommonAncestor(
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR',
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN.IMAGING_MANAGER',
      );

      expect(result).toBe('SYSTEM_ADMIN.ORGANIZATION_ADMIN');
    });

    it('should return null when no common ancestor', async () => {
      mockQueryRaw.mockResolvedValue([{ lca: null }]);

      const result = await service.getLowestCommonAncestor('A', 'B');

      expect(result).toBeNull();
    });
  });

  describe('getDepth', () => {
    it('should return the correct depth', async () => {
      mockQueryRaw.mockResolvedValue([{ depth: 3 }]);

      const result = await service.getDepth(
        'SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR',
      );

      expect(result).toBe(3);
    });
  });

  describe('getRootNodes', () => {
    it('should return root nodes (depth 1)', async () => {
      const mockResult = [
        { id: 'root-1', name: 'SYSTEM_ADMIN', path: 'SYSTEM_ADMIN' },
        { id: 'root-2', name: 'READ_ONLY_AUDITOR', path: 'READ_ONLY_AUDITOR' },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getRootNodes('roles');

      expect(result).toEqual(mockResult);
    });
  });

  describe('getChildren', () => {
    it('should return direct children', async () => {
      const mockResult = [
        {
          id: 'child-1',
          name: 'ORGANIZATION_ADMIN',
          path: 'SYSTEM_ADMIN.ORGANIZATION_ADMIN',
        },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getChildren('roles', 'SYSTEM_ADMIN');

      expect(result).toEqual(mockResult);
    });
  });

  describe('getLeafNodes', () => {
    it('should return leaf nodes', async () => {
      const mockResult = [
        { id: 'leaf-1', name: 'TECHNICIAN', path: 'SYSTEM_ADMIN.TECHNICIAN' },
      ];
      mockQueryRaw.mockResolvedValue(mockResult);

      const result = await service.getLeafNodes('roles');

      expect(result).toEqual(mockResult);
    });
  });
});
