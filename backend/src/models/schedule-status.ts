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
  MEDICAL_ENGINEER = 'medical_engineer',
  SENIOR_TECHNICIAN = 'senior_technician',
  TECHNICIAN = 'technician',
  ASSISTANT_TECHNICIAN = 'assistant_technician',
  SECRETARY = 'secretary',
  GUEST = 'guest',
}

export const VALID_TRANSITIONS: Record<ScheduleStatus, TransitionRule[]> = {
  [ScheduleStatusEnum.DRAFT]: [
    {
      from: ScheduleStatusEnum.DRAFT,
      to: ScheduleStatusEnum.UNDER_REVIEW,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.SUPERVISOR,
        UserRole.MEDICAL_ENGINEER,
        UserRole.SENIOR_TECHNICIAN,
      ],
    },
  ],
  [ScheduleStatusEnum.UNDER_REVIEW]: [
    {
      from: ScheduleStatusEnum.UNDER_REVIEW,
      to: ScheduleStatusEnum.APPROVED,
      allowedRoles: [UserRole.IMAGING_DIRECTOR, UserRole.SUPERVISOR],
      requiredComment: false,
    },
    {
      from: ScheduleStatusEnum.UNDER_REVIEW,
      to: ScheduleStatusEnum.REJECTED,
      allowedRoles: [UserRole.IMAGING_DIRECTOR, UserRole.SUPERVISOR],
      requiredComment: true,
    },
  ],
  [ScheduleStatusEnum.APPROVED]: [
    {
      from: ScheduleStatusEnum.APPROVED,
      to: ScheduleStatusEnum.PUBLISHED,
      allowedRoles: [UserRole.IMAGING_DIRECTOR],
    },
  ],
  [ScheduleStatusEnum.PUBLISHED]: [
    {
      from: ScheduleStatusEnum.PUBLISHED,
      to: ScheduleStatusEnum.ARCHIVED,
      allowedRoles: [UserRole.IMAGING_DIRECTOR],
    },
  ],
  [ScheduleStatusEnum.ARCHIVED]: [],
  [ScheduleStatusEnum.REJECTED]: [
    {
      from: ScheduleStatusEnum.REJECTED,
      to: ScheduleStatusEnum.DRAFT,
      allowedRoles: [
        UserRole.IMAGING_DIRECTOR,
        UserRole.SUPERVISOR,
        UserRole.MEDICAL_ENGINEER,
        UserRole.SENIOR_TECHNICIAN,
      ],
    },
  ],
};

export function isValidTransition(
  currentStatus: ScheduleStatus | string,
  newStatus: ScheduleStatus | string,
): boolean {
  const transitions = VALID_TRANSITIONS[currentStatus as ScheduleStatus];
  return transitions.some((t) => t.to === newStatus);
}

export function canRoleTransition(
  currentStatus: ScheduleStatus,
  newStatus: ScheduleStatus,
  userRole: string,
): boolean {
  const transitions = VALID_TRANSITIONS[currentStatus];
  const transition = transitions.find((t) => t.to === newStatus);

  if (!transition) return false;

  const roleEnum = userRole as UserRole;
  return (
    transition.allowedRoles.includes(roleEnum) ||
    userRole === 'system_admin' ||
    userRole === 'hospital_admin'
  );
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
  return (
    status === ScheduleStatusEnum.DRAFT ||
    status === ScheduleStatusEnum.REJECTED
  );
}

export function isPublished(status: ScheduleStatus | string): boolean {
  return (
    status === ScheduleStatusEnum.PUBLISHED ||
    status === ScheduleStatusEnum.ARCHIVED
  );
}

export function canApprove(role: string): boolean {
  const approvers = [UserRole.IMAGING_DIRECTOR, UserRole.SUPERVISOR];
  return (
    approvers.includes(role as UserRole) ||
    role === 'system_admin' ||
    role === 'hospital_admin'
  );
}

export function canPublish(role: string): boolean {
  const publishers = [UserRole.IMAGING_DIRECTOR];
  return (
    publishers.includes(role as UserRole) ||
    role === 'system_admin' ||
    role === 'hospital_admin'
  );
}

const ROLE_LEVELS_MAP: Record<UserRole, number> = {
  [UserRole.GUEST]: 50,
  [UserRole.SECRETARY]: 100,
  [UserRole.ASSISTANT_TECHNICIAN]: 150,
  [UserRole.TECHNICIAN]: 200,
  [UserRole.SENIOR_TECHNICIAN]: 300,
  [UserRole.MEDICAL_ENGINEER]: 400,
  [UserRole.SUPERVISOR]: 500,
  [UserRole.IMAGING_DIRECTOR]: 600,
  [UserRole.HOSPITAL_ADMIN]: 800,
  [UserRole.SYSTEM_ADMIN]: 1000,
};

export function canDirectAssign(role: string): boolean {
  const level = ROLE_LEVELS_MAP[role as UserRole] ?? 0;
  return level >= 300 || role === 'system_admin' || role === 'hospital_admin';
}

export function normalizeStatus(status: string): ScheduleStatus {
  const normalized = status
    .toLowerCase()
    .replace(/[\s-]+/g, '_') as ScheduleStatus;
  const validStatuses: ScheduleStatus[] = [
    ScheduleStatusEnum.DRAFT,
    ScheduleStatusEnum.UNDER_REVIEW,
    ScheduleStatusEnum.APPROVED,
    ScheduleStatusEnum.PUBLISHED,
    ScheduleStatusEnum.ARCHIVED,
    ScheduleStatusEnum.REJECTED,
  ];
  return validStatuses.includes(normalized)
    ? normalized
    : ScheduleStatusEnum.DRAFT;
}
