import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssetManagementService } from '../asset-management.service';
import { PrismaService } from '../../../prisma.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import {
  AssetManagementController,
} from '../asset-management.controller';

/**
 * Phase 5C.15 — C: asset-management (enterprise assets) must be
 * organization/unit scoped.
 *
 * - Reads list only assets within the caller's scope (org, or the assigned
 *   unit for field supervisors).
 * - Single-asset reads/mutations resolve the target asset and deny cross-org
 *   and cross-unit access with 403.
 * - A client-supplied organizationId is never authoritative.
 */
describe('Phase 5C.15 — C: asset-management scope', () => {
  let service: AssetManagementService;
  let prisma: any;
  const unitScope = { canAccessUnit: vi.fn(), resolveScope: vi.fn() };

  beforeEach(() => {
    prisma = {
      enterpriseAsset: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      unit: { findUnique: vi.fn() },
    };
    vi.resetAllMocks();
    unitScope.canAccessUnit.mockResolvedValue(true);
    service = new AssetManagementService(
      prisma as unknown as PrismaService,
      unitScope as unknown as UnitScopeService,
    );
  });

  const supervisor = { role: 'supervisor', organizationId: 'org-A' };
  const fieldSupervisor = { role: 'field_supervisor', organizationId: 'org-A', unitId: 'unit-1' };
  const otherOrg = { role: 'supervisor', organizationId: 'org-B' };

  describe('findAll', () => {
    it('filters by the caller organization (supervisor)', async () => {
      prisma.enterpriseAsset.findMany.mockResolvedValue([]);
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });

      await service.findAll({}, supervisor);

      const callWhere = prisma.enterpriseAsset.findMany.mock.calls[0][0].where;
      expect(callWhere.AND).toContainEqual({ organizationId: 'org-A' });
    });

    it('filters by the assigned unit (field supervisor)', async () => {
      prisma.enterpriseAsset.findMany.mockResolvedValue([]);
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: 'unit-1', organizationId: 'org-A', role: 'field_supervisor' });

      await service.findAll({}, fieldSupervisor);

      const callWhere = prisma.enterpriseAsset.findMany.mock.calls[0][0].where;
      expect(callWhere.AND).toContainEqual({ unitId: 'unit-1' });
    });
  });

  describe('findById (single-asset scoping)', () => {
    it('denies reading an asset in another organization (403)', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1', unitId: 'u-9', organizationId: 'org-B' });
      unitScope.canAccessUnit.mockResolvedValue(false);

      await expect(service.findById('a-1', otherOrg)).rejects.toThrow(ForbiddenException);
    });

    it('denies when the asset does not exist (404)', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue(null);

      await expect(service.findById('a-missing', supervisor)).rejects.toThrow(NotFoundException);
    });

    it('allows reading an asset in the caller organization', async () => {
      const asset = { id: 'a-1', unitId: 'u-1', organizationId: 'org-A' };
      prisma.enterpriseAsset.findUnique.mockResolvedValue(asset);
      unitScope.canAccessUnit.mockResolvedValue(true);

      const result = await service.findById('a-1', supervisor);

      expect(result).toBe(asset);
    });
  });

  describe('create', () => {
    it('rejects creating an asset into a different organization (403)', async () => {
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });
      prisma.enterpriseAsset.count.mockResolvedValue(0);
      prisma.enterpriseAsset.create.mockResolvedValue({});

      await expect(service.create({ organizationId: 'org-B', name: 'X' }, supervisor))
        .rejects.toThrow(ForbiddenException);

      expect(prisma.enterpriseAsset.create).not.toHaveBeenCalled();
    });

    it('forces the caller organization onto a created asset (client org is never authoritative)', async () => {
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });
      prisma.enterpriseAsset.count.mockResolvedValue(0);
      prisma.enterpriseAsset.create.mockResolvedValue({});

      await service.create({ name: 'X' }, supervisor);

      const createdData = prisma.enterpriseAsset.create.mock.calls[0][0].data;
      expect(createdData.organizationId).toBe('org-A');
    });
  });

  describe('controller wiring', () => {
    it('passes the authenticated user to the service on single-asset reads', async () => {
      const svc = { findById: vi.fn(async () => ({})) } as unknown as AssetManagementService;
      const ctrl = new AssetManagementController(svc);
      const req = { user: otherOrg };

      await ctrl.findById('a-1', req as any);

      expect(svc.findById).toHaveBeenCalledWith('a-1', otherOrg);
    });
  });
});
