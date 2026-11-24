import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UnitScopeGuard } from '../guards/unit-scope.guard';
import { UnitScopeService } from '../services/unit-scope.service';
import { UNIT_SCOPE_KEY, UnitScope } from '../decorators/unit-scope.decorator';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.10 — Device-off & swap authorization at the authoritative scope guard.
 *
 * The backend is the single source of truth. These tests confirm that the
 * `UnitScopeGuard`, which protects the device-off and swap approve/reject
 * endpoints, enforces:
 *   - FIELD_SUPERVISOR: own-unit ALLOW / other-unit DENY / other-org DENY.
 *   - SUPERVISOR: any own-org unit ALLOW / other-org DENY.
 *   - SWAP entity type: a unit-confined actor may approve only within their unit.
 */
describe('Phase 5C.10 — Device-off & swap scope (UnitScopeGuard)', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';
  const FOREIGN_ORG = 'ffffffff-0000-0000-0000-000000000000';

  let guard: UnitScopeGuard;
  let reflector: Reflector;
  const mockPrisma: any = {
    unit: { findUnique: vi.fn(), findFirst: vi.fn() },
    schedule: { findUnique: vi.fn() },
    swapRequest: { findUnique: vi.fn() },
    personnel: { findUnique: vi.fn() },
  };

  const fieldSupA = { id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
  const supervisor = { id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };

  const buildContext = (user: any, id: string) => {
    const handler = (() => {}) as any;
    UnitScope({ entityType: 'schedule', idParam: 'id' })(handler);
    return {
      getHandler: () => handler,
      getClass: () => (class Route {}),
      switchToHttp: () => ({
        getRequest: () => ({ user, params: { id }, body: {} }),
      }),
    } as any;
  };

  const buildSwapContext = (user: any, id: string) => {
    const handler = (() => {}) as any;
    UnitScope({ entityType: 'swap', idParam: 'id' })(handler);
    return {
      getHandler: () => handler,
      getClass: () => (class Route {}),
      switchToHttp: () => ({
        getRequest: () => ({ user, params: { id }, body: {} }),
      }),
    } as any;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UnitScopeGuard,
        UnitScopeService,
        Reflector,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = moduleRef.get(UnitScopeGuard);
    reflector = moduleRef.get(Reflector);
  });

  describe('device-off schedule target', () => {
    it('schedule target resolves through the schedule relationship', () => {
      const handler = (() => {}) as any;
      UnitScope({ entityType: 'schedule', idParam: 'id' })(handler);
      expect(reflector.getAllAndOverride(UNIT_SCOPE_KEY, [handler])).toBeTruthy();
    });

    it('FIELD_SUPERVISOR (unit A) may toggle device-off on a schedule in unit A', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_A });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildContext(fieldSupA, 'sched-1'))).resolves.toBe(true);
    });

    it('FIELD_SUPERVISOR (unit A) may NOT toggle device-off on a schedule in unit B (cross-unit DENY)', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildContext(fieldSupA, 'sched-1'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('FIELD_SUPERVISOR (unit A) may NOT toggle device-off on a schedule in another org (cross-org DENY)', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_A });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: FOREIGN_ORG });
      await expect(guard.canActivate(buildContext(fieldSupA, 'sched-1'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SUPERVISOR may toggle device-off on any own-org unit', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildContext(supervisor, 'sched-1'))).resolves.toBe(true);
    });

    it('SUPERVISOR may NOT toggle device-off on a schedule in another org', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: FOREIGN_ORG });
      await expect(guard.canActivate(buildContext(supervisor, 'sched-1'))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('swap approve/reject target', () => {
    it('FIELD_SUPERVISOR (unit A) may approve/reject a swap whose requester is in unit A', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue({ requesterId: 'p1' });
      mockPrisma.personnel.findUnique.mockResolvedValue({ unitId: UNIT_A });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildSwapContext(fieldSupA, 'sw1'))).resolves.toBe(true);
    });

    it('FIELD_SUPERVISOR (unit A) may NOT approve/reject a swap whose requester is in unit B (cross-unit DENY)', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue({ requesterId: 'p2' });
      mockPrisma.personnel.findUnique.mockResolvedValue({ unitId: UNIT_B });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildSwapContext(fieldSupA, 'sw1'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SUPERVISOR may approve/reject a swap in any own-org unit', async () => {
      mockPrisma.swapRequest.findUnique.mockResolvedValue({ requesterId: 'p2' });
      mockPrisma.personnel.findUnique.mockResolvedValue({ unitId: UNIT_B });
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG });
      await expect(guard.canActivate(buildSwapContext(supervisor, 'sw1'))).resolves.toBe(true);
    });
  });

  describe('UnitScopeService.canAccessUnit matrix', () => {
    let service: UnitScopeService;
    beforeEach(() => {
      service = new UnitScopeService(mockPrisma);
    });

    it('unit-confined actor with NULL assignment fails closed against any unit', async () => {
      const fsNull = { id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
      expect(await service.canAccessUnit(fsNull, UNIT_A, ORG)).toBe(false);
    });

    it('RBAC-only FIELD_SUPERVISOR (legacy role supervisor) is still unit-confined to own unit', async () => {
      const rbacFs = {
        id: 'u-rfs', role: 'supervisor', unitId: null, organizationId: ORG,
        rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: UNIT_A, organizationId: ORG }],
      };
      expect(await service.canAccessUnit(rbacFs, UNIT_A, ORG)).toBe(true);
      expect(await service.canAccessUnit(rbacFs, UNIT_B, ORG)).toBe(false);
    });

    it('SUPERVISOR is org-scoped and DENIED only across organizations', async () => {
      expect(await service.canAccessUnit(supervisor, UNIT_B, ORG)).toBe(true);
      expect(await service.canAccessUnit(supervisor, UNIT_B, FOREIGN_ORG)).toBe(false);
    });
  });
});
