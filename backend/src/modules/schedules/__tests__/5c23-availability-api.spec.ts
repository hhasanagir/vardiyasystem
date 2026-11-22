import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PersonnelAvailabilityService } from '../services/personnel-availability.service';
import { PrismaService } from '../../../prisma.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const ORG = 'org-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

const fsActor = { id: 'u-fs', name: 'FS', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
const supActor = { id: 'u-sup', name: 'SUP', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
const otherOrg = { id: 'u-x', name: 'X', role: 'supervisor', unitId: null, organizationId: 'org-2', rbacRoles: [] };
const nullOrgSup = { id: 'u-null', name: 'N', role: 'supervisor', unitId: null, organizationId: null, rbacRoles: [] };
const sysAdmin = { id: 'u-sa', name: 'SA', role: 'system_admin', unitId: null, organizationId: null, rbacRoles: [] };

/**
 * Phase 5C.23 — guarded CRUD: unit-scope enforcement (Phase 5C.20 fail-closed
 * rules), unique (personnelId,date) upsert discipline, the 409
 * AVAILABLE_OVER_BLOCKING collision rule (case H), reactivation-by-UPDATE,
 * idempotent soft delete, and audit coverage.
 */
describe('Phase 5C.23 — personnel availability CRUD + authz', () => {
  let prisma: any;
  let unitScope: any;
  let auditSpy: ReturnType<typeof vi.fn>;
  let service: PersonnelAvailabilityService;

  beforeEach(() => {
    prisma = {
      personnel: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p-1', name: 'Personel 1' }),
      },
      unit: { findUnique: vi.fn() },
      personnelDateAvailability: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: true }),
        update: vi.fn(),
      },
    };
    unitScope = {
      resolveReadScope: vi.fn().mockResolvedValue({ unitId: null, organizationId: ORG, denyAll: false }),
      resolveTargetScope: vi.fn().mockResolvedValue({ unitId: UNIT_A, organizationId: ORG }),
      canAccessUnit: vi.fn().mockResolvedValue(true),
    };
    auditSpy = vi.fn().mockResolvedValue(undefined);
    service = new PersonnelAvailabilityService(
      prisma as unknown as PrismaService,
      unitScope as unknown as UnitScopeService,
      { log: auditSpy } as unknown as AuditLogService,
    );
  });

  describe('scope enforcement (write)', () => {
    it('FIELD_SUPERVISOR within own unit may create', async () => {
      unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG });
      unitScope.canAccessUnit.mockResolvedValue(true);
      prisma.personnelDateAvailability.findUnique.mockResolvedValue(null);
      prisma.personnelDateAvailability.create.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null });
      await expect(service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, fsActor)).resolves.toMatchObject({ id: 'a-1' });
    });

    it('FIELD_SUPERVISOR targeting a sibling unit is DENIED', async () => {
      unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_B, organizationId: ORG });
      unitScope.canAccessUnit.mockResolvedValue(false);
      await expect(service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, fsActor))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.personnelDateAvailability.create).not.toHaveBeenCalled();
    });

    it('cross-tenant actor is DENIED', async () => {
      unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG });
      unitScope.canAccessUnit.mockResolvedValue(false);
      await expect(service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, otherOrg))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('NULL-org actor is DENIED (fail closed, exclusive of explicit SYSTEM_ADMIN)', async () => {
      unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG });
      unitScope.canAccessUnit.mockImplementation(async (actor: any) =>
        ['system_admin', 'super_admin'].includes(actor.role) ? true : false,
      );
      await expect(service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, nullOrgSup))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, sysAdmin)).resolves.toBeDefined();
    });

    it('unknown personnel => NotFound before any write', async () => {
      prisma.personnel.findUnique.mockResolvedValue(null);
      await expect(service.create({ personnelId: 'ghost', date: '2026-10-06', type: 'LEAVE' }, fsActor))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(unitScope.resolveTargetScope).not.toHaveBeenCalled();
    });
  });

  it('H: creating AVAILABLE over an active blocking row => 409 and no write', async () => {
    prisma.personnelDateAvailability.findUnique.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', isActive: true, reason: null });
    const err = await service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'AVAILABLE' }, supActor).catch(e => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(JSON.parse(err.message).code).toBe('AVAILABLE_OVER_BLOCKING');
    expect(prisma.personnelDateAvailability.create).not.toHaveBeenCalled();
    expect(prisma.personnelDateAvailability.update).not.toHaveBeenCalled();
  });

  it('upsert: existing inactive row is reactivated+updated on the unique (personnelId,date) key, never duplicated', async () => {
    prisma.personnelDateAvailability.findUnique.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'AVAILABLE', reason: 'eski', isActive: false });
    prisma.personnelDateAvailability.update.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'UNAVAILABLE', reason: null, isActive: true });
    await service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'UNAVAILABLE', reason: 'izinden dönüş' }, supActor);
    expect(prisma.personnelDateAvailability.create).not.toHaveBeenCalled();
    expect(prisma.personnelDateAvailability.update).toHaveBeenCalledTimes(1);
    expect(prisma.personnelDateAvailability.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'a-1' },
      data: expect.objectContaining({ type: 'UNAVAILABLE', isActive: true }),
    }));
  });

  it('update by explicit PATCH may flip type to AVAILABLE (conscious change, overwrite allowed)', async () => {
    prisma.personnelDateAvailability.findUnique.mockResolvedValueOnce({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: 'x', isActive: true });
    prisma.personnelDateAvailability.update.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'AVAILABLE', reason: 'y', isActive: true });
    const updated = await service.update('a-1', { type: 'AVAILABLE', reason: 'y' }, supActor);
    expect(updated.type).toBe('AVAILABLE');
  });

  it('deactivate is a soft delete via isActive=false and idempotent', async () => {
    prisma.personnelDateAvailability.findUnique
      .mockResolvedValueOnce({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: true });
    prisma.personnelDateAvailability.update.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: false });
    const deactivated = await service.deactivate('a-1', supActor);
    expect(deactivated.isActive).toBe(false);
    expect(prisma.personnelDateAvailability.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    // idempotent: already inactive -> returns row, no second write
    prisma.personnelDateAvailability.findUnique.mockResolvedValueOnce({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: false });
    await service.deactivate('a-1', supActor);
    expect(prisma.personnelDateAvailability.update).toHaveBeenCalledTimes(1);
  });

  it('update/deactivate enforce target scope before mutating', async () => {
    prisma.personnelDateAvailability.findUnique.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: true });
    unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_B, organizationId: ORG });
    unitScope.canAccessUnit.mockResolvedValue(false);
    await expect(service.update('a-1', { reason: 'y' }, fsActor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deactivate('a-1', fsActor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.personnelDateAvailability.update).not.toHaveBeenCalled();
  });

  it('writes an audit entry on create with personnel_date_availability entityType', async () => {
    unitScope.resolveTargetScope.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG });
    prisma.personnelDateAvailability.findUnique.mockResolvedValue(null);
    prisma.personnelDateAvailability.create.mockResolvedValue({ id: 'a-1', personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE', reason: null, isActive: true });
    await service.create({ personnelId: 'p-1', date: '2026-10-06', type: 'LEAVE' }, fsActor);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERSONNEL_AVAILABILITY_CREATED', entityType: 'personnel_date_availability', entityId: 'a-1' }));
  });

  describe('list scoping', () => {
    it('denyAll (unresolvable strict unit) => empty result', async () => {
      unitScope.resolveReadScope.mockResolvedValue({ unitId: null, organizationId: ORG, denyAll: true });
      const res = await service.list({}, fsActor);
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(prisma.personnelDateAvailability.findMany).not.toHaveBeenCalled();
    });

    it('strict-unit actor is confined to his unit filter', async () => {
      unitScope.resolveReadScope.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG, denyAll: false });
      await service.list({}, fsActor);
      const where = prisma.personnelDateAvailability.findMany.mock.calls[0][0].where;
      expect(where.personnel.unitId).toBe(UNIT_A);
      expect(where.personnel.organizationId).toBe(ORG);
    });

    it('org-scope actor reads only his tenant personnel', async () => {
      await service.list({}, supActor);
      const where = prisma.personnelDateAvailability.findMany.mock.calls[0][0].where;
      expect(where.personnel.unitId).toBeUndefined();
      expect(where.personnel.organizationId).toBe(ORG);
    });

    it('honors date/personnelId filters', async () => {
      await service.list({ personnelId: 'p-1', date: '2026-10-06' }, supActor);
      const where = prisma.personnelDateAvailability.findMany.mock.calls[0][0].where;
      expect(where.personnelId).toBe('p-1');
      expect(where.date).toBe('2026-10-06');
    });
  });
});