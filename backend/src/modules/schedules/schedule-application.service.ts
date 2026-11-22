import {
  Inject, Injectable, NotFoundException, ConflictException,
  ForbiddenException, BadRequestException, ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../events/event-store.service';
import { RedisKeyNamespace, redisKey } from '../../config/redis-key-namespace';
import { ScheduleFilter, ScheduleSaveOptions } from './domain/repositories/schedule-repository.port';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { Schedule } from './domain/aggregates/schedule.aggregate';
import { AssignmentKind } from './domain/entities/assignment.entity';
import { ScheduleValidationService } from './schedule-validation.service';
import { DistributedLockService } from '../../infrastructure/distributed-lock.service';

/** P3-10 — preserves the former in-memory 300_000 ms TTL, in seconds for Redis. */
const IDEMPOTENCY_TTL_SECONDS = 300;
const GLOBAL_SCOPE = 'global';

@Injectable()
export class ScheduleApplicationService {
  constructor(
    private readonly scheduleRepo: PrismaScheduleRepository,
    private readonly validationService: ScheduleValidationService,
    private readonly lockService: DistributedLockService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private idempotencyKey(op: string, key: string, organizationId?: string): string {
    return redisKey(RedisKeyNamespace.CACHE, 'schedule-idempotency', organizationId || GLOBAL_SCOPE, op, key);
  }

  /** P3-10 — fail closed: no per-instance Map fallback may fabricate a replay. */
  private async redisExec<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'IDEMPOTENCY_STORE_UNAVAILABLE',
        message: 'Idempotency store is unavailable; retry the operation',
      });
    }
  }

  /**
   * A hit stores only the resulting schedule id. Replaying reloads the aggregate
   * from the repository so the returned object is never a stale in-process copy.
   */
  private async checkIdempotency(op: string, key: string, organizationId?: string): Promise<Schedule | null> {
    const cachedId = await this.redisExec(() => this.redis.get(this.idempotencyKey(op, key, organizationId)));
    if (!cachedId) return null;
    return this.getSchedule(cachedId);
  }

  private async recordOp(op: string, key: string, result: Schedule, organizationId?: string): Promise<void> {
    await this.redisExec(() => this.redis.set(
      this.idempotencyKey(op, key, organizationId),
      result.id,
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    ));
  }

  async createSchedule(params: {
    unitId: string; month: number; year: number; createdById: string; organizationId?: string;
  }): Promise<Schedule> {
    const key = `${params.unitId}:${params.month}:${params.year}`;
    const cached = await this.checkIdempotency('create', key, params.organizationId);
    if (cached) return cached;
    const existing = await this.scheduleRepo.findByUnitMonthYear(params.unitId, params.month, params.year);
    if (existing) {
      throw new ConflictException(`Schedule already exists for unit ${params.unitId} in ${params.month}/${params.year}`);
    }
    const schedule = Schedule.create(params);
    await this.scheduleRepo.save(schedule);
    await this.recordOp('create', key, schedule, params.organizationId);
    return schedule;
  }

  async getSchedule(id: string): Promise<Schedule> {
    const s = await this.scheduleRepo.findById(id);
    if (!s) throw new NotFoundException(`Schedule ${id} not found`);
    return s;
  }

  async listSchedules(filter: ScheduleFilter): Promise<Schedule[]> {
    return this.scheduleRepo.findAll(filter);
  }

private async loadAndVerify(scheduleId: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    if (expectedVersion !== undefined) schedule.verifyVersion(expectedVersion);
    return schedule;
  }

  private assertEditable(schedule: Schedule): Schedule {
    if (!schedule.isEditable) {
      throw new ConflictException({
        statusCode: 409,
        message: `Schedule is in ${schedule.status} status and cannot be modified`,
        scheduleStatus: schedule.status,
      });
    }
    return schedule;
  }

  /**
   * Persists the aggregate and maps the database uniqueness guard
   * (scheduleId, deviceId, date, shiftType, personnelType) to a 409 CONFLICT.
   * A unique-constraint hit is a business conflict, not a server fault.
   */
  private async persist(
    schedule: Schedule,
    expectedVersion?: number,
    options?: ScheduleSaveOptions,
  ): Promise<void> {
    try {
      if (options) {
        await this.scheduleRepo.save(schedule, expectedVersion, options);
      } else {
        await this.scheduleRepo.save(schedule, expectedVersion);
      }
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: 'Assignment conflicts with an existing assignment (same unit, date, shift and device/personnel type)',
        });
      }
      throw error;
    }
  }

  async addAssignment(scheduleId: string, params: Record<string, unknown>, userId: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.assertEditable(schedule);
    const report = await this.validationService.validateAssignment(scheduleId, params as Parameters<ScheduleValidationService['validateAssignment']>[1]);
    if (report.hasBlocking) {
      throw new ConflictException({ statusCode: 409, message: 'Assignment validation failed', violations: report.violations, hasBlocking: true, canOverride: false });
    }
    this.transition(() => schedule.addAssignment({ ...params, kind: params.kind as AssignmentKind | undefined } as Parameters<Schedule['addAssignment']>[0], userId));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async overrideAssignment(scheduleId: string, params: Record<string, unknown>, userId: string, userRole: string, _userName: string, overrideReason: string, violatedRules: string[], expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.assertEditable(schedule);
    const overrideRoles = ['supervisor', 'imaging_director', 'system_admin', 'hospital_admin'];
    if (!overrideRoles.includes(userRole)) throw new ForbiddenException('Insufficient permissions for override');

    // Never trust client-supplied violatedRules: recalculate server-side and only
    // permit overriding rules the engine actually marks as overridable.
    const report = await this.validationService.validateWithOverride(
      scheduleId,
      params as Parameters<ScheduleValidationService['validateAssignment']>[1],
      violatedRules,
    );
    if (report.hasBlocking) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Override rejected: contains non-overridable blocking violations',
        violations: report.violations,
        hasBlocking: true,
        canOverride: false,
      });
    }

    schedule.overrideAssignment({ ...params, kind: params.kind as AssignmentKind | undefined } as Parameters<Schedule['overrideAssignment']>[0], userId, overrideReason, violatedRules);
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async updateAssignment(scheduleId: string, assignmentId: string, changes: Record<string, unknown>, userId: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.assertEditable(schedule);
    const updated = this.transition(() => schedule.updateAssignment(assignmentId, changes as Parameters<Schedule['updateAssignment']>[1], userId));
    if (!updated) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    // Validate the RESULTING assignment state (post-merge) before persistence,
    // using the same engine as addAssignment, with self-exclusion semantics.
    const s = updated.toSnapshot();
    const report = await this.validationService.validateAssignment(
      scheduleId,
      {
        personnelId: s.personnelId,
        deviceId: s.deviceId,
        unitId: schedule.unitId,
        personnelGroupId: s.personnelGroupId,
        shiftTemplateId: s.shiftTemplateId,
        kind: s.kind,
        date: s.date,
        shiftType: s.shiftType,
        startTime: s.startTime,
        endTime: s.endTime,
        personnelType: s.personnelType,
      },
      assignmentId,
    );
    if (report.hasBlocking) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Assignment update validation failed',
        violations: report.violations,
        hasBlocking: true,
        canOverride: false,
      });
    }

    await this.persist(schedule, expectedVersion);
    return schedule;
  }

async removeAssignment(scheduleId: string, assignmentId: string, userId: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.assertEditable(schedule);
    const removed = this.transition(() => schedule.removeAssignment(assignmentId, userId));
    if (!removed) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  /**
   * Illegal workflow transitions are reported by the aggregate as plain
   * `Error('Cannot ... from <status> with role <role>')`. Those are state
   * conflicts, not server faults, so they surface as 409 CONFLICT.
   */
  private transition<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Cannot ')) {
        throw new ConflictException({ statusCode: 409, message });
      }
      throw error;
    }
  }

  async submitForReview(scheduleId: string, userId: string, userName: string, userRole: string, comment?: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.transition(() => schedule.submitForReview(userId, userName, userRole, comment));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async approve(scheduleId: string, userId: string, userName: string, userRole: string, comment?: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

    const submittedBy = schedule.approvalData?.submittedBy;
    if (submittedBy && submittedBy === userId) {
      throw new ForbiddenException('Four-eyes principle: the person who submitted for review cannot also approve');
    }

    this.transition(() => schedule.approve(userId, userName, userRole, comment));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async reject(scheduleId: string, userId: string, userName: string, userRole: string, reason: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.transition(() => schedule.reject(userId, userName, userRole, reason));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async publish(scheduleId: string, userId: string, userName: string, userRole: string, expectedVersion?: number): Promise<Schedule> {
    return this.lockService.withLock(`schedule:publish:${scheduleId}`, async () => {
      const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

      // State first, coverage second. A schedule that is already published can
      // never become published again, so running the (expensive) coverage
      // report first would answer a state conflict with an unrelated "you have
      // violations" payload.
      if (schedule.isPublished) {
        throw new ConflictException({
          statusCode: 409,
          message: `Cannot publish schedule from ${schedule.status} status with role ${userRole}`,
          scheduleStatus: schedule.status,
        });
      }

      const validationReport = await this.validationService.validateSchedule(scheduleId);
      if (validationReport.hardViolations && validationReport.hardViolations.total > 0) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Cannot publish: schedule has hard violations that must be resolved first',
          hardViolations: validationReport.hardViolations,
        });
      }

      this.transition(() => schedule.publish(userId, userName, userRole));
      // P2-07 — persist the restorable snapshot with the publish write.
      await this.persist(schedule, expectedVersion, {
        snapshot: { userId, comment: 'DDD publish snapshot' },
      });
      return schedule;
    }, 60000);
  }

  async archive(scheduleId: string, userId: string, userName: string, userRole: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.transition(() => schedule.archive(userId, userName, userRole));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async revertToDraft(scheduleId: string, userId: string, userName: string, userRole: string, expectedVersion?: number): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    this.transition(() => schedule.revertToDraft(userId, userName, userRole));
    await this.persist(schedule, expectedVersion);
    return schedule;
  }

  async rollback(scheduleId: string, targetVersion: number, userId: string, userName: string, userRole: string, reason: string, expectedVersion?: number, organizationId?: string): Promise<Schedule> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rollback reason is required');
    }

    const key = `${scheduleId}:${targetVersion}:${userId}`;
    const cached = await this.checkIdempotency('rollback', key, organizationId);
    if (cached) return cached;

    return this.lockService.withLock(`schedule:rollback:${scheduleId}`, async () => {
      const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

      if (schedule.status !== 'published') {
        throw new ConflictException('Can only rollback a published schedule');
      }

      if (schedule.scheduleVersion <= targetVersion) {
        throw new BadRequestException(`Target version ${targetVersion} must be less than current version ${schedule.scheduleVersion}`);
      }

      const snapshot = await this.scheduleRepo.getVersionSnapshot(scheduleId, targetVersion);
      if (!snapshot) throw new NotFoundException(`Version ${targetVersion} snapshot not found for schedule ${scheduleId}`);

      this.transition(() => schedule.rollback(targetVersion, snapshot.data.assignments as Parameters<Schedule['rollback']>[1], userId, userName, userRole, reason));
      // P2-08 — cancel swap requests that referenced the replaced assignments
      // in the same transaction as the rollback write.
      await this.persist(schedule, expectedVersion, {
        cancelSwapRequestsReason: `DDD rollback to v${targetVersion}: ${reason}`,
      });
      await this.recordOp('rollback', key, schedule, organizationId);
      return schedule;
    }, 60000);
  }
}
