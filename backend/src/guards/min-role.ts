import { UserRole } from '../models/schedule-status';

/** Named minimum role levels for controller access control */
export const MinRole = {
  /** guest (50) - read-only access */
  VIEWER: UserRole.GUEST,
  /** secretary (100) - office/admin support */
  SECRETARY: UserRole.SECRETARY,
  /** assistant_technician (150) - technical support */
  ASSISTANT_TECHNICIAN: UserRole.ASSISTANT_TECHNICIAN,
  /** technician (200) - view + own actions */
  TECHNICIAN: UserRole.TECHNICIAN,
  /** senior_technician (300) - senior technical operations */
  SENIOR_TECHNICIAN: UserRole.SENIOR_TECHNICIAN,
  /** medical_engineer (400) - engineering operations */
  MEDICAL_ENGINEER: UserRole.MEDICAL_ENGINEER,
  /** supervisor (500) - unit-scoped supervisor */
  SUPERVISOR: UserRole.SUPERVISOR,
  /** imaging_director (600) - imaging directorate management */
  IMAGING_DIRECTOR: UserRole.IMAGING_DIRECTOR,
  /** hospital_admin (800) - hospital-wide management */
  HOSPITAL_ADMIN: UserRole.HOSPITAL_ADMIN,
  /** system_admin (1000) - full access */
  SYSTEM_ADMIN: UserRole.SYSTEM_ADMIN,
  /** @deprecated Use SENIOR_TECHNICIAN */
  HEAD_TECHNICIAN: UserRole.SENIOR_TECHNICIAN,
  /** @deprecated Use MEDICAL_ENGINEER */
  FIELD_SUPERVISOR: UserRole.MEDICAL_ENGINEER,
  /** @deprecated Use IMAGING_DIRECTOR */
  PLANNER: UserRole.IMAGING_DIRECTOR,
  /** @deprecated Use HOSPITAL_ADMIN */
  ADMIN: UserRole.HOSPITAL_ADMIN,
  /** @deprecated Use SYSTEM_ADMIN */
  SUPER_ADMIN: UserRole.SYSTEM_ADMIN,
} as const;

/** Roles that are scoped to a single unit */
export const UNIT_SCOPED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.SENIOR_TECHNICIAN,
  UserRole.MEDICAL_ENGINEER,
  UserRole.SUPERVISOR,
]);

export function isUnitScopedRole(role: string): boolean {
  return UNIT_SCOPED_ROLES.has(role as UserRole);
}
