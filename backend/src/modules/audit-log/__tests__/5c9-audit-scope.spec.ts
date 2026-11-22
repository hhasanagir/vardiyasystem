import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuditLogService } from '../audit-log.service';
import { AuditLogController } from '../audit-log.controller';
import { AuditAccessGuard } from '../audit.guard';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { RbacService } from '../../rbac/rbac.service';
import { PrismaService } from '../../../prisma.service';
import { CorrelationService } from '../../../correlation/correlation.service';

/**
 * Phase 5C.9 — Audit log unit/org scope.
 *
 * Client-supplied organizationId/unitId on the audit endpoints is never
 * authoritative: the user's effective scope (via UnitScopeService) caps every
 * query to their own organization, and a unit/field-scoped actor is denied.
 */
describe('Phase 5C.9 — Audit log scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';

  const mockPrisma: any = {
    auditLog: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
      findUnique: vi.fn(async () => {
        throw new Error('not used');
      }),
    },
    user: { findMany: vi.fn(async () => []) },
  };

  beforeEach(() => vi.clearAllMocks());

  const compile = async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        AuditLogService,
        UnitScopeService,
        { provide: RbacService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CorrelationService, useValue: {} },
      ],
    })
      .overrideGuard(AuditAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    return moduleRef.get(AuditLogController);
  };

  it('findAll (supervisor) forces backend org scope and ignores client org/unit params', async () => {
    const controller = await compile();
    const supervisor = { id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll(
      { organizationId: 'other-org', unitId: UNIT_A, limit: 10 } as any,
      { user: supervisor } as any,
    );
    const arg = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.where.unitId).toBeUndefined();
  });

  it('findAll (field supervisor) is DENIED (403)', async () => {
    const controller = await compile();
    const fs = { id: 'u-fs', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll({} as any, { user: fs } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAll (field supervisor null unit) is DENIED (403) fail-closed', async () => {
    const controller = await compile();
    const fs = { id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll({} as any, { user: fs } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getStatistics and getFlaggedLogs are org-scoped', async () => {
    const controller = await compile();
    const supervisor = { id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.getStatistics('2026-01-01', '2026-01-31', { user: supervisor } as any);
    const countWhere = mockPrisma.auditLog.count.mock.calls[0][0].where;
    expect(countWhere.organizationId).toBe(ORG);

    await controller.getFlagged({ user: supervisor } as any);
    const flaggedWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    expect(flaggedWhere.organizationId).toBe(ORG);
  });
});

describe('Phase 5C.9 — Audit access guard (RBAC-aware, supervisor floor)', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';

  const makeGuard = (rbacOk: boolean) => {
    const rbac: any = { hasMinRoleLevel: vi.fn(async () => rbacOk) };
    const guard = new AuditAccessGuard({ get: () => null } as any, rbac);
    return { guard, rbac };
  };

  it('grants a supervisor-level user (legacy role supervisor)', async () => {
    const { guard } = makeGuard(true);
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', role: 'supervisor' } }) }) };
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('denies a field supervisor user', async () => {
    const { guard } = makeGuard(false);
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u2', role: 'field_supervisor' } }) }) };
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when no user', async () => {
    const { guard } = makeGuard(false);
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ user: null }) }) };
    expect(await guard.canActivate(ctx)).toBe(false);
  });
});
