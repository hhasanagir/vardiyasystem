export type RbacRoleName = 'SYSTEM_ADMIN' | 'HOSPITAL_ADMIN' | 'IMAGING_DIRECTOR' | 'SUPERVISOR' | 'FIELD_SUPERVISOR' | 'MEDICAL_ENGINEER' | 'SENIOR_TECHNICIAN' | 'TECHNICIAN' | 'ASSISTANT_TECHNICIAN' | 'SECRETARY' | 'GUEST' | 'PROJECT_MANAGER' | 'CHIEF_TECHNICIAN' | 'HR';

export const ROLE_LEVELS: Record<RbacRoleName, number> = {
  SYSTEM_ADMIN: 1000,
  HOSPITAL_ADMIN: 800,
  PROJECT_MANAGER: 700,
  IMAGING_DIRECTOR: 600,
  CHIEF_TECHNICIAN: 550,
  SUPERVISOR: 500,
  FIELD_SUPERVISOR: 450,
  MEDICAL_ENGINEER: 400,
  HR: 350,
  SENIOR_TECHNICIAN: 300,
  TECHNICIAN: 200,
  ASSISTANT_TECHNICIAN: 150,
  SECRETARY: 100,
  GUEST: 50,
};

export const ROLE_LABELS: Record<RbacRoleName, string> = {
  SYSTEM_ADMIN: 'Sistem Yöneticisi',
  HOSPITAL_ADMIN: 'Hastane Yöneticisi',
  PROJECT_MANAGER: 'Proje Yöneticisi',
  IMAGING_DIRECTOR: 'Görüntüleme Hizmetleri Müdürü',
  CHIEF_TECHNICIAN: 'Baş Tekniker',
  SUPERVISOR: 'Süpervizör',
  FIELD_SUPERVISOR: 'Saha Sorumlusu',
  MEDICAL_ENGINEER: 'Medikal Mühendis',
  HR: 'İnsan Kaynakları',
  SENIOR_TECHNICIAN: 'Sorumlu Tekniker',
  TECHNICIAN: 'Tekniker',
  ASSISTANT_TECHNICIAN: 'Yardımcı Tekniker',
  SECRETARY: 'Sekreter',
  GUEST: 'Misafir',
};

export type HierarchyScopeLevel = 'group' | 'hospital' | 'department' | 'unit' | 'organization';

export const HIERARCHY_SCOPE_ORDER: HierarchyScopeLevel[] = ['group', 'organization', 'hospital', 'department', 'unit'];

/**
 * Roles that legitimately operate WITHOUT a tenant.
 *
 * Every other role is tenant-scoped: `TenantContextInterceptor` can only filter
 * Prisma queries by organization, so a tenant role whose `organizationId` is
 * NULL would silently read and write across every tenant. Treating "no tenant"
 * as "all tenants" is the failure mode this set exists to prevent.
 */
export const CROSS_TENANT_ROLES: ReadonlySet<string> = new Set(['system_admin', 'hospital_admin']);

/** Whether a role is allowed to act without an organization context. */
export function isCrossTenantRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return CROSS_TENANT_ROLES.has(role);
}

export interface RbacUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  unitId: string | null;
  rbacRoles: {
    roleId: string;
    roleName: RbacRoleName;
    organizationId: string | null;
    hospitalGroupId: string | null;
    hospitalId: string | null;
    departmentId: string | null;
    unitId: string | null;
  }[];
  permissions: string[];
}

export interface PermissionScope {
  organizationId?: string | null;
  hospitalGroupId?: string | null;
  hospitalId?: string | null;
  departmentId?: string | null;
  unitId?: string | null;
}

export class AccessDeniedError extends Error {
  constructor(permission: string, context?: string) {
    super(`Access denied: missing permission "${permission}"${context ? ` (${context})` : ''}`);
    this.name = 'AccessDeniedError';
  }
}
