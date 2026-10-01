import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import {
  HierarchyScopeLevel,
  HIERARCHY_SCOPE_ORDER,
  PermissionScope,
} from '../interfaces/rbac.types';

interface RoleAssignmentRow {
  roleId: string;
  userId: string;
  organizationId: string | null;
  hospitalGroupId: string | null;
  hospitalId: string | null;
  departmentId: string | null;
  unitId: string | null;
}

@Injectable()
export class ScopeResolutionService {
  private readonly logger = new Logger(ScopeResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserAssignments(userId: string): Promise<RoleAssignmentRow[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId, isActive: true },
      select: {
        roleId: true,
        userId: true,
        organizationId: true,
        hospitalGroupId: true,
        hospitalId: true,
        departmentId: true,
        unitId: true,
      },
    });
    return assignments as unknown as RoleAssignmentRow[];
  }

  resolveCoveringAssignments(
    assignments: RoleAssignmentRow[],
    targetScope: PermissionScope,
  ): RoleAssignmentRow[] {
    return assignments.filter((a) => this.covers(a, targetScope));
  }

  private covers(
    assignment: RoleAssignmentRow,
    target: PermissionScope,
  ): boolean {
    if (assignment.hospitalGroupId && target.hospitalGroupId) {
      if (assignment.hospitalGroupId !== target.hospitalGroupId) return false;
      if (!target.hospitalId) return true;
    }
    if (assignment.hospitalId && target.hospitalId) {
      if (assignment.hospitalId !== target.hospitalId) return false;
      if (!target.departmentId && !target.unitId) return true;
    }
    if (assignment.departmentId && target.departmentId) {
      if (assignment.departmentId !== target.departmentId) return false;
      if (!target.unitId) return true;
    }
    if (assignment.unitId && target.unitId) {
      if (assignment.unitId !== target.unitId) return false;
      return true;
    }
    if (assignment.organizationId && target.organizationId) {
      if (assignment.organizationId !== target.organizationId) return false;
    }
    if (
      assignment.hospitalGroupId &&
      assignment.hospitalGroupId === target.hospitalGroupId
    )
      return true;
    if (assignment.hospitalId && assignment.hospitalId === target.hospitalId)
      return true;
    if (
      assignment.departmentId &&
      assignment.departmentId === target.departmentId
    )
      return true;
    if (assignment.unitId && assignment.unitId === target.unitId) return true;
    if (
      assignment.organizationId &&
      assignment.organizationId === target.organizationId
    )
      return true;
    return false;
  }

  getScopeLevel(assignment: RoleAssignmentRow): HierarchyScopeLevel {
    if (assignment.hospitalGroupId) return 'group';
    if (assignment.organizationId) return 'organization';
    if (assignment.hospitalId) return 'hospital';
    if (assignment.departmentId) return 'department';
    if (assignment.unitId) return 'unit';
    return 'organization';
  }

  scopeLevelWeight(level: HierarchyScopeLevel): number {
    return HIERARCHY_SCOPE_ORDER.indexOf(level);
  }
}
