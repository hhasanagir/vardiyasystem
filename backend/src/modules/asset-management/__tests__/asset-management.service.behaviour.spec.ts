/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
// Prisma and UnitScope doubles are untyped on purpose: they emulate runtime
// query payloads (including tagged-template $queryRaw), not domain types.
import * as crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssetManagementService } from '../asset-management.service';

/**
 * Coverage wave 2 — query construction, include limits, QR generation and
 * dashboard/warranty aggregation. Tenant red paths already live in
 * `5c15-sec-c-asset-scope.spec.ts` and are not repeated.
 */
describe('AssetManagementService behaviour (coverage wave 2)', () => {
  const FIXED_NOW = new Date('2026-11-23T00:00:00.000Z');
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  let service: AssetManagementService;
  let prisma: any;
  let unitScope: any;

  function sqlFragmentValues(call: unknown[]): unknown[] {
    const values: unknown[] = [];
    for (const arg of call) {
      if (arg && typeof arg === 'object' && Array.isArray((arg as any).values)) {
        values.push(...(arg as any).values);
      }
    }
    return values;
  }

  beforeEach(() => {
    prisma = {
      enterpriseAsset: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      assetDocument: { findMany: vi.fn().mockResolvedValue([]) },
      assetMovement: { findMany: vi.fn().mockResolvedValue([]) },
      consumableCatalog: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    unitScope = {
      canAccessUnit: vi.fn().mockResolvedValue(true),
      resolveScope: vi.fn().mockResolvedValue({ strictUnitId: null, organizationId: 'org-A' }),
    };
    service = new AssetManagementService(prisma, unitScope);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('findAll filters', () => {
    it('maps every filter and the six-field insensitive search into the Prisma where', async () => {
      await service.findAll({
        category: 'IMAGING', status: 'active', unitId: 'u-1', departmentId: 'd-1',
        hospitalId: 'h-1', supplierId: 's-1', isActive: false, search: 'neo',
      });

      const query = prisma.enterpriseAsset.findMany.mock.calls[0][0];
      expect(query.where).toEqual({
        category: 'IMAGING',
        status: 'active',
        unitId: 'u-1',
        departmentId: 'd-1',
        hospitalId: 'h-1',
        supplierId: 's-1',
        isActive: false,
        OR: [
          { name: { contains: 'neo', mode: 'insensitive' } },
          { assetNumber: { contains: 'neo', mode: 'insensitive' } },
          { serialNumber: { contains: 'neo', mode: 'insensitive' } },
          { model: { contains: 'neo', mode: 'insensitive' } },
          { manufacturer: { contains: 'neo', mode: 'insensitive' } },
          { barcode: { contains: 'neo', mode: 'insensitive' } },
        ],
      });
      expect(query.include).toEqual({
        supplier: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        hospital: { select: { id: true, name: true } },
      });
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('include limits', () => {
    it('uses the summary limits in findById', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1' });

      await service.findById('a-1');

      const include = prisma.enterpriseAsset.findUnique.mock.calls[0][0].include;
      expect(include.movements).toEqual({ orderBy: { movedAt: 'desc' }, take: 20 });
      expect(include.maintenanceRecords).toEqual({ orderBy: { createdAt: 'desc' }, take: 10 });
    });

    it('uses the full-detail limits and nested includes in getFullDetail', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1' });

      await service.getFullDetail('a-1');

      const include = prisma.enterpriseAsset.findUnique.mock.calls[0][0].include;
      expect(include.movements.take).toBe(50);
      expect(include.maintenanceRecords).toEqual({
        orderBy: { createdAt: 'desc' }, take: 20, include: { parts: true },
      });
      expect(include.calibrationRecords.take).toBe(20);
      expect(include.lifecycleEvents.take).toBe(30);
      expect(include.consumables.take).toBe(10);
      expect(include.qualityRecords.take).toBe(10);
      expect(include.radiationMeasurements.take).toBe(10);
      expect(include.consumptionRecords.take).toBe(20);
      expect(include.device).toBe(true);
      expect(include.serviceContracts).toBe(true);
    });
  });

  describe('getDashboard', () => {
    it('scopes every count/groupBy to the strict unit and applies the 90-day warranty window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: 'u-1', organizationId: 'org-A' });
      prisma.enterpriseAsset.count.mockResolvedValue(2);

      const result = await service.getDashboard({ role: 'field_supervisor' });

      const countWheres = prisma.enterpriseAsset.count.mock.calls.map((call: any[]) => call[0].where);
      expect(countWheres[0]).toEqual({ unitId: 'u-1' });
      expect(countWheres).toContainEqual({ unitId: 'u-1', status: 'active' });
      expect(countWheres).toContainEqual({ unitId: 'u-1', status: 'under_maintenance' });
      expect(countWheres).toContainEqual({ unitId: 'u-1', status: 'fault' });
      expect(countWheres).toContainEqual({ unitId: 'u-1', status: 'out_of_service' });
      expect(countWheres).toContainEqual({
        unitId: 'u-1', warrantyEnd: { not: null, lte: new Date(FIXED_NOW.getTime() + NINETY_DAYS) },
      });
      const groupBys = prisma.enterpriseAsset.groupBy.mock.calls.map((call: any[]) => call[0]);
      expect(groupBys[0]).toEqual({ by: ['category'], _count: true, where: { unitId: 'u-1' } });
      expect(groupBys[1]).toEqual({ by: ['status'], _count: true, where: { unitId: 'u-1' } });
      expect(result).toEqual({
        totalAssets: 2, activeCount: 2, maintenanceCount: 2, faultCount: 2,
        outOfServiceCount: 2, categoryDistribution: [], statusDistribution: [],
        assetsWithWarranty: 2, assetsExpiringWarranty: 2, assetsWithNoQR: 2,
      });
    });

    it('scopes to the organization for non-unit-scoped users', async () => {
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A' });

      await service.getDashboard({ role: 'supervisor' });

      expect(prisma.enterpriseAsset.count.mock.calls[0][0].where).toEqual({ organizationId: 'org-A' });
      expect(prisma.enterpriseAsset.groupBy.mock.calls[0][0].where).toEqual({ organizationId: 'org-A' });
    });
  });

  describe('generateQR', () => {
    it('hashes the canonical payload, persists the vardiya URI and returns it', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({
        id: 'a-1', assetNumber: 'VAR-000001', name: 'MRI', qrCode: null,
      });

      const result = await service.generateQR('a-1');

      const expectedPayload = JSON.stringify({ id: 'a-1', assetNumber: 'VAR-000001', name: 'MRI' });
      const expectedHash = crypto.createHash('sha256').update(expectedPayload).digest('hex').slice(0, 16);
      expect(result).toEqual({
        qrCode: `vardiya://asset/VAR-000001?v=${expectedHash}`,
        qrPayload: expectedPayload,
        qrHash: expectedHash,
        assetNumber: 'VAR-000001',
      });
      expect(result.qrHash).toMatch(/^[0-9a-f]{16}$/);
      expect(prisma.enterpriseAsset.update).toHaveBeenCalledWith({
        where: { id: 'a-1' },
        data: { qrCode: result.qrCode },
      });
    });

    it('throws when the asset does not exist', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue(null);

      await expect(service.generateQR('a-missing')).rejects.toThrow(NotFoundException);
      expect(prisma.enterpriseAsset.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('auto-numbers from the count and converts date strings', async () => {
      prisma.enterpriseAsset.count.mockResolvedValue(5);

      await service.create({
        name: 'Pump', installationDate: '2026-01-02', warrantyStart: '2026-02-03T00:00:00.000Z',
      });

      const created = prisma.enterpriseAsset.create.mock.calls[0][0].data;
      expect(created.assetNumber).toBe('VAR-000006');
      expect(created.installationDate).toBeInstanceOf(Date);
      expect(created.installationDate.toISOString()).toMatch(/^2026-01-02/);
      expect(created.warrantyStart.toISOString()).toBe('2026-02-03T00:00:00.000Z');
      expect(created.status).toBe('active');
      expect(created.isActive).toBe(true);
    });

    it('keeps a supplied asset number and skips the auto-number count', async () => {
      await service.create({ name: 'Pump', assetNumber: 'CUSTOM-1' });

      expect(prisma.enterpriseAsset.count).not.toHaveBeenCalled();
      expect(prisma.enterpriseAsset.create.mock.calls[0][0].data.assetNumber).toBe('CUSTOM-1');
    });

    it('forces the resolved unit and organization onto the created asset', async () => {
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: 'u-1', organizationId: 'org-A' });

      await service.create({ name: 'Pump' }, { role: 'field_supervisor' });

      const created = prisma.enterpriseAsset.create.mock.calls[0][0].data;
      expect(created.unitId).toBe('u-1');
      expect(created.organizationId).toBe('org-A');
    });
  });

  describe('update and remove', () => {
    it('writes only the submitted fields and converts date values', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1' });

      await service.update('a-1', {
        name: 'Renamed', isActive: false, warrantyEnd: '2027-05-01T00:00:00.000Z', notes: 'note',
      });

      const data = prisma.enterpriseAsset.update.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(['isActive', 'name', 'notes', 'warrantyEnd']);
      expect(data.warrantyEnd).toBeInstanceOf(Date);
      expect(data.warrantyEnd.toISOString()).toBe('2027-05-01T00:00:00.000Z');
      expect(data).not.toHaveProperty('status');
    });

    it('deletes an existing asset and reports success', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1' });

      await expect(service.remove('a-1')).resolves.toEqual({ success: true });
      expect(prisma.enterpriseAsset.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
    });

    it('throws on update/remove of a missing asset', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue(null);

      await expect(service.update('a-missing', { name: 'X' })).rejects.toThrow(NotFoundException);
      await expect(service.remove('a-missing')).rejects.toThrow(NotFoundException);
      expect(prisma.enterpriseAsset.update).not.toHaveBeenCalled();
      expect(prisma.enterpriseAsset.delete).not.toHaveBeenCalled();
    });
  });

  describe('documents and movements', () => {
    it('returns documents and movements ordered by their event time', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1' });

      await service.getDocuments('a-1');
      await service.getMovements('a-1');

      expect(prisma.assetDocument.findMany).toHaveBeenCalledWith({
        where: { assetId: 'a-1' }, orderBy: { createdAt: 'desc' },
      });
      expect(prisma.assetMovement.findMany).toHaveBeenCalledWith({
        where: { assetId: 'a-1' }, orderBy: { movedAt: 'desc' },
      });
    });

    it('throws when the parent asset is missing', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue(null);

      await expect(service.getDocuments('a-missing')).rejects.toThrow(NotFoundException);
      await expect(service.getMovements('a-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getWarrantyStatus', () => {
    it('uses the 90-day windows and injects the organization scope into the raw SQL', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A' });

      const result = await service.getWarrantyStatus({ role: 'supervisor' });

      const countWheres = prisma.enterpriseAsset.count.mock.calls.map((call: any[]) => call[0].where);
      expect(countWheres[0]).toEqual({
        organizationId: 'org-A', warrantyEnd: { gte: new Date(FIXED_NOW.getTime() + NINETY_DAYS) },
      });
      expect(countWheres[1]).toEqual({
        organizationId: 'org-A',
        warrantyEnd: {
          gte: FIXED_NOW,
          lte: new Date(FIXED_NOW.getTime() + NINETY_DAYS),
        },
      });
      expect(countWheres[2]).toEqual({
        organizationId: 'org-A', warrantyEnd: { lt: FIXED_NOW },
      });
      expect(countWheres[3]).toEqual({ organizationId: 'org-A', warrantyEnd: null });
      expect(sqlFragmentValues(prisma.$queryRaw.mock.calls[0])).toContain('org-A');
      expect(result).toEqual({ active: 0, expiringSoon: 0, expired: 0, noWarranty: 0, byMonth: [] });
    });

    it('injects the unit scope into the raw SQL for a strict-unit user', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
      unitScope.resolveScope.mockResolvedValue({ strictUnitId: 'u-1', organizationId: 'org-A' });

      await service.getWarrantyStatus({ role: 'field_supervisor' });

      expect(prisma.enterpriseAsset.count.mock.calls[0][0].where).toEqual({
        unitId: 'u-1',
        warrantyEnd: { gte: new Date(FIXED_NOW.getTime() + NINETY_DAYS) },
      });
      expect(sqlFragmentValues(prisma.$queryRaw.mock.calls[0])).toContain('u-1');
    });
  });

  describe('assertAssetAccess on CRUD', () => {
    it('checks unit access before mutating a single asset', async () => {
      prisma.enterpriseAsset.findUnique.mockResolvedValue({
        id: 'a-1', unitId: 'u-1', organizationId: 'org-A',
      });
      unitScope.canAccessUnit.mockResolvedValue(false);

      await expect(service.update('a-1', { name: 'X' }, { role: 'supervisor' }))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.enterpriseAsset.update).not.toHaveBeenCalled();
    });
  });
});
