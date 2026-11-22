/**
 * Role-Based Access Control Guards
 * 
 * Server-side authorization - MUST be enforced on backend
 */

import {
  UserRole,
  canApprove as canApproveSchedule,
  canPublish as canPublishSchedule,
  canSubmitForReview,
} from '../models/schedule-status';

/** Numeric hierarchy: higher = more authority */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SYSTEM_ADMIN]: 1000,
  [UserRole.HOSPITAL_ADMIN]: 800,
  [UserRole.PROJECT_MANAGER]: 700,
  [UserRole.IMAGING_DIRECTOR]: 600,
  [UserRole.CHIEF_TECHNICIAN]: 550,
  [UserRole.SUPERVISOR]: 500,
  [UserRole.FIELD_SUPERVISOR]: 450,
  [UserRole.MEDICAL_ENGINEER]: 400,
  [UserRole.HR]: 350,
  [UserRole.SENIOR_TECHNICIAN]: 300,
  [UserRole.TECHNICIAN]: 200,
  [UserRole.ASSISTANT_TECHNICIAN]: 150,
  [UserRole.SECRETARY]: 100,
  [UserRole.GUEST]: 50,
};

/** Check if `userRole` has at least the authority of `requiredRole` */
export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

export interface RolePermissions {
  canView: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canPublish: boolean;
  canArchive: boolean;
  canRollback: boolean;
  canCreateRevision: boolean;
  canViewAudit: boolean;
}

/**
 * P2-04 — workflow flags are aligned with the canonical strictest role sets
 * in `models/schedule-status.ts`. `canEdit` remains a draft-editing right and
 * is intentionally independent from `canSubmit`. A regression spec asserts
 * this alignment for every role so the three maps cannot drift again.
 */
function workflowPermissions(role: UserRole, overrides: Partial<RolePermissions> = {}): RolePermissions {
  const approver = canApproveSchedule(role);
  const publisher = canPublishSchedule(role);
  return {
    canView: true,
    canEdit: false,
    canSubmit: canSubmitForReview(role),
    canApprove: approver,
    canReject: approver,
    canPublish: publisher,
    canArchive: publisher,
    canRollback: hasMinRole(role, UserRole.HOSPITAL_ADMIN),
    canCreateRevision: approver,
    canViewAudit: false,
    ...overrides,
  };
}

export const ROLE_PERMISSIONS: Partial<Record<UserRole, RolePermissions>> = {
  [UserRole.SYSTEM_ADMIN]: workflowPermissions(UserRole.SYSTEM_ADMIN, { canEdit: true, canViewAudit: true }),
  [UserRole.HOSPITAL_ADMIN]: workflowPermissions(UserRole.HOSPITAL_ADMIN, { canEdit: true, canViewAudit: true }),
  [UserRole.PROJECT_MANAGER]: workflowPermissions(UserRole.PROJECT_MANAGER, { canEdit: true, canViewAudit: true }),
  [UserRole.CHIEF_TECHNICIAN]: workflowPermissions(UserRole.CHIEF_TECHNICIAN, { canEdit: true, canViewAudit: true }),
  [UserRole.IMAGING_DIRECTOR]: workflowPermissions(UserRole.IMAGING_DIRECTOR, { canEdit: true, canViewAudit: true }),
  [UserRole.SUPERVISOR]: workflowPermissions(UserRole.SUPERVISOR, { canEdit: true, canViewAudit: true }),
  [UserRole.FIELD_SUPERVISOR]: workflowPermissions(UserRole.FIELD_SUPERVISOR, { canEdit: true, canViewAudit: true }),
  [UserRole.MEDICAL_ENGINEER]: workflowPermissions(UserRole.MEDICAL_ENGINEER, { canEdit: true, canViewAudit: true }),
  [UserRole.SENIOR_TECHNICIAN]: workflowPermissions(UserRole.SENIOR_TECHNICIAN, { canEdit: true }),
  [UserRole.TECHNICIAN]: workflowPermissions(UserRole.TECHNICIAN),
  [UserRole.ASSISTANT_TECHNICIAN]: workflowPermissions(UserRole.ASSISTANT_TECHNICIAN),
};

export class RoleGuard {
  static canPerformAction(role: UserRole, action: keyof RolePermissions): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) return false;
    return permissions[action] === true;
  }

  static getPermissions(role: UserRole): RolePermissions {
    return ROLE_PERMISSIONS[role] || {
      canView: false,
      canEdit: false,
      canSubmit: false,
      canApprove: false,
      canReject: false,
      canPublish: false,
      canArchive: false,
      canRollback: false,
      canCreateRevision: false,
      canViewAudit: false,
    };
  }

  static requirePermission(role: UserRole, action: keyof RolePermissions): void {
    if (!this.canPerformAction(role, action)) {
      throw new AuthorizationError(
        `${action} işlemi için yetkiniz yok`,
        role,
        action
      );
    }
  }

  static getRoleLabel(role: UserRole): string {
    const labels: Partial<Record<UserRole, string>> = {
      [UserRole.IMAGING_DIRECTOR]: 'Görüntüleme Hiz. Müdürü',
      [UserRole.SUPERVISOR]: 'Süpervizör',
      [UserRole.FIELD_SUPERVISOR]: 'Saha Sorumlusu',
      [UserRole.MEDICAL_ENGINEER]: 'Medikal Mühendis',
      [UserRole.SENIOR_TECHNICIAN]: 'Sorumlu Tekniker',
      [UserRole.TECHNICIAN]: 'Tekniker',
      [UserRole.ASSISTANT_TECHNICIAN]: 'Yardımcı Tekniker',
      [UserRole.SECRETARY]: 'Sekreter',
    };
    return labels[role] || role;
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public role: UserRole,
    public attemptedAction: string
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  unit?: string;
  department?: string;
}

export function extractUserFromRequest(req: { user?: AuthenticatedUser }): AuthenticatedUser | null {
  // In real implementation, extract from JWT/session
  return req.user || null;
}

export function requireAuth(req: { user?: AuthenticatedUser }): AuthenticatedUser {
  const user = extractUserFromRequest(req);
  if (!user) {
    throw new Error('Kimlik doğrulama gerekli');
  }
  return user;
}
