import type { UserRole, OrganizationPlan } from '../enums';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organization?: Organization;
  unitId: string;
  unit?: OrganizationUnit;
}

export interface Organization {
  id: string;
  name: string;
  plan: OrganizationPlan;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationUnit {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  organizationId: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}
