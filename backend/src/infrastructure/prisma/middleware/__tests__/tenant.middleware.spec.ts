import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTenantMiddleware, tenantContext } from '../../../../infrastructure/prisma/middleware/tenant.middleware';

type MiddlewareParams = {
  model?: string;
  action: string;
  args?: any;
};

/**
 * Regression tests for the global tenant middleware fix.
 *
 * Root cause (proven): the middleware injected a direct `organizationId` column
 * into every TENANT_MODEL, but most of them do not own that column, producing a
 * PrismaClientValidationError (`Unknown argument organizationId`) for every
 * tenant-scoped request (e.g. device-off, addAssignment).
 *
 * Fix: inject `organizationId` ONLY into models that actually own the column;
 * leave all other tenant models untouched (their isolation is enforced at the
 * guard/service layer, e.g. ScheduleAccessGuard).
 */
describe('Tenant Middleware — Global fix (Phase 5C.2 blocker)', () => {
  const middleware = createTenantMiddleware();

  function runInStore(organizationId: string, params: MiddlewareParams) {
    return tenantContext.run({ organizationId }, () => {
      let captured: MiddlewareParams | null = null;
      return middleware(params as any, async (p: MiddlewareParams) => {
        captured = p;
        return undefined;
      }).then(() => captured!);
    });
  }

  function runNoStore(params: MiddlewareParams) {
    // Ensure no AsyncLocalStorage store leaks from a previous test.
    return tenantContext.run(undefined as any, () => {
      let called = false;
      return middleware(params as any, async (p: MiddlewareParams) => {
        called = true;
        return undefined;
      }).then(() => ({ called, params }));
    });
  }

  it('1. injects organizationId into models that own the column (findMany)', async () => {
    const p = await runInStore('org-a', { model: 'Schedule', action: 'findMany', args: { where: { month: 8 } } });
    expect(p.args.where.organizationId).toBe('org-a');
  });

  it('2. injects organizationId into owned-column models on create', async () => {
    const p = await runInStore('org-a', { model: 'Device', action: 'create', args: { data: { code: 'X', name: 'x' } } });
    expect(p.args.data.organizationId).toBe('org-a');
  });

  it('3. injects organizationId into newly org-scoped models (Assignment)', async () => {
    // Phase 5C.6/5C.7 STEP 1 (v18): assignments now own the organizationId
    // column, so the middleware must scope them (previously injected only the
    // legacy 5 owning models and Assignment was NOT scoped — the original bug).
    const p = await runInStore('org-a', { model: 'Assignment', action: 'count', args: { where: { scheduleId: 's1' } } });
    expect(p.args.where.organizationId).toBe('org-a');
    expect(p.args.where.scheduleId).toBe('s1');
  });

  it('4. does NOT corrupt true column-less tenant models', async () => {
    const models = [
      'ShiftTask', 'HandoverNote', 'DeviceIncident',
      'AttendanceRecord', 'Training', 'Skill', 'AssignmentSlot',
    ];
    for (const m of models) {
      const p = await runInStore('org-a', { model: m, action: 'findMany', args: { where: {} } });
      expect(p.args.where.organizationId, `model ${m} must not be injected`).toBeUndefined();
    }
  });

  it('5. exactly the org-owning models are injected (8 after v18 migration)', async () => {
    const owned = ['Schedule', 'Unit', 'Device', 'Notification', 'Shifts', 'Assignment', 'Personnel', 'SwapRequest'];
    const notOwned = [
      'ShiftTask', 'HandoverNote', 'DeviceIncident',
      'AttendanceRecord', 'Training', 'Skill', 'AssignmentSlot',
    ];
    for (const m of owned) {
      const p = await runInStore('org-a', { model: m, action: 'findMany', args: { where: {} } });
      expect(p.args.where.organizationId, `${m} should be injected`).toBe('org-a');
    }
    for (const m of notOwned) {
      const p = await runInStore('org-a', { model: m, action: 'findMany', args: { where: {} } });
      expect(p.args.where.organizationId, `${m} should NOT be injected`).toBeUndefined();
    }
  });

  it('6. pins every query to the authenticated tenant (caller cannot widen scope)', async () => {
    const p = await runInStore('org-a', { model: 'Schedule', action: 'findMany', args: { where: { organizationId: 'org-explicit' } } });
    // A caller-supplied organizationId must never override the tenant context.
    expect(p.args.where.organizationId).toBe('org-a');
  });

  it('10. stamps organizationId on every row of createMany', async () => {
    const p = await runInStore('org-a', {
      model: 'Assignment',
      action: 'createMany',
      args: { data: [{ personnelId: 'p1' }, { personnelId: 'p2', organizationId: 'org-evil' }] },
    });
    expect(p.args.data).toHaveLength(2);
    for (const row of p.args.data) {
      expect(row.organizationId).toBe('org-a');
    }
  });

  it('7. fails closed / no-op when there is no tenant context', async () => {
    const { called, params } = await runNoStore({ model: 'Schedule', action: 'findMany', args: { where: {} } });
    expect(called).toBe(true);
    expect(params.args.where!.organizationId).toBeUndefined();
  });

  it('8. passes through non-tenant models untouched', async () => {
    const p = await runInStore('org-a', { model: 'AuditLog', action: 'create', args: { data: { userId: 'u' } } });
    expect(p.args.data.organizationId).toBeUndefined();
  });

  it('9. injects organizationId into org-scoped models on update', async () => {
    // Personnel now owns the organizationId column (v18) -> scoped on update.
    const p = await runInStore('org-a', { model: 'Personnel', action: 'update', args: { where: { id: 'person-1' }, data: { name: 'n' } } });
    expect(p.args.where.organizationId).toBe('org-a');
    expect(p.args.where.id).toBe('person-1');
  });
});
