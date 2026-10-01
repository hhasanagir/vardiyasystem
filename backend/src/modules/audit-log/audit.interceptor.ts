import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from './audit-log.service';
import { CorrelationService } from '../../correlation/correlation.service';
import { AUDIT_METADATA_KEY, AuditMetadata } from './audit.constants';
import {
  CLASSIFICATION_KEY,
  DataClassification,
} from '../data-classification/data-classification.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditLog: AuditLogService,
    private correlationService: CorrelationService,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditMeta = this.reflector.get<AuditMetadata>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );
    const dataClassification =
      this.reflector.get<DataClassification>(
        CLASSIFICATION_KEY,
        context.getHandler(),
      ) || 'UNCLASSIFIED';

    if (!auditMeta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;
    const entityType = auditMeta.entityType;
    const entityId = request.params?.id;

    const captureOldValue = async (): Promise<Record<
      string,
      unknown
    > | null> => {
      if (!entityId || !['PUT', 'PATCH', 'DELETE'].includes(method))
        return null;
      try {
        const modelMap: Record<string, string> = {
          user: 'user',
          personnel: 'personnel',
          schedule: 'schedule',
          assignment: 'assignment',
          unit: 'unit',
          device: 'device',
          shift: 'shifts',
          training: 'training',
          skill: 'skill',
          holiday: 'holiday',
          notification: 'notification',
          handover_note: 'handoverNote',
          attendance: 'attendanceRecord',
          device_incident: 'deviceIncident',
          shift_task: 'shiftTask',
        };
        const model = modelMap[entityType];
        if (!model) return null;
        const record = await (this.prisma as any)[model].findUnique({
          where: { id: entityId },
        });
        if (!record) return null;
        const { password, ...safe } = record;
        return safe;
      } catch {
        return null;
      }
    };

    return from(captureOldValue()).pipe(
      switchMap((oldValue) => {
        const startTime = Date.now();

        return next.handle().pipe(
          tap((responseBody: unknown) => {
            if (!user?.id) {
              // Unauthenticated requests must not write a fake 'system' userId
              // (audit_logs_userId_fkey violation). Skip the audit entry instead.
              return;
            }
            const ctx = this.correlationService.getContext();
            const result = responseBody as Record<string, unknown> | null;
            const responseStatus = context
              .switchToHttp()
              .getResponse().statusCode;

            this.auditLog
              .log({
                userId: user.id,
                userName: user.name || 'Sistem',
                userRole: user.role || 'SYSTEM',
                organizationId: user.organizationId || ctx?.organizationId,
                hospitalId: user.hospitalId,
                unitId: user.unitId,
                action: auditMeta.action,
                entityType: entityType,
                entityId: entityId || (result?.id as string | undefined),
                oldValue: oldValue || undefined,
                newValue: (['POST', 'PUT', 'PATCH'].includes(method)
                  ? result
                  : undefined) as Record<string, unknown> | undefined,
                description: auditMeta.description,
                ipAddress: request.ip,
                userAgent: request.headers?.['user-agent'],
                status: responseStatus >= 400 ? 'FAILURE' : 'SUCCESS',
                metadata: {
                  method: request.method,
                  path: request.route?.path || request.url,
                  responseStatus,
                  responseTime: Date.now() - startTime,
                },
              })
              .catch((err: Error) =>
                console.error('Audit log error:', err.message),
              );
          }),
          catchError((error) => {
            if (!user?.id) {
              // Unauthenticated failed requests: skip instead of writing a fake userId.
              throw error;
            }
            const ctx = this.correlationService.getContext();

            this.auditLog
              .log({
                userId: user.id,
                userName: user.name || 'Sistem',
                userRole: user.role || 'SYSTEM',
                organizationId: user.organizationId || ctx?.organizationId,
                unitId: user.unitId,
                action: auditMeta.action,
                entityType: entityType,
                entityId: entityId,
                description: `${auditMeta.description} - FAILED: ${error.message}`,
                ipAddress: request.ip,
                userAgent: request.headers?.['user-agent'],
                status: 'FAILURE',
                metadata: {
                  method: request.method,
                  path: request.route?.path || request.url,
                  error: error.message,
                },
              })
              .catch(() => {});
            throw error;
          }),
        );
      }),
    );
  }
}
