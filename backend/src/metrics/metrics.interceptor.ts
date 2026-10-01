import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const path = this.getNormalizedPath(request);

    const start = Date.now();
    this.metrics.httpInFlight.inc();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const status = String(response.statusCode);
          this.metrics.httpRequestsTotal.inc({ method, path, status });
          this.metrics.httpRequestDuration.observe(
            { method, path, status },
            duration / 1000,
          );
          this.metrics.httpInFlight.dec();
        },
        error: (error: Error) => {
          const duration = Date.now() - start;
          const status = String((error as { status?: number }).status || 500);
          this.metrics.httpRequestsTotal.inc({ method, path, status });
          this.metrics.httpRequestDuration.observe(
            { method, path, status },
            duration / 1000,
          );
          this.metrics.httpInFlight.dec();
        },
      }),
    );
  }

  private getNormalizedPath(request: Request): string {
    const route =
      request.route?.path || request.path || request.url || 'unknown';
    return route.replace(/\/api\/v1\//, '').replace(/\/?\d+/g, '/:id');
  }
}
