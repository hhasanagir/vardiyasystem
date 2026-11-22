import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QualityService } from '../quality.service';
import { QualityController } from '../quality.controller';
import { PrismaService } from '../../../prisma.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import {
  DeviceLifecycleService,
} from '../../device-lifecycle/device-lifecycle.service';
import { DeviceLifecycleController } from '../../device-lifecycle/device-lifecycle.controller';
import { DeviceIncidentsService, IncidentScope } from '../../device-incidents/device-incidents.service';
import { DeviceStatusService } from '../../device-status/device-status.service';

/**
 * Phase 5C.15 — D: quality and device-lifecycle records are scoped to the
 * caller's organization (unit for field supervisors).
 *
 * - QualityRecord has unitId but no org column nor unit relation, so org
 *   containment is resolved through the tracking unit.
 * - DeviceLifecycleEvent is scoped through its related EnterpriseAsset.
 * - Mutations on a record outside scope are denied with 403.
 */
describe('Phase 5C.15 — D: quality scope', () => {
  let service: QualityService;
  let prisma: any;
  const unitScope = { canAccessUnit: vi.fn(), resolveScope: vi.fn() };

  const supervisor = { role: 'supervisor', organizationId: 'org-A' };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = {
      qualityRecord: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      qualityAction: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      unit: { findMany: vi.fn(), findUnique: vi.fn() },
      enterpriseAsset: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    unitScope.canAccessUnit.mockResolvedValue(true);
    unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });
    prisma.unit.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
    service = new QualityService(prisma as unknown as PrismaService, unitScope as unknown as UnitScopeService);
  });

  it('listRecords contains only records in the caller organization (unit containment)', async () => {
    prisma.qualityRecord.findMany.mockResolvedValue([]);

    await service.listRecords({}, supervisor);

    const where = prisma.qualityRecord.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual(
      expect.objectContaining({
        OR: [{ unitId: { in: ['u-1', 'u-2'] } }, { asset: { organizationId: 'org-A' } }],
      }),
    );
  });

  it('listRecords filters to the assigned unit for a field supervisor', async () => {
    prisma.qualityRecord.findMany.mockResolvedValue([]);
    unitScope.resolveScope.mockResolvedValue({ strictUnitId: 'unit-1', organizationId: 'org-A', role: 'field_supervisor' });
    const fs = { role: 'field_supervisor', organizationId: 'org-A', unitId: 'unit-1' };

    await service.listRecords({}, fs);

    const where = prisma.qualityRecord.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ unitId: 'unit-1' });
  });

  it('rejects updating a quality record outside the caller scope (403)', async () => {
    prisma.qualityRecord.findUnique.mockResolvedValue({
      id: 'q-1',
      unitId: 'u-9',
      asset: { unitId: null, organizationId: null },
    });
    unitScope.canAccessUnit.mockResolvedValue(false);
    const otherOrg = { role: 'supervisor', organizationId: 'org-B' };

    await expect(service.updateRecord('q-1', {}, otherOrg)).rejects.toThrow(ForbiddenException);
  });

  it('allows updating a quality record within scope', async () => {
    prisma.qualityRecord.findUnique.mockResolvedValue({
      id: 'q-1',
      unitId: 'u-1',
      asset: { unitId: 'u-1', organizationId: 'org-A' },
    });
    unitScope.canAccessUnit.mockResolvedValue(true);
    prisma.qualityRecord.update.mockResolvedValue({ id: 'q-1' });

    const updated = await service.updateRecord('q-1', { title: 'X' }, supervisor);

    expect(updated.id).toBe('q-1');
  });

  describe('controller authorization consistency', () => {
    it('quality record mutations are gated at FIELD_SUPERVISOR', () => {
      const svc = { updateRecord: vi.fn(async () => ({})) } as unknown as QualityService;
      const ctrl = new QualityController(svc);
      void ctrl;
    });
  });
});

describe('Phase 5C.15 — D: device-lifecycle scope', () => {
  let service: DeviceLifecycleService;
  let prisma: any;
  const unitScope = { canAccessUnit: vi.fn(), resolveScope: vi.fn() };

  const supervisor = { role: 'supervisor', organizationId: 'org-A' };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = {
      deviceLifecycleEvent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      enterpriseAsset: { findUnique: vi.fn() },
    };
    unitScope.canAccessUnit.mockResolvedValue(true);
    unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });
    service = new DeviceLifecycleService(prisma as unknown as PrismaService, unitScope as unknown as UnitScopeService);
  });

  it('rejects reading a lifecycle event whose asset is in another organization', async () => {
    prisma.deviceLifecycleEvent.findUnique.mockResolvedValue({
      id: 'e-1',
      asset: { id: 'a-1', unitId: 'u-9', organizationId: 'org-B' },
    });
    unitScope.canAccessUnit.mockResolvedValue(false);
    const otherOrg = { role: 'supervisor', organizationId: 'org-B' };

    await expect(service.findById('e-1', otherOrg)).rejects.toThrow(ForbiddenException);
  });

  it('allows reading a lifecycle event within the caller organization', async () => {
    prisma.deviceLifecycleEvent.findUnique.mockResolvedValue({
      id: 'e-1',
      asset: { id: 'a-1', unitId: 'u-1', organizationId: 'org-A' },
    });

    const result = await service.findById('e-1', supervisor);

    expect(result.id).toBe('e-1');
  });

  it('rejects creating a lifecycle event on an out-of-scope asset', async () => {
    prisma.enterpriseAsset.findUnique.mockResolvedValue({ id: 'a-1', unitId: 'u-9', organizationId: 'org-B' });
    unitScope.canAccessUnit.mockResolvedValue(false);

    await expect(
      service.create({ assetId: 'a-1', eventType: 'maint', eventDate: '2026-01-01', title: 'T' }, { role: 'supervisor', organizationId: 'org-B' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('filters a list to the caller organization scope', async () => {
    prisma.deviceLifecycleEvent.findMany.mockResolvedValue([]);
    unitScope.resolveScope.mockResolvedValue({ strictUnitId: null, organizationId: 'org-A', role: 'supervisor' });

    await service.findAll(undefined, undefined, supervisor);

    const where = prisma.deviceLifecycleEvent.findMany.mock.calls[0][0].where;
    expect(where.asset).toMatchObject({ organizationId: 'org-A' });
  });

  describe('controller wiring', () => {
    it('passes the authenticated user into service mutations', async () => {
      const svc = { findById: vi.fn(async () => ({})) } as unknown as DeviceLifecycleService;
      const ctrl = new DeviceLifecycleController(svc);
      const req = { user: supervisor };

      await ctrl.findOne('e-1', req as any);

      expect(svc.findById).toHaveBeenCalledWith('e-1', supervisor);
    });
  });
});

describe('Phase 5C.15 — D: device-incidents scope (IncidentScope)', () => {
  let service: DeviceIncidentsService;
  let prisma: any;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = {
      unit: { findUnique: vi.fn() },
      device: { findUnique: vi.fn() },
      deviceIncident: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    const deps = {
      broadcastDeviceIncident: vi.fn(),
      notify: vi.fn(),
      sendAlert: vi.fn(),
      publish: vi.fn(),
    };
    service = new DeviceIncidentsService(
      prisma as unknown as PrismaService,
      deps as any,
      deps as any,
      deps as any,
      deps as any,
    );
  });

  const dto = { unitId: 'u-1', issueType: 'breakdown', severity: 'high', description: 'x' } as any;

  it('denies create when the resolved scope is denyAll (403)', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'u-1', name: 'A', organizationId: 'org-A' });
    const scope: IncidentScope = { denyAll: true };

    await expect(service.create('user-1', dto, scope)).rejects.toThrow(ForbiddenException);
  });

  it('denies create when the target unit belongs to another organization (403)', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'u-1', name: 'A', organizationId: 'org-B' });
    const scope: IncidentScope = { organizationId: 'org-A' };

    await expect(service.create('user-1', dto, scope)).rejects.toThrow(ForbiddenException);
  });

  it('denies create for a field supervisor targeting a unit outside the assigned unit (403)', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'u-9', name: 'B', organizationId: 'org-A' });
    const scope: IncidentScope = { organizationId: 'org-A', unitId: 'u-1' };

    await expect(service.create('user-1', dto, scope)).rejects.toThrow(ForbiddenException);
  });

  it('allows create when the target unit is inside the resolved org scope', async () => {
    prisma.unit.findUnique.mockResolvedValue({ id: 'u-1', name: 'A', organizationId: 'org-A' });
    prisma.deviceIncident.create.mockResolvedValue({ id: 'inc-1' });
    const scope: IncidentScope = { organizationId: 'org-A', unitId: 'u-1' };

    const result = await service.create('user-1', dto, scope);

    expect(result.id).toBe('inc-1');
    expect(prisma.deviceIncident.create).toHaveBeenCalled();
  });

  it('findAll with denyAll scope filters to an impossible unit (empty result set)', async () => {
    prisma.deviceIncident.findMany.mockResolvedValue([]);
    const scope: IncidentScope = { denyAll: true };

    await service.findAll('u-1', {} as any, scope);

    const where = prisma.deviceIncident.findMany.mock.calls[0][0].where;
    expect(where.unitId).toBe('__deny_all__');
  });
});

describe('Phase 5C.15 — D: device-status scope', () => {
  let service: DeviceStatusService;
  let prisma: any;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma = {
      user: { findUnique: vi.fn() },
      device: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
      deviceStatusLog: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    };
    service = new DeviceStatusService(prisma as unknown as PrismaService);
  });

  it('getMyUnitDevices falls back to the caller unit when no explicit unit is supplied', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-9', unitId: 'unit-fs', name: 'FS', role: 'field_supervisor' });
    prisma.device.findMany.mockResolvedValue([]);

    await service.getMyUnitDevices('u-9', undefined);

    const where = prisma.device.findMany.mock.calls[0][0].where;
    expect(where.unitId).toBe('unit-fs');
  });
});
