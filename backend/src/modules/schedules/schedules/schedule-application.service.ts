import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ScheduleRepositoryPort,
  ScheduleFilter,
} from './domain/repositories/schedule-repository.port';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import {
  Schedule,
  ScheduleStatus,
} from './domain/aggregates/schedule.aggregate';
import {
  Assignment,
  AssignmentKind,
} from './domain/entities/assignment.entity';
import { AssignmentCollection } from './domain/entities/assignment-collection';
import { ConstraintEngine } from './domain/constraints';
import { ScheduleValidationService } from './schedule-validation.service';

@Injectable()
export class ScheduleApplicationService {
  private readonly constraintEngine = new ConstraintEngine();

  constructor(
    private readonly scheduleRepo: PrismaScheduleRepository,
    private readonly validationService: ScheduleValidationService,
  ) {}

  async createSchedule(params: {
    unitId: string;
    month: number;
    year: number;
    createdById: string;
  }): Promise<Schedule> {
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
    return schedule;
  }

  async getSchedule(id: string): Promise<Schedule> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    return schedule;
  }

  async listSchedules(filter: ScheduleFilter): Promise<Schedule[]> {
    return this.scheduleRepo.findAll(filter);
  }

  async addAssignment(
    scheduleId: string,
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    userId: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);

    const report = await this.validationService.validateAssignment(
      scheduleId,
      params,
    );
    if (report.hasBlocking) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Assignment validation failed',
        error: 'Blocking violations detected',
        violations: report.violations,
        hasBlocking: true,
        canOverride: false,
      });
    }

    schedule.addAssignment(
      { ...params, kind: params.kind as AssignmentKind | undefined },
      userId,
    );
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async overrideAssignment(
    scheduleId: string,
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    userId: string,
    userRole: string,
    userName: string,
    overrideReason: string,
    violatedRules: string[],
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);

    const overrideRoles = [
      'supervisor',
      'imaging_director',
      'system_admin',
      'hospital_admin',
    ];
    if (!overrideRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions for override');
    }

    schedule.overrideAssignment(
      { ...params, kind: params.kind as AssignmentKind | undefined },
      userId,
      overrideReason,
      violatedRules,
    );
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async removeAssignment(
    scheduleId: string,
    assignmentId: string,
    userId: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    const removed = schedule.removeAssignment(assignmentId, userId);
    if (!removed) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async submitForReview(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.submitForReview(userId, userName, userRole, comment);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async approve(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.approve(userId, userName, userRole, comment);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async reject(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
    reason: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.reject(userId, userName, userRole, reason);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async publish(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.publish(userId, userName, userRole);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async archive(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.archive(userId, userName, userRole);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }

  async revertToDraft(
    scheduleId: string,
    userId: string,
    userName: string,
    userRole: string,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(scheduleId);
    schedule.revertToDraft(userId, userName, userRole);
    await this.scheduleRepo.save(schedule);
    return schedule;
  }
}
