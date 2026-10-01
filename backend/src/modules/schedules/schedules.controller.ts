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
  BadRequestException,
  Res,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { SchedulesService } from './schedules.service';
import { ScheduleAutoGeneratorService } from './schedule-auto-generator.service';
import { SchedulesExportService } from './schedules-export.service';
import { ScheduleAlertService } from './schedule-alert.service';
import { SchedulesWorkflowService } from './schedules-workflow.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { OverrideAssignmentDto } from './dto/override-assignment.dto';
import {
  WorkflowTransitionDto,
  RejectScheduleDto,
  RollbackDto,
} from './dto/workflow.dto';
import { PublishUnitScheduleDto } from './dto/publish-unit-schedule.dto';
import { DirectAssignDto } from './dto/direct-assign.dto';
import {
  GenerateScheduleDto,
  PreviewScheduleDto,
  ApplyGeneratedScheduleDto,
} from './dto/generate-schedule.dto';
import { DryRunOptimizationDto } from './dto/dry-run-optimization.dto';
import { ScheduleDryRunService } from './schedule-dry-run.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole, isUnitScopedRole } from '../../guards/min-role';
import { ScheduleAccessGuard } from './guards/schedule-access.guard';
import { Log } from '../audit-log/log.decorator';
import {
  canApprove,
  canPublish,
  isValidTransition,
  normalizeStatus,
} from '../../models/schedule-status';

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

@ApiTags('schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)
@Controller('schedules')
export class SchedulesController {
  constructor(
    private schedulesService: SchedulesService,
    private workflowService: SchedulesWorkflowService,
    private exportService: SchedulesExportService,
    private alertService: ScheduleAlertService,
    private autoGeneratorService: ScheduleAutoGeneratorService,
    private dryRunService: ScheduleDryRunService,
  ) {}

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @Log({
    action: 'SCHEDULE_CREATED',
    entityType: 'schedule',
    description: 'Program oluşturuldu',
  })
  @ApiOperation({ summary: 'Create new schedule' })
  create(@Body() dto: CreateScheduleDto, @Request() req: RequestWithUser) {
    return this.schedulesService.create(dto, req.user.id);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all schedules' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @Query('unitId') unitId?: string,
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('status') status?: string,
    @Request() req?: RequestWithUser,
  ) {
    const user = req?.user;
    if (user && isUnitScopedRole(user.role) && user.unitId) {
      if (unitId && unitId !== user.unitId) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      unitId = user.unitId;
    }
    return this.schedulesService.findAll({
      organizationId: user?.organizationId,
      unitId,
      month,
      year,
      status,
    });
  }

  @Get('pending-approvals')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get schedules pending approval' })
  getPendingApprovals(@Request() req: RequestWithUser) {
    return this.workflowService.getPendingApprovals();
  }

  @Get('by-unit/:unitId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get schedule by unit and month/year' })
  findByUnit(
    @Param('unitId') unitId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.schedulesService.findByUnitMonthYear(unitId, month, year);
  }

  @Get('my-shifts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get shifts for the logged-in personnel' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  findMyShifts(
    @Query('month') month: number,
    @Query('year') year: number,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.findMyShifts(req.user.email, month, year);
  }

  @Get('unit/:unit')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get schedule by unit type code and month/year' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  findByUnitCode(
    @Param('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.schedulesService.findByUnitType(unit, month, year);
  }

  @Get('unit/:unit/overrides')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'Get Field Supervisor shift date overrides for a unit/month',
  })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getShiftOverrides(
    @Param('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.schedulesService.getShiftOverrides(unit, month, year);
  }

  @Get('unit/:unit/person-shifts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'Get person-based (cihaz dışı) nöbet planı for a unit/month',
  })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getPersonShifts(
    @Param('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.schedulesService.findPersonScheduleByUnitType(
      unit,
      month,
      year,
    );
  }

  @Get('unit/:unit/person-shift-report')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get person-based nöbet raporu for a unit/month' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'personnelId', required: false })
  getPersonShiftReport(
    @Param('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Query('groupId') groupId?: string,
    @Query('personnelId') personnelId?: string,
  ) {
    return this.schedulesService.getPersonShiftReport(unit, month, year, {
      groupId,
      personnelId,
    });
  }

  @Put('unit/:unit/overrides/:shiftId/:date')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({
    summary:
      'Enable/disable an optional weekend/holiday assistant shift for a date (generation only, never the template)',
  })
  setShiftOverride(
    @Param('unit') unit: string,
    @Param('shiftId') shiftId: string,
    @Param('date') date: string,
    @Body('isEnabled') isEnabled: boolean,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.setShiftOverride(
      unit,
      shiftId,
      date,
      isEnabled ?? true,
      req.user.id,
    );
  }

  @Post('unit/:unit/publish')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({
    summary: 'Create or update and publish schedule by unit type code',
  })
  async publishByUnit(
    @Param('unit') unit: string,
    @Body() dto: PublishUnitScheduleDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.publishByUnit(unit, dto, req.user);
  }

  @Post('direct-assign')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @ApiOperation({
    summary: 'Direct assignment - auto-creates/publishes schedule if needed',
  })
  @Log({
    action: 'DIRECT_ASSIGN',
    entityType: 'assignment',
    description: 'Dogrudan atama - otomatik vardiya olusturma',
  })
  async directAssign(
    @Body() dto: DirectAssignDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.directAssign(
      dto.unitType,
      dto.month,
      dto.year,
      {
        personnelId: dto.personnelId,
        deviceId: dto.deviceId,
        date: dto.date,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
      req.user.id,
      req.user.role,
      req.user.name,
      req.user.email,
    );
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get schedule by ID' })
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Get(':id/versions')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get schedule version history' })
  getVersionHistory(@Param('id') id: string) {
    return this.workflowService.getVersionHistory(id);
  }

  @Get(':id/versions/:version')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get specific version snapshot' })
  getVersion(@Param('id') id: string, @Param('version') version: number) {
    return this.workflowService.getVersionSnapshot(id, version);
  }

  @Get(':id/compare')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Compare two versions' })
  compareVersions(
    @Param('id') id: string,
    @Query('from') fromVersion: number,
    @Query('to') toVersion: number,
  ) {
    return this.workflowService.compareVersions(id, fromVersion, toVersion);
  }

  @Get(':id/audit')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get schedule audit log' })
  getAuditLog(@Param('id') id: string) {
    return this.workflowService.getAuditLog(id);
  }

  @Get(':id/snapshots')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get schedule snapshots' })
  getSnapshots(@Param('id') id: string) {
    return this.schedulesService.getSnapshots(id);
  }

  @Get('export/excel')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Export schedule as Excel' })
  @ApiQuery({ name: 'unit', required: true })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  async exportExcel(
    @Query('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Res() res: Response,
  ) {
    const buf = await this.exportService.exportExcel(unit, month, year);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vardiya_plani_${unit}_${month}_${year}.xlsx"`,
      'Content-Length': buf.byteLength,
    });
    res.send(Buffer.from(buf));
  }

  @Get('export/pdf')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Export schedule as PDF' })
  @ApiQuery({ name: 'unit', required: true })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  async exportPdf(
    @Query('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Res() res: Response,
  ) {
    const buf = await this.exportService.exportPdf(unit, month, year);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="vardiya_plani_${unit}_${month}_${year}.pdf"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  }

  @Get('analytics')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Get scheduling analytics' })
  getAnalytics(@Request() req: RequestWithUser) {
    return this.schedulesService.getAnalytics(req.user.organizationId);
  }

  @Get('dashboard/stats')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  getDashboardStats(@Request() req: RequestWithUser) {
    return this.schedulesService.getDashboardStats(req.user.organizationId);
  }

  @Get(':id/alerts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get staffing alerts for schedule' })
  getAlerts(@Param('id') id: string) {
    return this.alertService.getAlerts(id);
  }

  @Put(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @Log({
    action: 'SCHEDULE_UPDATED',
    entityType: 'schedule',
    description: 'Program güncellendi',
  })
  @ApiOperation({ summary: 'Update schedule' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @Request() req: RequestWithUser,
    @Query('version') version?: number,
  ) {
    return this.schedulesService.update(id, dto, req.user.id, version);
  }

  @Post(':id/assignments')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Add assignment to schedule' })
  addAssignment(
    @Param('id') id: string,
    @Body() dto: CreateAssignmentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.addAssignment(
      id,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Post(':id/assignments/override')
  @Roles(MinRole.SUPERVISOR)
  @Log({
    action: 'ASSIGNMENT_OVERRIDE',
    entityType: 'assignment',
    description: 'İstisna onayı ile atama yapıldı',
  })
  @ApiOperation({ summary: 'Override assignment with authorized exception' })
  overrideAssignment(
    @Param('id') id: string,
    @Body() dto: OverrideAssignmentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.overrideAssignment(
      id,
      dto,
      req.user.id,
      req.user.role,
      req.user.name,
    );
  }

  @Put(':id/assignments/:assignmentId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update assignment in schedule' })
  updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.updateAssignment(
      id,
      assignmentId,
      dto,
      req.user.id,
    );
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Remove assignment from schedule' })
  removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.removeAssignment(
      id,
      assignmentId,
      req.user.id,
    );
  }

  @Post(':id/submit')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @Log({
    action: 'SUBMIT_FOR_REVIEW',
    entityType: 'schedule',
    description: 'Program incelemeye gönderildi',
  })
  @ApiOperation({ summary: 'Submit schedule for review' })
  submitForReview(
    @Param('id') id: string,
    @Body() dto: WorkflowTransitionDto,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.submitForReview(id, req.user, dto.comment);
  }

  @Post(':id/approve')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SCHEDULE_APPROVED',
    entityType: 'schedule',
    description: 'Program onaylandı',
  })
  @ApiOperation({ summary: 'Approve schedule' })
  approve(
    @Param('id') id: string,
    @Body() dto: WorkflowTransitionDto,
    @Request() req: RequestWithUser,
  ) {
    if (!canApprove(req.user.role)) {
      throw new ForbiddenException(
        'Bu işlemi yapmak için yetkiniz yok. Başteknisyen veya üstü rol gerekli.',
      );
    }
    return this.workflowService.approve(id, req.user, dto.comment);
  }

  @Post(':id/reject')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SCHEDULE_REJECTED',
    entityType: 'schedule',
    description: 'Program reddedildi',
  })
  @ApiOperation({ summary: 'Reject schedule' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectScheduleDto,
    @Request() req: RequestWithUser,
  ) {
    if (!canApprove(req.user.role)) {
      throw new ForbiddenException(
        'Bu işlemi yapmak için yetkiniz yok. Başteknisyen veya üstü rol gerekli.',
      );
    }
    return this.workflowService.reject(id, req.user, dto.reason);
  }

  @Post(':id/publish')
  @Roles(MinRole.PLANNER)
  @Log({
    action: 'PUBLISH',
    entityType: 'schedule',
    description: 'Program yayınlandı',
  })
  @ApiOperation({ summary: 'Publish approved schedule' })
  publish(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.workflowService.publish(id, req.user);
  }

  @Post(':id/archive')
  @Roles(MinRole.PLANNER)
  @ApiOperation({ summary: 'Archive published schedule' })
  archive(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.workflowService.archive(id, req.user);
  }

  @Post(':id/rollback/:version')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Rollback schedule to version' })
  rollback(
    @Param('id') id: string,
    @Param('version') version: number,
    @Body() dto: RollbackDto,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.rollback(id, version, req.user, dto.reason);
  }

  @Post(':id/revision')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Create revision from published schedule' })
  createRevision(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.workflowService.createRevision(id, req.user);
  }

  @Post(':id/duplicate')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Duplicate schedule to new month/year' })
  duplicate(
    @Param('id') id: string,
    @Body('targetMonth') targetMonth: number,
    @Body('targetYear') targetYear: number,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.duplicate(
      id,
      targetMonth,
      targetYear,
      req.user.id,
    );
  }

  @Delete(':id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SCHEDULE_DELETED',
    entityType: 'schedule',
    description: 'Program silindi',
  })
  @ApiOperation({ summary: 'Delete schedule' })
  async delete(@Param('id') id: string, @Request() req: RequestWithUser) {
    if (req.user.role === 'imaging_director') {
      const schedule = await this.schedulesService.findOne(id);
      if (schedule.status !== 'draft') {
        throw new ForbiddenException('Sadece taslak programlar silinebilir.');
      }
    }
    return this.schedulesService.delete(id, req.user.id);
  }

  @Post('generate')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Auto-generate and preview monthly schedule' })
  generate(@Body() dto: GenerateScheduleDto, @Request() req: RequestWithUser) {
    return this.autoGeneratorService.preview(req.user.id, dto);
  }

  @Post('generate/preview')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Preview auto-generated schedule without saving' })
  preview(@Body() dto: PreviewScheduleDto, @Request() req: RequestWithUser) {
    return this.autoGeneratorService.preview(req.user.id, dto);
  }

  @Post('generate/apply')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Apply generated assignments to a schedule' })
  apply(
    @Body() dto: ApplyGeneratedScheduleDto,
    @Request() req: RequestWithUser,
  ) {
    return this.autoGeneratorService.apply(dto, req.user.id);
  }

  @Post('optimize/dry-run')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({
    summary: 'Run schedule optimization without persisting (dry-run)',
  })
  async dryRun(
    @Body() dto: DryRunOptimizationDto,
    @Request() req: RequestWithUser,
  ) {
    return this.dryRunService.execute(dto);
  }
}
