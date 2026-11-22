import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { RbacService } from '../services/rbac.service';

const ROLE_HIERARCHY: Record<string, number> = {
  system_admin: 1000,
  hospital_admin: 800,
  project_manager: 700,
  imaging_director: 600,
  chief_technician: 550,
  supervisor: 500,
  field_supervisor: 450,
  medical_engineer: 400,
  hr: 350,
  senior_technician: 300,
  technician: 200,
  assistant_technician: 150,
  secretary: 100,
  guest: 50,
};

const UNIT_TYPE_BY_CODE: Record<string, string> = {
  MR: 'mr',
  BT: 'bt',
  RONTGEN: 'rontgen',
  NUKLEER: 'nukleer',
  RONK: 'onkoloji',
  SUPERVIZOR: 'supervizor',
};

export const unitAccessGuard: CanActivateFn = async (route) => {
  const authService = inject(AuthService);
  const rbac = inject(RbacService);
  const router = inject(Router);

  const user = authService.user();
  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  await rbac.ensureLoaded();

  const isFieldSupervisor = user.role === 'field_supervisor' || rbac.isFieldSupervisor();
  if (!isFieldSupervisor) return true;

  const unitType = route.data?.['unit'] as string | undefined;
  if (!unitType) return true;

  // Resolve the field supervisor's own unit (RBAC assignment is authoritative;
  // fall back to legacy user.unit.code for pre-RBAC seeds).
  const ownType = rbac.isFieldSupervisor()
    ? await rbac.getFieldSupervisorUnitType()
    : unitCodeToType(user.unit?.code);

  if (ownType === unitType) return true;

  // A field supervisor is strictly confined to their assigned unit. Unknown or
  // mismatched assignments are DENIED (fail closed), never allowed by default.
  router.navigate(['/app/dashboard']);
  return false;
};

function unitCodeToType(code?: string | null): string | undefined {
  if (!code) return undefined;
  return UNIT_TYPE_BY_CODE[code.trim().toUpperCase()];
}

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const minRole = route.data?.['minRole'] as string | undefined;

  if (!minRole) return true;

  const user = authService.user();
  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  if (userLevel >= requiredLevel) return true;

  router.navigate(['/app/dashboard']);
  return false;
};

export const rbacGuard: CanActivateFn = async (route) => {
  const rbac = inject(RbacService);
  const router = inject(Router);
  const requiredPermissions = route.data?.['permissions'] as string[] | undefined;
  const permissionMode = (route.data?.['permissionMode'] as string) ?? 'all';

  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  await rbac.ensureLoaded();

  const hasAccess = permissionMode === 'any'
    ? rbac.hasAnyPermission(requiredPermissions)
    : rbac.hasAllPermissions(requiredPermissions);

  if (hasAccess) return true;

  router.navigate(['/app/dashboard']);
  return false;
};