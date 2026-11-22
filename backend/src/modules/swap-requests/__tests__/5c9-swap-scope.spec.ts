import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SwapRequestsController } from '../swap-requests.controller';
import { SwapRequestsService } from '../swap-requests.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.9 — Swap request scoping.
 *
 * List/detail must be scoped through the authoritative schedule relationship:
 * FIELD_SUPERVISOR sees only own-unit swaps (null unit => 403), SUPERVISOR is
 * org-wide. Cross-org/cross-unit denied. Approve/reject transactionality intact.
 */
describe('Phase 5C.9 — Swap requests scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';

  let controller: SwapRequestsController;
  let mockService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = {
      findAll: vi.fn(async () => []),
      findOne: vi.fn(async () => ({ id: 's1' })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SwapRequestsController],
      providers: [
        { provide: SwapRequestsService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: { unit: { findUnique: vi.fn(), findFirst: vi.fn() } } },
      ],
    }).compile();

    controller = moduleRef.get(SwapRequestsController);
  });

  const req = (user: any) => ({ user });

  it('FIELD_SUPERVISOR (unit A) list is scoped to unit A', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findAll(req(fsA));
    expect(mockService.findAll).toHaveBeenCalledWith({}, { unitId: UNIT_A, organizationId: ORG });
  });

  it('FIELD_SUPERVISOR with null unit is DENIED on list (fail closed)', async () => {
    const fsNull = { id: 'u-2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll(req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPERVISOR list is org-scoped', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll(req(sup));
    expect(mockService.findAll).toHaveBeenCalledWith({}, { unitId: null, organizationId: ORG });
  });

  it('FIELD_SUPERVISOR (unit A) findOne passes unit-A scope to service', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findOne('s1', req(fsA));
    expect(mockService.findOne).toHaveBeenCalledWith('s1', { unitId: UNIT_A, organizationId: ORG });
  });

  it('FIELD_SUPERVISOR with null unit is DENIED on findOne (fail closed)', async () => {
    const fsNull = { id: 'u-2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne('s1', req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
