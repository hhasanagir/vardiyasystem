import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma.service';
import { isValidUnitType } from '../../../models/unit-type';
import { UnitScopeService } from '../services/unit-scope.service';
import { UNIT_SCOPE_KEY, UnitScopeOptions } from '../decorators/unit-scope.decorator';

/**
 * Part B unit-scope enforcement guard.
 *
 * Enforces the CRITICAL BUSINESS RULE on the backend:
 *   SAHA_SORUMLUSU (field responsible) may only mutate the SINGLE unit assigned
 *   to them. Any target that resolves to a different unit => 403 Forbidden.
 *
 * Roles with broader scope (supervisor, chief technician, project manager,
 * hospital/system admin) are never restricted by unit.
 *
 * The guard is fail-open only when it cannot determine the target unit or when
 * the actor is not a strictly unit-scoped role. When a target unit IS known and
 * the actor is strictly unit-scoped, it is enforced authoritatively.
 */
@Injectable()
export class UnitScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: UnitScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<UnitScopeOptions | undefined>(UNIT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true;
    }

    // Routes without a @UnitScope decorator are not enforced by this guard.
    if (!opts) {
      return true;
    }

    const target = await this.resolveTargetUnit(request, user, opts);

    if (!target) {
      // Cannot resolve the target unit. For a strictly unit-scoped actor (saha
      // sorumlusu) we fail CLOSED so an unresolved target cannot be used to
      // reach another unit. Broader roles (supervisor and above) are allowed.
      //
      // Authoritative determination uses the RBAC-aware check (isStrictlyUnitScoped)
      // rather than the legacy-only isStrictlyUnitScopedRole: a FIELD_SUPERVISOR
      // established via RBAC assignment must fail closed even when the legacy
      // user.role column does not equal 'field_supervisor'.
      if (this.service.isStrictlyUnitScoped(user)) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      return true;
    }

    // Enforce unit scope for strictly unit-scoped actors and, when the target
    // unit's org is known, tenant isolation for every role.
    const allowed = await this.service.canAccessUnit(user, target.unitId, target.organizationId);
    if (allowed) {
      return true;
    }

    throw new ForbiddenException('Bu birime erişim yetkiniz yok');
  }

  private async resolveTargetUnit(
    request: any,
    user: any,
    opts?: UnitScopeOptions,
  ): Promise<{ unitId: string; organizationId: string | null } | null> {
    const params = request.params ?? {};
    const body = request.body ?? {};

    let unitId: string | null = null;
    if (opts?.unitBodyField && body[opts.unitBodyField]) {
      unitId = await this.toUnitId(body[opts.unitBodyField], user);
    } else if (opts?.unitParam && params[opts.unitParam]) {
      unitId = await this.toUnitId(params[opts.unitParam], user);
    } else if (body.unitId) {
      unitId = await this.toUnitId(body.unitId, user);
    } else if (opts?.entityType && opts.idParam && params[opts.idParam]) {
      unitId = await this.service.resolveTargetUnitId(opts.entityType, params[opts.idParam]);
    } else if (opts?.entityType && opts.entityBodyField && body[opts.entityBodyField]) {
      unitId = await this.service.resolveTargetUnitId(opts.entityType, body[opts.entityBodyField]);
    }

    if (!unitId) {
      return null;
    }

    const org = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { organizationId: true },
    });

    return { unitId, organizationId: org?.organizationId ?? null };
  }

  /**
   * Accepts a raw unitId, a unit code, or a unit type and normalizes to a unitId.
   *
   * RT-01: the unit-TYPE branch is resolved in the ACTOR's own organization
   * (org-preference). A type lookup must never resolve globally: without the
   * org filter, `type: 'mr'` would match whatever the first MR unit in the
   * whole database is, letting a tenant reach a sibling org's unit. When the
   * actor's organization is unresolved (legacy NULL-org accounts) the type
   * branch fails CLOSED (null). id/code branches are exact identifiers and
   * remain unscoped — cross-tenant reach is still rejected because the target
   * unit's org is compared against the actor's org in canAccessUnit.
   */
  private async toUnitId(value: string, user: any): Promise<string | null> {
    const byId = await this.prisma.unit.findUnique({ where: { id: value }, select: { id: true } });
    if (byId) return byId.id;
    const byCode = await this.prisma.unit.findFirst({ where: { code: value }, select: { id: true } });
    if (byCode) return byCode.id;
    const scope = await this.service.resolveScope(user);
    if (!scope.organizationId) return null;
    // A non-enum value (UUID, free text) can never match the type column, and
    // Prisma rejects the entire query with a validation error, so the enum is
    // validated before the lookup instead of catching the failure.
    if (isValidUnitType(value)) {
      const byType = await this.prisma.unit.findFirst({
        where: { type: value, organizationId: scope.organizationId },
        select: { id: true },
      });
      if (byType) return byType.id;
    }
    return null;
  }
}
