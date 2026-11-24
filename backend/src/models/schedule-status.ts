/**
 * Schedule Status State Machine
 * 
 * Valid Transitions:
 * draft → under_review
 * under_review → approved | rejected
 * approved → published
 * published → archived
 * rejected → draft
 */

export enum ScheduleStatusEnum {
  DRAFT = 'draft',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  REJECTED = 'rejected',
}

export type ScheduleStatus = ScheduleStatusEnum;

export interface TransitionRule {
  from: ScheduleStatus;
  to: ScheduleStatus;
  allowedRoles: UserRole[];
  requiredComment?: boolean;
}

export enum UserRole {
  SYSTEM_ADMIN = 'system_admin',
  HOSPITAL_ADMIN = 'hospital_admin',
  IMAGING_DIRECTOR = 'imaging_director',
  SUPERVISOR = 'supervisor',
  FIELD_SUPERVISOR = 'field_supervisor',
  MEDICAL_ENGINEER = 'medical_engineer',
  SENIOR_TECHNICIAN = 'senior_technician',
  TECHNICIAN = 'technician',
  ASSISTANT_TECHNICIAN = 'assistant_technician',
  SECRETARY = 'secretary',
  GUEST = 'guest',
  PROJECT_MANAGER = 'project_manager',
  CHIEF_TECHNICIAN = 'chief_technician',
  HR = 'hr',
}

/**
 * P2-04 — canonical strictest schedule-workflow role sets.
 *
 * These sets are the single source for the legacy state machine, the DDD
 * aggregate transition map and `ROLE_PERMISSIONS`. They are intentionally
 * explicit (not a raw `hasMinRole` threshold): the controller `MinRole`
 * decorators are the outer gate, while these sets preserve the previously
 * effective *narrowest* authorization on both surfaces. Narrowing here never
 * widens an existing controller gate.
 *
 * - submit / re-open a rejected draft: supervisor and above that were already
 *   allowed on at least one surface. `field_supervisor`, `medical_engineer`
 *   and `senior_technician` are removed (they are below supervisor).
 * - approve / reject / publish / archive: `imaging_director` plus the
 *   hospital/system administrators already accepted by `canApprove`.
 */
export const SCHEDULE_SUBMIT_ROLES: ReadonlySet<string> = new Set([
  UserRole.SUPERVISOR,
  UserRole.IMAGING_DIRECTOR,
  UserRole.HOSPITAL_ADMIN,
  UserRole.SYSTEM_ADMIN,
]);

export const SCHEDULE_APPROVER_ROLES: ReadonlySet<string> = new Set([
  UserRole.IMAGING_DIRECTOR,
  UserRole.HOSPITAL_ADMIN,
  UserRole.SYSTEM_ADMIN,
]);

export function canSubmitForReview(role: string): boolean {
  return SCHEDULE_SUBMIT_ROLES.has(role);
}

export const VALID_TRANSITIONS: Record<ScheduleStatus, TransitionRule[]> = {
  [ScheduleStatusEnum.DRAFT]: [
    {
      from: ScheduleStatusEnum.DRAFT,
      to: ScheduleStatusEnum.UNDER_REVIEW,
      allowedRoles: [
        UserRole.SUPERVISOR,
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
    },
  ],
  [ScheduleStatusEnum.UNDER_REVIEW]: [
    {
      from: ScheduleStatusEnum.UNDER_REVIEW,
      to: ScheduleStatusEnum.APPROVED,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
      requiredComment: false,
    },
    {
      from: ScheduleStatusEnum.UNDER_REVIEW,
      to: ScheduleStatusEnum.REJECTED,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
      requiredComment: true,
    },
  ],
  [ScheduleStatusEnum.APPROVED]: [
    {
      from: ScheduleStatusEnum.APPROVED,
      to: ScheduleStatusEnum.PUBLISHED,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
    },
  ],
  [ScheduleStatusEnum.PUBLISHED]: [
    {
      from: ScheduleStatusEnum.PUBLISHED,
      to: ScheduleStatusEnum.ARCHIVED,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
    },
  ],
  [ScheduleStatusEnum.ARCHIVED]: [],
  [ScheduleStatusEnum.REJECTED]: [
    {
      from: ScheduleStatusEnum.REJECTED,
      to: ScheduleStatusEnum.DRAFT,
      allowedRoles: [
        UserRole.SUPERVISOR,
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ],
    },
  ],
};

export function isValidTransition(
  currentStatus: ScheduleStatus | string,
  newStatus: ScheduleStatus | string
): boolean {
  const transitions = VALID_TRANSITIONS[currentStatus as ScheduleStatus];
  return transitions.some(t => t.to === newStatus);
}

export function canRoleTransition(
  currentStatus: ScheduleStatus,
  newStatus: ScheduleStatus,
  userRole: string
): boolean {
  const transitions = VALID_TRANSITIONS[currentStatus];
  const transition = transitions.find(t => t.to === newStatus);
  
  if (!transition) return false;
  
  const roleEnum = userRole as UserRole;
  return transition.allowedRoles.includes(roleEnum) || 
         userRole === 'system_admin' || 
         userRole === 'hospital_admin';
}

export function getStatusLabel(status: ScheduleStatus): string {
  const labels: Record<ScheduleStatus, string> = {
    [ScheduleStatusEnum.DRAFT]: 'Taslak',
    [ScheduleStatusEnum.UNDER_REVIEW]: 'İncelemede',
    [ScheduleStatusEnum.APPROVED]: 'Onaylandı',
    [ScheduleStatusEnum.PUBLISHED]: 'Yayınlandı',
    [ScheduleStatusEnum.ARCHIVED]: 'Arşivlendi',
    [ScheduleStatusEnum.REJECTED]: 'Reddedildi',
  };
  return labels[status] || status;
}

export function getStatusColor(status: ScheduleStatus): string {
  const colors: Record<ScheduleStatus, string> = {
    [ScheduleStatusEnum.DRAFT]: '#f59e0b',
    [ScheduleStatusEnum.UNDER_REVIEW]: '#3b82f6',
    [ScheduleStatusEnum.APPROVED]: '#22c55e',
    [ScheduleStatusEnum.PUBLISHED]: '#8b5cf6',
    [ScheduleStatusEnum.ARCHIVED]: '#64748b',
    [ScheduleStatusEnum.REJECTED]: '#ef4444',
  };
  return colors[status] || '#64748b';
}

export function isEditable(status: ScheduleStatus | string): boolean {
  return status === ScheduleStatusEnum.DRAFT || status === ScheduleStatusEnum.REJECTED;
}

export function isPublished(status: ScheduleStatus | string): boolean {
  return status === ScheduleStatusEnum.PUBLISHED || status === ScheduleStatusEnum.ARCHIVED;
}

export function canApprove(role: string): boolean {
  return SCHEDULE_APPROVER_ROLES.has(role);
}

export function canPublish(role: string): boolean {
  return SCHEDULE_APPROVER_ROLES.has(role);
}

const ROLE_LEVELS_MAP: Record<UserRole, number> = {
  [UserRole.GUEST]: 50,
  [UserRole.SECRETARY]: 100,
  [UserRole.ASSISTANT_TECHNICIAN]: 150,
  [UserRole.TECHNICIAN]: 200,
  [UserRole.SENIOR_TECHNICIAN]: 300,
  [UserRole.HR]: 350,
  [UserRole.MEDICAL_ENGINEER]: 400,
  [UserRole.FIELD_SUPERVISOR]: 450,
  [UserRole.SUPERVISOR]: 500,
  [UserRole.CHIEF_TECHNICIAN]: 550,
  [UserRole.IMAGING_DIRECTOR]: 600,
  [UserRole.PROJECT_MANAGER]: 700,
  [UserRole.HOSPITAL_ADMIN]: 800,
  [UserRole.SYSTEM_ADMIN]: 1000,
};

export function canDirectAssign(role: string): boolean {
  const level = ROLE_LEVELS_MAP[role as UserRole] ?? 0;
  return level >= 300 || role === 'system_admin' || role === 'hospital_admin';
}

export function normalizeStatus(status: string): ScheduleStatus {
  const normalized = status.toLowerCase().replace(/[\s-]+/g, '_') as ScheduleStatus;
  const validStatuses: ScheduleStatus[] = [
    ScheduleStatusEnum.DRAFT,
    ScheduleStatusEnum.UNDER_REVIEW,
    ScheduleStatusEnum.APPROVED,
    ScheduleStatusEnum.PUBLISHED,
    ScheduleStatusEnum.ARCHIVED,
    ScheduleStatusEnum.REJECTED,
  ];
  return validStatuses.includes(normalized) ? normalized : ScheduleStatusEnum.DRAFT;
}