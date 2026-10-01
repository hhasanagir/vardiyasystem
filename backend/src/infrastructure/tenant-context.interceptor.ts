import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './prisma/middleware/tenant.middleware';

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

    const organizationId: string | undefined = user?.organizationId;

    if (!organizationId) {
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
