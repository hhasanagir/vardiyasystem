import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantContextInterceptor } from '../tenant-context.interceptor';
import { tenantContext } from '../prisma/middleware/tenant.middleware';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const handlerReturning = (value: string): CallHandler => ({ handle: () => of(value) });

/** The interceptor may refuse synchronously, before any observable exists. */
const capture = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    return await run();
  } catch (error) {
    return error;
  }
};

/**
 * The interceptor is what makes tenant filtering live. Two invariants matter:
 *
 *  1. an authenticated request with an organization is wrapped in a tenant
 *     context, and
 *  2. an authenticated request WITHOUT one is refused for tenant-scoped roles,
 *     because "no tenant" would otherwise mean "every tenant" for Prisma.
 */
describe('TenantContextInterceptor', () => {
  const interceptor = new TenantContextInterceptor();

  it('passes a public request through untouched (no principal to scope)', async () => {
    const next = handlerReturning('ok');
    await expect(lastValueFrom(interceptor.intercept(contextFor(undefined), next))).resolves.toBe('ok');
  });

  it('scopes the request to the user organization', async () => {
    let seen: string | undefined;
    const next: CallHandler = {
      handle: () => {
        seen = tenantContext.getStore()?.organizationId;
        return of('ok');
      },
    };

    await lastValueFrom(
      interceptor.intercept(contextFor({ id: 'u-1', role: 'supervisor', organizationId: 'org-1' }), next),
    );

    expect(seen).toBe('org-1');
  });

  it('does not leak the tenant context into the next request', async () => {
    const spy = vi.fn();
    const next: CallHandler = { handle: () => { spy(); return of('ok'); } };

    await lastValueFrom(
      interceptor.intercept(contextFor({ id: 'u-1', role: 'supervisor', organizationId: 'org-1' }), next),
    );
    expect(tenantContext.getStore()).toBeUndefined();
  });

  it('allows a cross-tenant role with no organization', async () => {
    for (const role of ['system_admin', 'hospital_admin']) {
      const next = handlerReturning('ok');
      await expect(
        lastValueFrom(interceptor.intercept(contextFor({ id: 'u-1', role, organizationId: null }), next)),
      ).resolves.toBe('ok');
    }
  });

  it('refuses a tenant-scoped role with no organization instead of going unscoped', async () => {
    for (const role of ['supervisor', 'technician', 'imaging_director', 'field_supervisor', 'guest']) {
      const next = handlerReturning('ok');
      const error = await capture(() =>
        lastValueFrom(interceptor.intercept(contextFor({ id: 'u-1', role, organizationId: null }), next)),
      );

      expect(error, `${role} must not reach the handler`).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ error: 'TENANT_CONTEXT_MISSING' });
    }
  });

  it('never calls the handler for a refused request', async () => {
    const handle = vi.fn(() => of('ok'));
    const next: CallHandler = { handle };
    await capture(() =>
      lastValueFrom(interceptor.intercept(contextFor({ id: 'u-1', role: 'supervisor', organizationId: null }), next)),
    );

    expect(handle).not.toHaveBeenCalled();
  });
});
