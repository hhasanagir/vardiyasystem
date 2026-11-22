import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PersonnelAvailabilityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { CreatePersonnelAvailabilityDto } from '../dto/create-personnel-availability.dto';
import { UpdatePersonnelAvailabilityDto } from '../dto/update-personnel-availability.dto';

/** Blocking reasons surfaced by the eligibility resolver (null = available). */
export type AvailabilityBlockingReason =
  | PersonnelAvailabilityType
  | 'WEEKLY_OFF_DAY'
  | 'UNRESOLVED_TENANT';

export interface EligibilityResult {
  available: boolean;
  blocking: AvailabilityBlockingReason | null;
}

/** Minimal personnel projection consumed by the month-elibility builder. */
export interface AvailabilityPersonnelRef {
  id: string;
  offDays: number[];
}

/** Structural actor projection (matches UnitScopeService.ScopeUser + audit fields). */
export interface AvailabilityActor {
  id: string;
  name?: string;
  role?: string;
  organizationId?: string | null;
  unitId?: string | null;
  rbacRoles?: { roleName: string; unitId: string | null; organizationId: string | null }[];
}

const BLOCKING_TYPES: ReadonlySet<PersonnelAvailabilityType> = new Set([
  PersonnelAvailabilityType.UNAVAILABLE,
  PersonnelAvailabilityType.LEAVE,
  PersonnelAvailabilityType.ABSENCE,
]);

/**
 * Phase 5C.23 — authoritative personnel date-availability eligibility + CRUD.
 *
 * Precedence (deterministic, single row per personnel+date):
 *   active explicit row > Personnel.offDays (weekly UTC weekday) > available.
 *   - LEAVE / ABSENCE / UNAVAILABLE block the date.
 *   - AVAILABLE explicitly overrides a weekly off-day for that date.
 *   - inactive rows behave as absent.
 */
@Injectable()
export class PersonnelAvailabilityService {
  private static readonly DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly unitScope: UnitScopeService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** UTC-safe ISO week day (0..6) for a YYYY-MM-DD date, immune to TZ shifts. */
  static utcWeekDayOf(dateStr: string): number {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  /** Number of days in a month (UTC-based, no 31-day hardcode). */
  static daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  static isValidDate(dateStr: string): boolean {
    if (!PersonnelAvailabilityService.DATE_PATTERN.test(dateStr)) return false;
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  private assertValidDate(dateStr: string): void {
    if (!PersonnelAvailabilityService.isValidDate(dateStr)) {
      throw new BadRequestException(
        JSON.stringify({ code: 'INVALID_DATE', message: 'date (YYYY-MM-DD) gerçek bir takvim tarihi olmalıdır' }),
      );
    }
  }

  /** Pure precedence decision shared by the resolver and the month builder. */
  private resolveEligibility(
    offDays: number[],
    activeRow: { type: PersonnelAvailabilityType } | null,
    dateStr: string,
  ): { available: boolean; blocking: Extract<AvailabilityBlockingReason, PersonnelAvailabilityType | 'WEEKLY_OFF_DAY'> | null } {
    return PersonnelAvailabilityService.resolveDateEligibility(offDays, activeRow, dateStr);
  }

  /**
   * PHASE 5C.25 — public pure precedence decision (single source of truth).
   *   active explicit row > weekly offDays > available.
   * Consumers (legacy validation, publish gate, engine feed) reuse this so the
   * leave/absence/unsuitable semantics can never drift between surfaces.
   */
  static resolveDateEligibility(
    offDays: number[],
    activeRow: { type: PersonnelAvailabilityType } | null,
    dateStr: string,
  ): { available: boolean; blocking: Extract<AvailabilityBlockingReason, PersonnelAvailabilityType | 'WEEKLY_OFF_DAY'> | null } {
    if (activeRow) {
      if (activeRow.type === PersonnelAvailabilityType.AVAILABLE) return { available: true, blocking: null };
      return { available: false, blocking: activeRow.type };
    }
    const weekday = PersonnelAvailabilityService.utcWeekDayOf(dateStr);
    if (offDays.includes(weekday)) return { available: false, blocking: 'WEEKLY_OFF_DAY' };
    return { available: true, blocking: null };
  }

  /**
   * Resolve eligibility for a single personnel+date.
   * Fail closed: a NULL/undefined caller organization never yields "available"
   * (mirrors the Phase 5C.20 fail-closed tenancy rule).
   */
  async isPersonnelAvailableForDate(
    personnelId: string,
    date: string,
    organizationId?: string | null,
  ): Promise<EligibilityResult> {
    this.assertValidDate(date);
    if (!organizationId) return { available: false, blocking: 'UNRESOLVED_TENANT' };

    const person = await this.prisma.personnel.findUnique({
      where: { id: personnelId },
      select: { offDays: true },
    });
    if (!person) return { available: false, blocking: 'UNRESOLVED_TENANT' };

    const row = await this.prisma.personnelDateAvailability.findUnique({
      where: { personnelId_date: { personnelId, date } },
      select: { type: true, isActive: true },
    });
    return this.resolveEligibility(person.offDays, row?.isActive ? row : null, date);
  }

  /**
   * Bulk resolve the blocked dates for a month (production scheduler input).
   * Consumed by ScheduleAutoGeneratorService.findAvailablePersonnel so the
   * generator never re-implements availability logic.
   */
  async resolveMonthBlockedDates(
    personnel: AvailabilityPersonnelRef[],
    year: number,
    month: number,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (personnel.length === 0) return result;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(PersonnelAvailabilityService.daysInMonth(year, month)).padStart(2, '0')}`;
    const rows = await this.prisma.personnelDateAvailability.findMany({
      where: {
        personnelId: { in: personnel.map(p => p.id) },
        isActive: true,
        date: { gte: startDate, lte: endDate },
      },
      select: { personnelId: true, date: true, type: true },
    });
    const rowByKey = new Map<string, { type: PersonnelAvailabilityType }>();
    for (const r of rows) rowByKey.set(`${r.personnelId}|${r.date}`, { type: r.type });

    for (const p of personnel) {
      const blocked = new Set<string>();
      const days = PersonnelAvailabilityService.daysInMonth(year, month);
      for (let day = 1; day <= days; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const row = rowByKey.get(`${p.id}|${dateStr}`) || null;
        if (!this.resolveEligibility(p.offDays, row, dateStr).available) blocked.add(dateStr);
      }
      result.set(p.id, blocked);
    }
    return result;
  }

  /** Legacy fallback when the optional generator dependency is absent (offDays only). */
  static blockedByWeeklyOffDays(
    personnel: AvailabilityPersonnelRef[],
    year: number,
    month: number,
  ): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    const days = PersonnelAvailabilityService.daysInMonth(year, month);
    for (const p of personnel) {
      const blocked = new Set<string>();
      for (let day = 1; day <= days; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (p.offDays.includes(PersonnelAvailabilityService.utcWeekDayOf(dateStr))) blocked.add(dateStr);
      }
      result.set(p.id, blocked);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Guarded CRUD
  // ---------------------------------------------------------------------------

  async list(
    filters: { personnelId?: string; unitId?: string; date?: string; take?: number; skip?: number },
    actor: AvailabilityActor,
  ) {
    const scope = await this.unitScope.resolveReadScope(actor);
    if (scope.denyAll) return { items: [], total: 0 };

    const where: Prisma.PersonnelDateAvailabilityWhereInput = {
      ...(filters.personnelId && { personnelId: filters.personnelId }),
      ...(filters.date && { date: filters.date }),
      personnel: {
        ...(scope.unitId && { unitId: scope.unitId }),
        ...(scope.organizationId && { organizationId: scope.organizationId }),
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.personnelDateAvailability.findMany({
        where,
        take: Math.min(filters.take ?? 100, 500),
        skip: filters.skip,
        orderBy: { date: 'desc' },
        include: { personnel: { select: { id: true, name: true, role: true, unitId: true } } },
      }),
      this.prisma.personnelDateAvailability.count({ where }),
    ]);
    return { items, total };
  }

  async create(dto: CreatePersonnelAvailabilityDto, actor: AvailabilityActor) {
    this.assertValidDate(dto.date);

    const personnel = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: { id: true, name: true },
    });
    if (!personnel) {
      throw new NotFoundException(JSON.stringify({ code: 'PERSONNEL_NOT_FOUND', message: 'Personel bulunamadı' }));
    }
    await this.assertTargetScopeFor(actor, dto.personnelId, 'PERSONNEL_NOT_FOUND');

    const existing = await this.prisma.personnelDateAvailability.findUnique({
      where: { personnelId_date: { personnelId: dto.personnelId, date: dto.date } },
    });

    // Case H: explicit AVAILABLE cannot silently replace an active blocking row (409).
    if (
      existing?.isActive &&
      dto.type === PersonnelAvailabilityType.AVAILABLE &&
      BLOCKING_TYPES.has(existing.type)
    ) {
      throw new ConflictException(
        JSON.stringify({
          code: 'AVAILABLE_OVER_BLOCKING',
          message: 'Aktif bir engelleme kaydı üzerine AVAILABLE oluşturulamaz; önce devre dışı bırakın',
          personnelId: dto.personnelId,
          date: dto.date,
          blockingType: existing.type,
        }),
      );
    }

    // Unique (personnelId, date) row: reactivate/update the existing row (upsert discipline).
    if (existing) {
      const updated = await this.prisma.personnelDateAvailability.update({
        where: { id: existing.id },
        data: {
          type: dto.type,
          reason: dto.reason ?? existing.reason,
          isActive: true,
        },
      });
      await this.writeAudit(actor, 'PERSONNEL_AVAILABILITY_UPDATED', updated.id, {
        oldValue: { type: existing.type, reason: existing.reason, isActive: existing.isActive },
        newValue: { type: updated.type, reason: updated.reason, isActive: updated.isActive },
        description: `Uygunluk kaydı güncellendi (${personnel.name}, ${dto.date})`,
      });
      return updated;
    }

    const created = await this.prisma.personnelDateAvailability.create({
      data: {
        date: dto.date,
        type: dto.type,
        reason: dto.reason,
        createdById: actor.id || null,
        personnel: { connect: { id: dto.personnelId } },
      },
    });
    await this.writeAudit(actor, 'PERSONNEL_AVAILABILITY_CREATED', created.id, {
      newValue: { type: created.type, reason: created.reason, isActive: created.isActive },
      description: `Uygunluk kaydı oluşturuldu (${personnel.name}, ${dto.date})`,
    });
    return created;
  }

  async update(id: string, dto: UpdatePersonnelAvailabilityDto, actor: AvailabilityActor) {
    const row = await this.prisma.personnelDateAvailability.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(JSON.stringify({ code: 'AVAILABILITY_NOT_FOUND', message: 'Uygunluk kaydı bulunamadı' }));
    }
    await this.assertTargetScopeFor(actor, row.personnelId, 'AVAILABILITY_NOT_FOUND');

    const data: Prisma.PersonnelDateAvailabilityUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return row;

    const updated = await this.prisma.personnelDateAvailability.update({ where: { id }, data });
    await this.writeAudit(actor, 'PERSONNEL_AVAILABILITY_UPDATED', updated.id, {
      oldValue: { type: row.type, reason: row.reason, isActive: row.isActive },
      newValue: { type: updated.type, reason: updated.reason, isActive: updated.isActive },
      description: 'Uygunluk kaydı güncellendi',
    });
    return updated;
  }

  async deactivate(id: string, actor: AvailabilityActor) {
    const row = await this.prisma.personnelDateAvailability.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(JSON.stringify({ code: 'AVAILABILITY_NOT_FOUND', message: 'Uygunluk kaydı bulunamadı' }));
    }
    await this.assertTargetScopeFor(actor, row.personnelId, 'AVAILABILITY_NOT_FOUND');

    if (!row.isActive) return row; // idempotent soft delete

    const updated = await this.prisma.personnelDateAvailability.update({
      where: { id },
      data: { isActive: false },
    });
    await this.writeAudit(actor, 'PERSONNEL_AVAILABILITY_DEACTIVATED', updated.id, {
      oldValue: { isActive: true },
      newValue: { isActive: false },
      description: 'Uygunluk kaydı devre dışı bırakıldı',
    });
    return updated;
  }

  /** Fail-closed target-scope assertion via UnitScopeService (same as device-status writes). */
  private async assertTargetScopeFor(
    actor: AvailabilityActor,
    personnelId: string,
    notFoundCode: string,
  ): Promise<void> {
    const target = await this.unitScope.resolveTargetScope('personnel', personnelId);
    if (!target) {
      throw new NotFoundException(JSON.stringify({ code: notFoundCode, message: 'Personel bulunamadı' }));
    }
    const allowed = await this.unitScope.canAccessUnit(actor, target.unitId, target.organizationId);
    if (!allowed) {
      throw new ForbiddenException(JSON.stringify({ code: 'FORBIDDEN_UNIT', message: 'Bu birime erişim yetkiniz yok' }));
    }
  }

  private async writeAudit(
    actor: AvailabilityActor,
    action: string,
    entityId: string,
    payload: { oldValue?: Record<string, unknown>; newValue?: Record<string, unknown>; description: string },
  ): Promise<void> {
    await this.auditLog
      .log({
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        organizationId: actor.organizationId ?? undefined,
        unitId: actor.unitId ?? undefined,
        action,
        entityType: 'personnel_date_availability',
        entityId,
        oldValue: payload.oldValue,
        newValue: payload.newValue,
        description: payload.description,
        status: 'SUCCESS',
      })
      .catch(() => {});
  }
}