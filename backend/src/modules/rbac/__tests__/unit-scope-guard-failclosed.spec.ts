import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UnitScopeGuard } from '../guards/unit-scope.guard';
import { UnitScopeService } from '../services/unit-scope.service';
import { UNIT_SCOPE_KEY, UnitScope } from '../decorators/unit-scope.decorator';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.9 — UnitScopeGuard fail-closed regression.
 *
 * The guard's "cannot resolve target unit" branch MUST use the RBAC-aware
 * isStrictlyUnitScoped(user) determination (source of truth) rather than the
 * legacy-only isStrictlyUnitScopedRole(user.role). A FIELD_SUPERVISOR assigned
 * via RBAC (legacy user.role != 'field_supervisor') with no resolvable target
 * unit MUST fail closed (403), never open the gate.
 */
describe('Phase 5C.9 — UnitScopeGuard fail-closed', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';

  let guard: UnitScopeGuard;
  let reflector: Reflector;
  const mockPrisma: any = {
    unit: {
      findUnique: vi.fn(() => null),
      findFirst: vi.fn(() => null),
      // schedule/personnel resolution must be empty so no target unit resolves.
    },
    schedule: { findUnique: vi.fn(() => null) },
    personnel: { findUnique: vi.fn(() => null) },
  };

  const makeRequest = (user: any) => ({ user, params: { id: 'no-such-id' }, body: {} });

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

  it('RBAC-only FIELD_SUPERVISOR fails closed (403) when target unit unresolvable', async () => {
    const rbacOnlyFs = {
      id: 'u-fs-rbac-guard',
      role: 'supervisor', // legacy user.role is NOT field_supervisor
      unitId: null,
      organizationId: ORG,
      rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: null, organizationId: ORG }],
    };

    const handler = (() => {}) as any;
    // Attach @UnitScope(entityType, idParam) metadata to the handler.
    UnitScope({ entityType: 'schedule', idParam: 'id' })(handler);

    const context = {
      getHandler: () => handler,
      getClass: () => (class Route {}),
      switchToHttp: () => ({ getRequest: () => makeRequest(rbacOnlyFs) }),
    } as any;

    // Sanity: the decorator metadata is attached under the real key.
    expect(reflector.getAllAndOverride(UNIT_SCOPE_KEY, [handler])).toBeTruthy();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('legacy field_supervisor without resolvable target fails closed', async () => {
    const legacyFs = {
      id: 'u-fs-legacy-guard',
      role: 'field_supervisor',
      unitId: null,
      organizationId: ORG,
      rbacRoles: [],
    };

    const handler = (() => {}) as any;
    UnitScope({ entityType: 'schedule', idParam: 'id' })(handler);

    const context = {
      getHandler: () => handler,
      getClass: () => (class Route {}),
      switchToHttp: () => ({ getRequest: () => makeRequest(legacyFs) }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('broader role (supervisor, no RBAC field) is NOT blocked by the fail-closed branch', async () => {
    const sup = {
      id: 'u-sup-guard',
      role: 'supervisor',
      unitId: null,
      organizationId: ORG,
      rbacRoles: [],
    };

    const handler = (() => {}) as any;
    UnitScope({ entityType: 'schedule', idParam: 'id' })(handler);

    const context = {
      getHandler: () => handler,
      getClass: () => (class Route {}),
      switchToHttp: () => ({ getRequest: () => makeRequest(sup) }),
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
