import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RbacService } from '../rbac.service';
import { ScopeResolutionService } from '../services/scope-resolution.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SCOPE_LEVEL_KEY } from '../decorators/scope-level.decorator';
import { ROLE_LEVELS, HierarchyScopeLevel } from '../interfaces/rbac.types';
import { AuditLogService } from '../../audit-log/audit-log.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly scopeResolution: ScopeResolutionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { id?: string; organizationId?: string | null; unitId?: string | null } | undefined;
    const userId = user?.id;

    // This guard runs as a route guard AFTER JwtAuthGuard. A missing principal
    // therefore means authentication did not run for this route: fail closed
    // instead of letting the request through unchecked.
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const maxLevel = await this.rbacService.getUserMaxRoleLevel(userId);
    if (maxLevel >= ROLE_LEVELS.SYSTEM_ADMIN) {
      return true;
    }

    const scopeLevel = this.reflector.getAllAndOverride<HierarchyScopeLevel | undefined>(SCOPE_LEVEL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const userPermissions = await this.rbacService.getUserPermissions(userId, {
      organizationId: user?.organizationId,
      unitId: user?.unitId,
    });

    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll && scopeLevel) {
      const assignments = await this.scopeResolution.getUserAssignments(userId);
      const covering = this.scopeResolution.resolveCoveringAssignments(assignments, {
        organizationId: user?.organizationId,
        unitId: user?.unitId,
      });

      const coveringPermissionSet = new Set<string>();
      for (const assignment of covering) {
        const rolePerms = await this.rbacService.getRolePermissions(assignment.roleId);
        rolePerms.forEach((p) => coveringPermissionSet.add(p));
      }

      const hasAtCoveringScope = requiredPermissions.every((perm) => coveringPermissionSet.has(perm));
      if (!hasAtCoveringScope) {
        await this.reportPermissionDenied(userId, request, requiredPermissions);
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    if (!hasAll) {
      await this.reportPermissionDenied(userId, request, requiredPermissions);
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  /**
   * Denials must be auditable, but an audit failure must never turn a 403 into a
   * 500: the denial is logged and the original ForbiddenException is raised.
   */
  private async reportPermissionDenied(userId: string, request: Request, requiredPermissions: string[]): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.warn(
        `PERMISSION_DENIED audit write failed for user ${userId} on ${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
