import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac.service';
import { ScopeResolutionService } from '../services/scope-resolution.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SCOPE_LEVEL_KEY } from '../decorators/scope-level.decorator';
import { ROLE_LEVELS, HierarchyScopeLevel } from '../interfaces/rbac.types';
import { AuditLogService } from '../../audit-log/audit-log.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly scopeResolution: ScopeResolutionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = user?.id;

    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const maxLevel = await this.rbacService.getUserMaxRoleLevel(userId);
    if (maxLevel >= ROLE_LEVELS.SYSTEM_ADMIN) {
      return true;
    }

    const scopeLevel = this.reflector.getAllAndOverride<
      HierarchyScopeLevel | undefined
    >(SCOPE_LEVEL_KEY, [context.getHandler(), context.getClass()]);

    const userPermissions = await this.rbacService.getUserPermissions(userId, {
      organizationId: user?.organizationId,
      unitId: user?.unitId,
    });

    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAll && scopeLevel) {
      const assignments = await this.scopeResolution.getUserAssignments(userId);
      const covering = this.scopeResolution.resolveCoveringAssignments(
        assignments,
        {
          organizationId: user?.organizationId,
          unitId: user?.unitId,
        },
      );

      const coveringPermissionSet = new Set<string>();
      for (const assignment of covering) {
        const rolePerms = await this.rbacService.getRolePermissions(
          assignment.roleId,
        );
        rolePerms.forEach((p) => coveringPermissionSet.add(p));
      }

      const hasAtCoveringScope = requiredPermissions.every((perm) =>
        coveringPermissionSet.has(perm),
      );
      if (!hasAtCoveringScope) {
        this.logPermissionDenied(userId, request, requiredPermissions).catch(
          () => {},
        );
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    if (!hasAll) {
      this.logPermissionDenied(userId, request, requiredPermissions).catch(
        () => {},
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private async logPermissionDenied(
    userId: string,
    request: any,
    requiredPermissions: string[],
  ): Promise<void> {
    await this.auditLog.log({
      userId,
      action: 'PERMISSION_DENIED',
      entityType: 'AUTH',
      entityId: userId,
      ipAddress: request.ip,
      userAgent: request.headers?.['user-agent'],
      metadata: {
        method: request.method,
        path: request.url,
        requiredPermissions,
      },
    });
  }
}
