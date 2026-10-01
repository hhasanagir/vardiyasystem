export type RbacRoleName =
  | 'SYSTEM_ADMIN'
  | 'HOSPITAL_ADMIN'
  | 'IMAGING_DIRECTOR'
  | 'SUPERVISOR'
  | 'MEDICAL_ENGINEER'
  | 'SENIOR_TECHNICIAN'
  | 'TECHNICIAN'
  | 'ASSISTANT_TECHNICIAN'
  | 'SECRETARY'
  | 'GUEST';

export const ROLE_LEVELS: Record<RbacRoleName, number> = {
  SYSTEM_ADMIN: 1000,
  HOSPITAL_ADMIN: 800,
  IMAGING_DIRECTOR: 600,
  SUPERVISOR: 500,
  MEDICAL_ENGINEER: 400,
  SENIOR_TECHNICIAN: 300,
  TECHNICIAN: 200,
  ASSISTANT_TECHNICIAN: 150,
  SECRETARY: 100,
  GUEST: 50,
};

export const ROLE_LABELS: Record<RbacRoleName, string> = {
  SYSTEM_ADMIN: 'Sistem Yöneticisi',
  HOSPITAL_ADMIN: 'Hastane Yöneticisi',
  IMAGING_DIRECTOR: 'Görüntüleme Hizmetleri Müdürü',
  SUPERVISOR: 'Süpervizör',
  MEDICAL_ENGINEER: 'Medikal Mühendis',
  SENIOR_TECHNICIAN: 'Sorumlu Tekniker',
  TECHNICIAN: 'Tekniker',
  ASSISTANT_TECHNICIAN: 'Yardımcı Tekniker',
  SECRETARY: 'Sekreter',
  GUEST: 'Misafir',
};

export type HierarchyScopeLevel =
  | 'group'
  | 'hospital'
  | 'department'
  | 'unit'
  | 'organization';

export const HIERARCHY_SCOPE_ORDER: HierarchyScopeLevel[] = [
  'group',
  'organization',
  'hospital',
  'department',
  'unit',
];

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
    super(
      `Access denied: missing permission "${permission}"${context ? ` (${context})` : ''}`,
    );
    this.name = 'AccessDeniedError';
  }
}
