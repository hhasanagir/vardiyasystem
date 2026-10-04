import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ScheduleFilter } from './domain/repositories/schedule-repository.port';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { Schedule } from './domain/aggregates/schedule.aggregate';
import { AssignmentKind } from './domain/entities/assignment.entity';
import { ScheduleValidationService } from './schedule-validation.service';
import { DistributedLockService } from '../../infrastructure/distributed-lock.service';

@Injectable()
export class ScheduleApplicationService {
  private readonly processedOps = new Map<
    string,
    { ts: number; result: unknown }
  >();
  private readonly IDEMPOTENCY_TTL_MS = 300_000;

  constructor(
    private readonly scheduleRepo: PrismaScheduleRepository,
    private readonly validationService: ScheduleValidationService,
    private readonly lockService: DistributedLockService,
  ) {}

  private checkIdempotency(op: string, key: string): unknown | null {
    const e = this.processedOps.get(`${op}:${key}`);
    if (e && Date.now() - e.ts < 300000) return e.result;
    this.processedOps.delete(`${op}:${key}`);
    return null;
  }

  private recordOp(op: string, key: string, result: unknown): void {
    this.processedOps.set(`${op}:${key}`, { ts: Date.now(), result });
  }

  async createSchedule(params: {
    unitId: string;
    month: number;
    year: number;
    createdById: string;
  }): Promise<Schedule> {
    const key = `create:${params.unitId}:${params.month}:${params.year}`;
    const cached = this.checkIdempotency('create', key);
    if (cached) return cached as Schedule;
    const existing = await this.scheduleRepo.findByUnitMonthYear(
      params.unitId,
      params.month,
      params.year,
    );
    if (existing) {
      throw new ConflictException(
        `Schedule already exists for unit ${params.unitId} in ${params.month}/${params.year}`,
      );
    }
    const schedule = Schedule.create(params);
    await this.scheduleRepo.save(schedule);
    this.recordOp('create', key, schedule);
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

  private async loadAndVerify(
    scheduleId: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    if (expectedVersion !== undefined) schedule.verifyVersion(expectedVersion);
    return schedule;
  }

  async addAssignment(
    scheduleId: string,
    params: Record<string, unknown>,
    userId: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    const report = await this.validationService.validateAssignment(
      scheduleId,
      params as Parameters<ScheduleValidationService['validateAssignment']>[1],
    );
    if (report.hasBlocking) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Assignment validation failed',
        violations: report.violations,
        hasBlocking: true,
        canOverride: false,
      });
    }
    schedule.addAssignment(
      {
        ...params,
        kind: params.kind as AssignmentKind | undefined,
      } as Parameters<Schedule['addAssignment']>[0],
      userId,
    );
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async overrideAssignment(
    scheduleId: string,
    params: Record<string, unknown>,
    userId: string,
    userRole: string,
    _userName: string,
    overrideReason: string,
    violatedRules: string[],
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    const overrideRoles = [
      'supervisor',
      'imaging_director',
      'system_admin',
      'hospital_admin',
    ];
    if (!overrideRoles.includes(userRole))
      throw new ForbiddenException('Insufficient permissions for override');
    schedule.overrideAssignment(
      {
        ...params,
        kind: params.kind as AssignmentKind | undefined,
      } as Parameters<Schedule['overrideAssignment']>[0],
      userId,
      overrideReason,
      violatedRules,
    );
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async updateAssignment(
    scheduleId: string,
    assignmentId: string,
    changes: Record<string, unknown>,
    userId: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    schedule.updateAssignment(
      assignmentId,
      changes as Parameters<Schedule['updateAssignment']>[1],
      userId,
    );
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async removeAssignment(
    scheduleId: string,
    assignmentId: string,
    userId: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    const removed = schedule.removeAssignment(assignmentId, userId);
    if (!removed)
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async submitForReview(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    schedule.submitForReview(userId, userName, userRole, comment);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async approve(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

    const submittedBy = schedule.approvalData?.submittedBy;
    if (submittedBy && submittedBy === userId) {
      throw new ForbiddenException(
        'Four-eyes principle: the person who submitted for review cannot also approve',
      );
    }

    schedule.approve(userId, userName, userRole, comment);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async reject(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    reason: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    schedule.reject(userId, userName, userRole, reason);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async publish(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    return this.lockService.withLock(
      `schedule:publish:${scheduleId}`,
      async () => {
        const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

        const validationReport =
          await this.validationService.validateSchedule(scheduleId);
        if (
          validationReport.hardViolations &&
          validationReport.hardViolations.total > 0
        ) {
          throw new ConflictException({
            statusCode: 409,
            message:
              'Cannot publish: schedule has hard violations that must be resolved first',
            hardViolations: validationReport.hardViolations,
          });
        }

        schedule.publish(userId, userName, userRole);
        await this.scheduleRepo.save(schedule, expectedVersion);
        return schedule;
      },
      60000,
    );
  }

  async archive(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    schedule.archive(userId, userName, userRole);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async revertToDraft(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    const schedule = await this.loadAndVerify(scheduleId, expectedVersion);
    schedule.revertToDraft(userId, userName, userRole);
    await this.scheduleRepo.save(schedule, expectedVersion);
    return schedule;
  }

  async rollback(
    scheduleId: string,
    targetVersion: number,
    userId: string,
    userName: string,
    userRole: string,
    reason: string,
    expectedVersion?: number,
  ): Promise<Schedule> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rollback reason is required');
    }

    const key = `rollback:${scheduleId}:${targetVersion}:${userId}`;
    const cached = this.checkIdempotency('rollback', key);
    if (cached) return cached as Schedule;

    return this.lockService.withLock(
      `schedule:rollback:${scheduleId}`,
      async () => {
        const schedule = await this.loadAndVerify(scheduleId, expectedVersion);

        if (schedule.status !== 'published') {
          throw new ConflictException('Can only rollback a published schedule');
        }

        if (schedule.scheduleVersion <= targetVersion) {
          throw new BadRequestException(
            `Target version ${targetVersion} must be less than current version ${schedule.scheduleVersion}`,
          );
        }

        const snapshot = await this.scheduleRepo.getVersionSnapshot(
          scheduleId,
          targetVersion,
        );
        if (!snapshot)
          throw new NotFoundException(
            `Version ${targetVersion} snapshot not found for schedule ${scheduleId}`,
          );

        schedule.rollback(
          targetVersion,
          snapshot.data.assignments as Parameters<Schedule['rollback']>[1],
          userId,
          userName,
          userRole,
          reason,
        );
        await this.scheduleRepo.save(schedule, expectedVersion);
        this.recordOp('rollback', key, schedule);
        return schedule;
      },
      60000,
    );
  }
}
