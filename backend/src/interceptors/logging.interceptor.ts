import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { winstonLogger } from '../logger/winston-logger';
import { CorrelationService } from '../correlation/correlation.service';
import { HealthMonitorService } from '../modules/health/health-monitor.service';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(
    private correlationService: CorrelationService,
    private healthMonitor: HealthMonitorService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & {
          correlationId?: string;
          user?: { id?: string; organizationId?: string };
        }
      >();
    const response = context.switchToHttp().getResponse<Response>();

    const correlationId =
      (request.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) ||
      crypto.randomUUID().slice(0, 8);
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    const { method, url } = request;
    const start = Date.now();
    const userId = request.user?.id || 'anonymous';
    const organizationId = request.user?.organizationId || '';

    this.correlationService.run(
      { correlationId, userId, organizationId },
      () => {
        winstonLogger.info('request_start', {
          correlationId,
          method,
          url,
          userId,
          organizationId,
        });
      },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          winstonLogger.info('request_end', {
            correlationId,
            method,
            url,
            userId,
            organizationId,
            duration,
            status: response.statusCode,
          });
          this.healthMonitor.recordSuccess(
            method,
            url.split('?')[0],
            response.statusCode,
            duration,
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - start;
          const status = (error as { status?: number }).status || 500;
          winstonLogger.error('request_error', {
            correlationId,
            method,
            url,
            userId,
            organizationId,
            duration,
            status,
            error: error.message,
          });
          this.healthMonitor.recordError(
            method,
            url.split('?')[0],
            status,
            duration,
            error.message,
          );
        },
      }),
    );
  }
}
