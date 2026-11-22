import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

/** Minimal shape of the RBAC-enriched authenticated user (jwt.strategy). */
interface HospitalScopeUser {
  id?: string;
  role?: string | null;
  organizationId?: string | null;
  rbacRoles?: Array<{
    roleName?: string;
    organizationId?: string | null;
    hospitalGroupId?: string | null;
    hospitalId?: string | null;
  }>;
}

@Injectable()
export class HospitalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Phase 5C.20 SEC-01: explicit platform-wide system admin.
   *
   * Mirrors the RBAC model's "globalSystemAdmin" (rbac.service.ts): a system
   * admin is platform-scoped when its assignment carries a NULL organizationId.
   * A legacy `system_admin`/`super_admin` account with a NULL organization is
   * treated the same way. This is the ONLY unresolved-org path allowed to
   * enumerate hospitals across tenants.
   */
  private isGlobalSystemAdmin(user?: HospitalScopeUser): boolean {
    const legacyPlatformRole = user?.role === 'system_admin' || user?.role === 'super_admin';
    if (legacyPlatformRole) return true;
    return (user?.rbacRoles ?? []).some(
      (r) => r.roleName === 'SYSTEM_ADMIN' && r.organizationId == null,
    );
  }

  /**
   * Resolve the tenant-scoped hospital search space for a user:
   *   - organizations assigned to the user (legacy + RBAC) -> their hospitalId
   *   - hospitalId scopes carried by RBAC assignments
   *   - hospitalGroupId scopes carried by RBAC assignments
   */
  private async resolveHospitalScope(user?: HospitalScopeUser): Promise<{ hospitalIds: string[]; groupIds: string[] }> {
    const orgIds = new Set<string>();
    if (user?.organizationId) orgIds.add(user.organizationId);
    for (const r of user?.rbacRoles ?? []) {
      if (r.organizationId) orgIds.add(r.organizationId);
    }

    const hospitalIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const r of user?.rbacRoles ?? []) {
      if (r.hospitalId) hospitalIds.add(r.hospitalId);
      if (r.hospitalGroupId) groupIds.add(r.hospitalGroupId);
    }

    if (orgIds.size > 0) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: Array.from(orgIds) }, isActive: true },
        select: { hospitalId: true },
      });
      for (const o of orgs) {
        if (o.hospitalId) hospitalIds.add(o.hospitalId);
      }
    }

    return { hospitalIds: Array.from(hospitalIds), groupIds: Array.from(groupIds) };
  }

  private hospitalWhere(hospitalIds: string[], groupIds: string[]): any[] {
    const conds: any[] = [];
    if (hospitalIds.length) conds.push({ id: { in: hospitalIds } });
    if (groupIds.length) conds.push({ groupId: { in: groupIds } });
    return conds;
  }

  /**
   * Phase 5C.20 SEC-01: tenant-scoped hospital list.
   *
   * A platform system admin (NULL-org SYSTEM_ADMIN) keeps the full catalog.
   * Every other authenticated user can only ever reach hospitals inside the
   * tenant space derived from their organizations and RBAC hospital/group
   * scope. Fail CLOSED (403) when no tenant scope can be resolved.
   */
  async findAllScoped(user?: HospitalScopeUser) {
    if (this.isGlobalSystemAdmin(user)) {
      return this.findAll();
    }
    const { hospitalIds, groupIds } = await this.resolveHospitalScope(user);
    if (hospitalIds.length === 0 && groupIds.length === 0) {
      throw new ForbiddenException('Bu verilere erişim yetkiniz yok');
    }
    return this.prisma.hospital.findMany({
      where: { OR: this.hospitalWhere(hospitalIds, groupIds) },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Phase 5C.20 SEC-01: tenant-scoped hospital lookup by id.
   *
   * Same boundary as findAllScoped: platform admin sees any hospital, everyone
   * else only within their tenant space. Non-scoped (or nonexistent) ids return
   * null so the caller can fail closed without leaking existence.
   */
  async findOneScoped(id: string, user?: HospitalScopeUser) {
    if (this.isGlobalSystemAdmin(user)) {
      return this.prisma.hospital.findUnique({ where: { id }, include: { group: true } });
    }
    const { hospitalIds, groupIds } = await this.resolveHospitalScope(user);
    if (hospitalIds.length === 0 && groupIds.length === 0) {
      throw new ForbiddenException('Bu verilere erişim yetkiniz yok');
    }
    return this.prisma.hospital.findFirst({
      where: { id, OR: this.hospitalWhere(hospitalIds, groupIds) },
      include: { group: true },
    });
  }

  async create(data: { name: string; code: string; groupId?: string }) {
    const hospital = await this.prisma.hospital.create({ data });
    if (data.groupId) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE hospitals SET path = text2ltree(hg.path || '.' || replace(lower(hospitals.code), ' ', '_')) FROM hospital_groups hg WHERE hg.id = hospitals.group_id AND hospitals.id = $1`,
        hospital.id,
      );
    } else {
      await this.prisma.$queryRawUnsafe(
        "UPDATE hospitals SET path = text2ltree(replace(lower(code), ' ', '_')) WHERE id = $1",
        hospital.id,
      );
    }
    return this.prisma.hospital.findUnique({ where: { id: hospital.id } });
  }

  async findAll() {
    return this.prisma.hospital.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.hospital.findUnique({ where: { id }, include: { group: true } });
  }

  async update(id: string, data: Partial<{ name: string; code: string; groupId: string; isActive: boolean }>) {
    return this.prisma.hospital.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.hospital.update({ where: { id }, data: { isActive: false } });
  }
}
