import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma.service';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable()
export class InactivityInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) return next.handle();

    const now = Date.now();

    return next.handle().pipe(
      tap(async () => {
        try {
          await this.prisma.authSession.updateMany({
            where: {
              userId: user.id,
              revokedAt: null,
              lastUsedAt: { lt: new Date(now - INACTIVITY_TIMEOUT_MS) },
            },
            data: { revokedAt: new Date(now) },
          });

          await this.prisma.authSession.updateMany({
            where: {
              userId: user.id,
              jti: user.jti,
            },
            data: { lastUsedAt: new Date(now) },
          });
        } catch (error) {
          Logger.warn(
            `Failed to update inactivity tracking: ${error instanceof Error ? error.message : 'unknown'}`,
            'InactivityInterceptor',
          );
        }
      }),
    );
  }
}
