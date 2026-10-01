import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationService } from './correlation.service';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  constructor(private correlationService: CorrelationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const correlationId = request.headers['x-correlation-id'] || uuidv4();

    response.setHeader('X-Correlation-Id', correlationId);

    return new Observable<unknown>((subscriber) => {
      this.correlationService.run(
        {
          correlationId,
          userId: request.user?.id,
          organizationId: request.user?.organizationId,
        },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
