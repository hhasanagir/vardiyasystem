import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLE_HIERARCHY, hasMinRole } from '../../../guards/role-guards';
import { UserRole } from '../../../models/schedule-status';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      return false;
    }

    const userRole = user.role as UserRole;

    const minRequired = requiredRoles.reduce<UserRole | null>((lowest, r) => {
      const role = r as UserRole;
      if (!lowest) return role;
      return (ROLE_HIERARCHY[role] ?? 0) < (ROLE_HIERARCHY[lowest] ?? 0)
        ? role
        : lowest;
    }, null);

    if (!minRequired) return false;

    return hasMinRole(userRole, minRequired);
  }
}
