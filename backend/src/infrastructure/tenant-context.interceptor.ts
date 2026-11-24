import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './prisma/middleware/tenant.middleware';
import { isCrossTenantRole } from '../modules/rbac/interfaces/rbac.types';

/**
 * Activates tenant-scoped Prisma queries for the duration of each request.
 *
 * The TenantMiddleware (Prisma) checks `tenantContext.getStore()`.
 * Before this interceptor, that store was always `undefined`, making
 * tenant filtering completely dormant.
 *
 * This interceptor runs AFTER JwtAuthGuard, so `request.user` is available
 * and contains the authenticated user's `organizationId`.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Public route: there is no principal to scope, so there is nothing to filter.
    if (!user) {
      return next.handle();
    }

    const organizationId: string | undefined = user.organizationId;

    if (!organizationId) {
      // A tenant-scoped role with no organization is a misconfiguration, and the
      // failure mode is silent: without a tenant the middleware injects no
      // predicate and every query runs across ALL tenants. Failing closed keeps
      // the account unusable until it is attached to a unit, which is visible and
      // fixable — instead of granting a cross-tenant view.
      if (!isCrossTenantRole(user.role)) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'TENANT_CONTEXT_MISSING',
          message: 'Hesap bir birime bağlı değil; tenant kapsamı belirlenemedi',
        });
      }
      return next.handle();
    }

    return new Observable<unknown>((subscriber) => {
      tenantContext.run({ organizationId }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
