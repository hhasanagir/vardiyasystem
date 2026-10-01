import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ScheduleApplicationService } from './schedule-application.service';
import { ScheduleValidationService } from './schedule-validation.service';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { ScheduleJobQueueService } from './job-queue/schedule-job-queue.service';
import { ScheduleJobStatusService } from './job-queue/schedule-job-status.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { ScheduleAccessGuard } from './guards/schedule-access.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { PrismaService } from '../../prisma.service';
import { Schedule } from './domain/aggregates/schedule.aggregate';
import {
  EnrichedAssignment,
  toScheduleResponseDto,
  toScheduleListResponseDto,
} from './dto/schedule-response.dto';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId?: string;
    unitId?: string;
  };
}

@ApiTags('schedules-ddd')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)
@Controller('schedules-ddd')
export class SchedulesDDDController {
  constructor(
    private readonly appService: ScheduleApplicationService,
    private readonly validationService: ScheduleValidationService,
    private readonly scheduleRepo: PrismaScheduleRepository,
    private readonly jobQueue: ScheduleJobQueueService,
    private readonly jobStatus: ScheduleJobStatusService,
    private readonly prisma: PrismaService,
  ) {}

  private async enrichAssignments(
    scheduleId: string,
  ): Promise<EnrichedAssignment[]> {
    const rows = await this.prisma.assignment.findMany({
      where: { scheduleId },
      include: {
        personnel: { select: { name: true, role: true } },
        device: { select: { code: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      scheduleId: r.scheduleId,
      personnelId: r.personnelId,
      personnelName: r.personnel?.name ?? '',
      personnelRole: r.personnel?.role ?? null,
      deviceId: r.deviceId,
      deviceCode: r.device?.code ?? null,
      unitId: r.unitId,
      personnelGroupId: r.personnelGroupId,
      shiftTemplateId: r.shiftTemplateId,
      kind: r.kind,
      source: r.source,
      date: r.date,
      shiftType: r.shiftType,
      startTime: r.startTime,
      endTime: r.endTime,
      personnelType: r.personnelType,
      isConfirmed: r.isConfirmed,
      overrideReason: r.overrideReason,
      overriddenBy: r.overriddenBy,
      overriddenAt: r.overriddenAt?.toISOString() ?? null,
    }));
  }

  private async toDto(schedule: Schedule) {
    const enriched = await this.enrichAssignments(schedule.id);
    return toScheduleResponseDto(schedule, enriched);
  }

  private async toDtoList(schedules: Schedule[]) {
    const ids = schedules.map((s) => s.id);
    const rows = await this.prisma.assignment.findMany({
      where: { scheduleId: { in: ids } },
      include: {
        personnel: { select: { name: true, role: true } },
        device: { select: { code: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const map = new Map<string, EnrichedAssignment[]>();
    for (const r of rows) {
      const entry: EnrichedAssignment = {
        id: r.id,
        scheduleId: r.scheduleId,
        personnelId: r.personnelId,
        personnelName: r.personnel?.name ?? '',
        personnelRole: r.personnel?.role ?? null,
        deviceId: r.deviceId,
        deviceCode: r.device?.code ?? null,
        unitId: r.unitId,
        personnelGroupId: r.personnelGroupId,
        shiftTemplateId: r.shiftTemplateId,
        kind: r.kind,
        source: r.source,
        date: r.date,
        shiftType: r.shiftType,
        startTime: r.startTime,
        endTime: r.endTime,
        personnelType: r.personnelType,
        isConfirmed: r.isConfirmed,
        overrideReason: r.overrideReason,
        overriddenBy: r.overriddenBy,
        overriddenAt: r.overriddenAt?.toISOString() ?? null,
      };
      const list = map.get(r.scheduleId) ?? [];
      list.push(entry);
      map.set(r.scheduleId, list);
    }
    return toScheduleListResponseDto(schedules, map);
  }

  @Post()
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.create')
  @ApiOperation({ summary: 'Create a new schedule (DDD)' })
  async create(
    @Body() body: { unitId: string; month: number; year: number },
    @Request() req: RequestWithUser,
  ) {
    const schedule = await this.appService.createSchedule({
      ...body,
      createdById: req.user.id,
    });
    return this.toDto(schedule);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @Permissions('schedule.read')
  @ApiOperation({ summary: 'List schedules' })
  async list(
    @Query()
    query: {
      unitId?: string;
      month?: string;
      year?: string;
      status?: string;
    },
  ) {
    const schedules = await this.appService.listSchedules({
      unitId: query.unitId,
      month: query.month ? parseInt(query.month, 10) : undefined,
      year: query.year ? parseInt(query.year, 10) : undefined,
      status: query.status,
    });
    return this.toDtoList(schedules);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @Permissions('schedule.read')
  @ApiOperation({ summary: 'Get schedule by id' })
  async getOne(@Param('id') id: string) {
    const schedule = await this.appService.getSchedule(id);
    return this.toDto(schedule);
  }

  @Post(':id/assignments')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.update')
  @ApiOperation({ summary: 'Add assignment to schedule' })
  async addAssignment(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.addAssignment(
      id,
      body,
      req.user.id,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/assignments/override')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.override')
  @ApiOperation({ summary: 'Override an assignment (requires override role)' })
  async overrideAssignment(
    @Param('id') id: string,
    @Body()
    body: {
      assignmentParams: Record<string, unknown>;
      overrideReason: string;
      violatedRules: string[];
    },
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.overrideAssignment(
      id,
      body.assignmentParams,
      req.user.id,
      req.user.role,
      req.user.name,
      body.overrideReason,
      body.violatedRules,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Put(':id/assignments/:assignmentId')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.update')
  @ApiOperation({ summary: 'Update an assignment' })
  async updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() changes: Record<string, unknown>,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.updateAssignment(
      id,
      assignmentId,
      changes,
      req.user.id,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.update')
  @ApiOperation({ summary: 'Remove an assignment' })
  async removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.removeAssignment(
      id,
      assignmentId,
      req.user.id,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/submit-for-review')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.submit')
  @ApiOperation({ summary: 'Submit schedule for review' })
  async submitForReview(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.submitForReview(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      body.comment,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/approve')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Permissions('schedule.approve')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Approve schedule' })
  async approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.approve(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      body.comment,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/reject')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Permissions('schedule.reject')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Reject schedule' })
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.reject(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      body.reason,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/publish')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Permissions('schedule.publish')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Publish schedule' })
  async publish(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.publish(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/archive')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Permissions('schedule.archive')
  @ApiOperation({ summary: 'Archive schedule' })
  async archive(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.archive(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/revert-to-draft')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Permissions('schedule.update')
  @ApiOperation({ summary: 'Revert schedule to draft' })
  async revertToDraft(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.revertToDraft(
      id,
      req.user.id,
      req.user.name,
      req.user.role,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Post(':id/rollback')
  @Roles(MinRole.HOSPITAL_ADMIN)
  @Permissions('schedule.rollback')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Rollback schedule to a previous version' })
  async rollback(
    @Param('id') id: string,
    @Body() body: { targetVersion: number; reason: string },
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: string,
  ) {
    const schedule = await this.appService.rollback(
      id,
      body.targetVersion,
      req.user.id,
      req.user.name,
      req.user.role,
      body.reason,
      expectedVersion ? parseInt(expectedVersion, 10) : undefined,
    );
    return this.toDto(schedule);
  }

  @Get(':id/versions/:version')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get version snapshot' })
  async getVersionSnapshot(
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    return this.scheduleRepo.getVersionSnapshot(id, parseInt(version, 10));
  }

  @Post(':id/validate')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.validate')
  @ApiOperation({ summary: 'Validate full schedule' })
  async validateSchedule(@Param('id') id: string) {
    return this.validationService.validateSchedule(id);
  }

  @Post(':id/jobs/generate')
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.generate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Enqueue async schedule generation job' })
  async enqueueGenerate(
    @Param('id') id: string,
    @Body() body: { unitId: string; month: number; year: number },
    @Request() req: RequestWithUser,
  ) {
    const jobId = await this.jobQueue.enqueueGenerate(
      id,
      body.unitId,
      body.month,
      body.year,
      req.user.organizationId || '',
      req.user.id,
    );
    return { jobId, status: 'QUEUED', scheduleId: id };
  }

  @Post(':id/jobs/export')
  @Roles(MinRole.TECHNICIAN)
  @Permissions('schedule.export')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Enqueue async export job' })
  async enqueueExport(
    @Param('id') id: string,
    @Body() body: { format: 'pdf' | 'excel' | 'csv'; includeStats?: boolean },
    @Request() req: RequestWithUser,
  ) {
    const jobId = await this.jobQueue.enqueueExport(
      id,
      body.format,
      body.includeStats ?? true,
      req.user.organizationId || '',
      req.user.id,
    );
    return { jobId, status: 'QUEUED', scheduleId: id };
  }

  @Get('jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  @Roles(MinRole.VIEWER)
  @Permissions('schedule.read')
  @ApiOperation({ summary: 'Get job status by job ID' })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @Request() req: RequestWithUser,
  ) {
    const record = this.jobStatus.getByJobId(jobId);
    if (!record) throw new NotFoundException(`Job ${jobId} not found`);

    if (req.user.role !== 'system_admin' && req.user.organizationId) {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: record.scheduleId },
        select: { organizationId: true },
      });
      if (
        schedule &&
        schedule.organizationId &&
        schedule.organizationId !== req.user.organizationId
      ) {
        throw new ForbiddenException(
          'Access denied: job belongs to another organization',
        );
      }
    }

    return record;
  }

  @Get(':id/jobs')
  @UseGuards(JwtAuthGuard)
  @Roles(MinRole.VIEWER)
  @Permissions('schedule.read')
  @ApiOperation({ summary: 'Get all jobs for a schedule' })
  async getScheduleJobs(@Param('id') id: string) {
    return this.jobStatus.getByScheduleId(id);
  }

  @Post('jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  @Roles(MinRole.SUPERVISOR)
  @Permissions('schedule.generate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Cancel a queued or running job' })
  async cancelJob(
    @Param('jobId') jobId: string,
    @Request() req: RequestWithUser,
  ) {
    const record = this.jobStatus.getByJobId(jobId);
    if (record && req.user.role !== 'system_admin' && req.user.organizationId) {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: record.scheduleId },
        select: { organizationId: true },
      });
      if (
        schedule &&
        schedule.organizationId &&
        schedule.organizationId !== req.user.organizationId
      ) {
        throw new ForbiddenException(
          'Access denied: job belongs to another organization',
        );
      }
    }

    const cancelled = await this.jobQueue.cancelJob(jobId);
    return { jobId, cancelled };
  }
}
