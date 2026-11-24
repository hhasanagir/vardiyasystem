import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MinRole } from '../../guards/min-role';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AuditAccessGuard implements CanActivate {
  // Supervisor floor (matches both legacy hierarchy value and ROLE_LEVELS.SUPERVISOR).
  private readonly minRole = MinRole.SUPERVISOR;
  private readonly supervisorRbacLevel = 500;

  constructor(
    private reflector: Reflector,
    private rbacService?: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.id) return false;

    const hierarchy: Record<string, number> = {
      guest: 50, secretary: 100, assistant_technician: 150, technician: 200,
      senior_technician: 300, medical_engineer: 400, supervisor: 500,
      imaging_director: 600, hospital_admin: 800, system_admin: 1000,
    };
    const legacyOk = hierarchy[user.role] >= hierarchy[this.minRole];

    // RBAC-aware (Phase 5C.9): a supervisor granted via RBAC without the legacy
    // role string must still pass; FIELD_SUPERVISOR (400) never passes the 500
    // floor. Legacy check remains as a fallback for un-migrated accounts.
    const rbacOk = this.rbacService
      ? await this.rbacService.hasMinRoleLevel(user.id, this.supervisorRbacLevel).catch(() => false)
      : false;

    return legacyOk || rbacOk;
  }
}
