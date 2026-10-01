import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { RbacService } from '../services/rbac.service';

const ROLE_HIERARCHY: Record<string, number> = {
  system_admin: 1000,
  hospital_admin: 800,
  imaging_director: 600,
  supervisor: 500,
  medical_engineer: 400,
  senior_technician: 300,
  technician: 200,
  assistant_technician: 150,
  secretary: 100,
  guest: 50,
};

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

  const hasAccess =
    permissionMode === 'any'
      ? rbac.hasAnyPermission(requiredPermissions)
      : rbac.hasAllPermissions(requiredPermissions);

  if (hasAccess) return true;

  router.navigate(['/app/dashboard']);
  return false;
};
