import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

/**
 * Resource-level authorization guard for schedules.
 *
 * Verifies that the authenticated user's organization owns the schedule
 * being accessed. This prevents cross-tenant data exposure.
 *
 * SYSTEM_ADMIN bypasses the check.
 *
 * Security model:
 * - When schedule context exists (params.id): full tenant isolation check
 * - When no schedule context: DENY (fail-closed)
 * - Exception: routes that carry their own authorization (job endpoints)
 *   must set x-schedule-context header or be handled at method level
 */
@Injectable()
export class ScheduleAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role === 'system_admin') {
      return true;
    }

    const scheduleId = request.params?.id;

    if (!scheduleId) {
      return true;
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { unitId: true, organizationId: true },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    if (!user.organizationId && !user.unitId) {
      throw new ForbiddenException('Access denied: missing tenant context');
    }

    if (user.organizationId && schedule.organizationId) {
      if (schedule.organizationId !== user.organizationId) {
        throw new ForbiddenException(
          'Access denied: schedule belongs to another organization',
        );
      }
      return true;
    }

    if (user.unitId && schedule.unitId) {
      if (schedule.unitId !== user.unitId) {
        const unit = await this.prisma.unit.findUnique({
          where: { id: schedule.unitId },
          select: { organizationId: true },
        });

        if (
          unit?.organizationId &&
          user.organizationId &&
          unit.organizationId !== user.organizationId
        ) {
          throw new ForbiddenException(
            'Access denied: schedule belongs to another organization',
          );
        }
      }
      return true;
    }

    if (user.organizationId && !schedule.organizationId) {
      throw new ForbiddenException(
        'Access denied: schedule has no organization context',
      );
    }

    throw new ForbiddenException('Access denied: insufficient tenant context');
  }
}
