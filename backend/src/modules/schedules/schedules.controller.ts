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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
import { WorkflowTransitionDto, RejectScheduleDto, RollbackDto } from './dto/workflow.dto';
import { PublishUnitScheduleDto } from './dto/publish-unit-schedule.dto';
import { DirectAssignDto } from './dto/direct-assign.dto';
import { GenerateScheduleDto, ApplyGeneratedScheduleDto } from './dto/generate-schedule.dto';
import { DryRunOptimizationDto } from './dto/dry-run-optimization.dto';
import { ToggleDeviceOffDto } from './dto/toggle-device-off.dto';
import { ScheduleDryRunService } from './schedule-dry-run.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { ScheduleAccessGuard } from './guards/schedule-access.guard';
import { UnitScope } from '../rbac/decorators/unit-scope.decorator';
import { UnitScopeGuard } from '../rbac/guards/unit-scope.guard';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { PrismaService } from '../../prisma.service';
import { Log } from '../audit-log/log.decorator';
import { AuditEvent } from '../audit-log/audit.constants';
import { canApprove, canPublish, isValidTransition, normalizeStatus } from '../../models/schedule-status';
import { isValidUnitType } from '../../models/unit-type';
import { ScheduleGateway } from '../websocket/schedule.gateway';

type DashboardActivityType =
  | 'shift_assigned'
  | 'swap_request'
  | 'leave_created'
  | 'schedule_updated'
  | 'approval_accepted'
  | 'approval_rejected';

function toDashboardActivityType(actionType: string): DashboardActivityType {
  const action = String(actionType || '').toUpperCase();
  if (action.includes('SWAP')) return 'swap_request';
  if (action.includes('LEAVE') || action.includes('ABSENCE')) return 'leave_created';
  if (action.includes('REJECT') || action.includes('DENY')) return 'approval_rejected';
  if (action.includes('APPROVE') || action.includes('ACCEPT')) return 'approval_accepted';
  if (action.includes('ASSIGN')) return 'shift_assigned';
  return 'schedule_updated';
}

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
@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard, UnitScopeGuard)
@Controller('schedules')
export class SchedulesController {
  constructor(
    private schedulesService: SchedulesService,
    private workflowService: SchedulesWorkflowService,
    private exportService: SchedulesExportService,
    private alertService: ScheduleAlertService,
    private autoGeneratorService: ScheduleAutoGeneratorService,
    private dryRunService: ScheduleDryRunService,
    private readonly unitScopeService: UnitScopeService,
    private readonly prisma: PrismaService,
    private readonly gateway: ScheduleGateway,
  ) {}

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ unitBodyField: 'unitId' })
  @Log({ action: 'SCHEDULE_CREATED', entityType: 'schedule', description: 'Program oluşturuldu' })
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
    return this.resolveUnitScopedList(req?.user).then(({ unitId: scopedUnitId, organizationId, denyAll }) => {
      if (denyAll) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      let effectiveUnitId = unitId;
      if (scopedUnitId) {
        if (unitId && unitId !== scopedUnitId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
        effectiveUnitId = scopedUnitId;
      }
      return this.schedulesService.findAll({
        organizationId: organizationId ?? req?.user?.organizationId,
        unitId: effectiveUnitId, month, year, status
      });
    });
  }

  /** Resolve the read-scope unit+org for a unit-scoped actor (single source of truth). */
  private resolveUnitScopedList(user?: RequestWithUser['user']) {
    if (!user) return Promise.resolve({ unitId: null, organizationId: null, denyAll: false });
    return this.unitScopeService.resolveReadScope(user as any);
  }

  @Get('pending-approvals')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get schedules pending approval' })
  getPendingApprovals(@Request() req: RequestWithUser) {
    return this.workflowService.getPendingApprovals(req.user.organizationId || undefined);
  }

  /**
   * P3-06 — DEPRECATED (one-version window).
   *
   * Canonical route is `GET /me/shifts?month=&year=` (MeController). k6 load,
   * stress, spike and soak scenarios are being migrated to that path in this
   * batch; the alias remains only for external clients that have not moved yet.
   * Remove it in the next API version — do not add new consumers.
   */
  @Get('my-shifts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'DEPRECATED — use GET /me/shifts instead',
    deprecated: true,
  })
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
  @UnitScope({ unitParam: 'unit' })
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
  @UnitScope({ unitParam: 'unit' })
  @ApiOperation({ summary: 'Get Field Supervisor shift date overrides for a unit/month' })
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
  @UnitScope({ unitParam: 'unit' })
  @ApiOperation({ summary: 'Get person-based (cihaz degisim) nobet plani for a unit/month' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getPersonShifts(
    @Param('unit') unit: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.schedulesService.findPersonScheduleByUnitType(unit, month, year);
  }

  @Get('unit/:unit/person-shift-report')
  @Roles(MinRole.VIEWER)
  @UnitScope({ unitParam: 'unit' })
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
    return this.schedulesService.getPersonShiftReport(unit, month, year, { groupId, personnelId });
  }

  @Put('unit/:unit/overrides/:shiftId/:date')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ unitParam: 'unit' })
  @ApiOperation({ summary: 'Enable/disable an optional weekend/holiday assistant shift for a date (generation only, never the template)' })
  setShiftOverride(
    @Param('unit') unit: string,
    @Param('shiftId') shiftId: string,
    @Param('date') date: string,
    @Body('isEnabled') isEnabled: boolean,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.setShiftOverride(unit, shiftId, date, isEnabled ?? true, req.user.id);
  }

  @Post('unit/:unit/publish')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @UnitScope({ unitParam: 'unit' })
  @ApiOperation({ summary: 'Create or update and publish schedule by unit type code' })
  async publishByUnit(
    @Param('unit') unit: string,
    @Body() dto: PublishUnitScheduleDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.publishByUnit(unit, dto, req.user);
  }

  @Post('direct-assign')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @UnitScope({ unitBodyField: 'unitType' })
  @ApiOperation({ summary: 'Direct assignment - auto-creates/publishes schedule if needed' })
  @Log({ action: 'DIRECT_ASSIGN', entityType: 'assignment', description: 'Dogrudan atama - otomatik vardiya olusturma' })
  async directAssign(
    @Body() dto: DirectAssignDto,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: number,
  ) {
    return this.schedulesService.directAssign(
      dto.unitType,
      dto.month,
      dto.year,
      { personnelId: dto.personnelId, deviceId: dto.deviceId, date: dto.date, shiftType: dto.shiftType, startTime: dto.startTime, endTime: dto.endTime },
      req.user.id,
      req.user.role,
      req.user.name,
      req.user.email,
      req.user.organizationId,
      expectedVersion,
    );
  }

  @Get('analytics')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @ApiOperation({ summary: 'Get scheduling analytics' })
  getAnalytics(@Request() req: RequestWithUser) {
    return this.schedulesService.getAnalytics(req.user.organizationId);
  }

  /**
   * P2-16 — the dashboard calls /schedules/activities and /schedules/live-metrics.
   * Both routes must be declared before @Get(':id'), otherwise the id fallback
   * swallows them and returns 404. Tenant is taken from the authenticated user,
   * never from the query string.
   */
  @Get('activities')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Recent schedule activities (org-scoped)' })
  async getActivities(
    @Query('limit') limit: string | number,
    @Request() req: RequestWithUser,
  ) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return [];

    const parsed = Number(limit);
    const take = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 50) : 10;
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        actionType: true,
        description: true,
        createdAt: true,
        userName: true,
      },
    });

    return logs.map(log => ({
      id: log.id,
      type: toDashboardActivityType(log.actionType),
      message: log.description || log.actionType,
      timestamp: log.createdAt,
      employeeName: log.userName || undefined,
    }));
  }

  @Get('live-metrics')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Live scheduling connection metrics' })
  getLiveMetrics() {
    const sockets = this.gateway.server?.sockets?.sockets?.size;
    return {
      online: true,
      activeConnections: typeof sockets === 'number' ? sockets : 0,
      lastUpdate: new Date(),
    };
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Get schedule by ID' })
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Get(':id/versions')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Get schedule version history' })
  getVersionHistory(@Param('id') id: string) {
    return this.workflowService.getVersionHistory(id);
  }

  // P3-06 — legacy `:id/versions/:version` removed. Canonical snapshot read is
  // SchedulesDDDController `GET /schedules-ddd/:id/versions/:version`
  // (SUPERVISOR + UnitScope), used by the FE version panel.
  @Get(':id/compare')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
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

  // P3-06 — unscoped `:id/snapshots` removed (attack-surface reduction).
  /**
   * Enforce authoritative read-scope for a client-supplied unit before export.
   *
   * Resolves the unit (by id, code, or type) and:
   * - strictly unit-scoped roles (saha sorumlusu) must match their assigned unit,
   *   a null assignment denies, and an unresolvable unit denies;
   * - broader roles must stay within their own organization.
   * Throws 403 when out of scope. Filtering happens BEFORE export generation.
   */
  private async enforceUnitReadScope(
    user: RequestWithUser['user'],
    unitParam: string,
  ): Promise<string | null> {
    if (!user) return unitParam;
    const trimmed = (unitParam || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    let unit = isUuid
      ? await this.prisma.unit.findFirst({
          where: { id: trimmed },
          select: { id: true, organizationId: true },
        })
      : await this.prisma.unit.findFirst({
          where: { code: trimmed },
          select: { id: true, organizationId: true },
        });
    // The unit-TYPE branch is only reachable with a genuine enum value; passing
    // an arbitrary string as `type` would raise a Prisma validation error (500).
    if (!unit && !isUuid && isValidUnitType(trimmed.toLowerCase())) {
      unit = await this.prisma.unit.findFirst({
        where: { type: trimmed.toLowerCase() as any },
        select: { id: true, organizationId: true },
      });
    }
    if (this.unitScopeService.isStrictlyUnitScoped(user as any)) {
      if (!unit) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      const allowed = await this.unitScopeService.canAccessUnit(user as any, unit.id, unit.organizationId);
      if (!allowed) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      return unit.id;
    }
    // Broader roles: enforce same-organization via canAccessUnit (cross-org deny).
    if (unit) {
      const allowed = await this.unitScopeService.canAccessUnit(user as any, unit.id, unit.organizationId);
      if (!allowed) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
    }
    return unit?.id ?? unitParam;
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
    @Request() req: RequestWithUser,
    @Res() res: Response,
  ) {
    await this.enforceUnitReadScope(req.user, unit);
    const buf = await this.exportService.exportExcel(unit, month, year);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
    @Request() req: RequestWithUser,
    @Res() res: Response,
  ) {
    await this.enforceUnitReadScope(req.user, unit);
    const buf = await this.exportService.exportPdf(unit, month, year);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="vardiya_plani_${unit}_${month}_${year}.pdf"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  }

  @Get('dashboard/stats')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  getDashboardStats(@Request() req: RequestWithUser) {
    return this.schedulesService.getDashboardStats(req.user.organizationId);
  }

  @Get(':id/alerts')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Get staffing alerts for schedule' })
  getAlerts(@Param('id') id: string) {
    return this.alertService.getAlerts(id);
  }

  @Put(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @Log({ action: 'SCHEDULE_UPDATED', entityType: 'schedule', description: 'Program güncellendi' })
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
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Add assignment to schedule' })
  addAssignment(
    @Param('id') id: string,
    @Body() dto: CreateAssignmentDto,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: number,
  ) {
    return this.schedulesService.addAssignment(id, dto, req.user.id, req.user.role, expectedVersion);
  }

  @Post(':id/assignments/override')
  @Roles(MinRole.SUPERVISOR)
  @Log({ action: 'ASSIGNMENT_OVERRIDE', entityType: 'assignment', description: 'İstisna onayı ile atama yapıldı' })
  @ApiOperation({ summary: 'Override assignment with authorized exception' })
  overrideAssignment(
    @Param('id') id: string,
    @Body() dto: OverrideAssignmentDto,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: number,
  ) {
    return this.schedulesService.overrideAssignment(id, dto, req.user.id, req.user.role, req.user.name, expectedVersion);
  }

  @Put(':id/assignments/:assignmentId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Update assignment in schedule' })
  updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: number,
  ) {
    return this.schedulesService.updateAssignment(id, assignmentId, dto, req.user.id, expectedVersion);
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Remove assignment from schedule' })
  removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: RequestWithUser,
    @Query('expectedVersion') expectedVersion?: number,
  ) {
    return this.schedulesService.removeAssignment(id, assignmentId, req.user.id, expectedVersion);
  }

  @Post(':id/submit')
  @Roles(MinRole.SUPERVISOR)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @Log({ action: 'SUBMIT_FOR_REVIEW', entityType: 'schedule', description: 'Program incelemeye gönderildi' })
  @ApiOperation({ summary: 'Submit schedule for review' })
  submitForReview(
    @Param('id') id: string,
    @Body() dto: WorkflowTransitionDto,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.submitForReview(id, req.user, dto.comment);
  }

  @Post(':id/approve')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Log({ action: 'SCHEDULE_APPROVED', entityType: 'schedule', description: 'Program onaylandı' })
  @ApiOperation({ summary: 'Approve schedule' })
  approve(
    @Param('id') id: string,
    @Body() dto: WorkflowTransitionDto,
    @Request() req: RequestWithUser,
  ) {
    if (!canApprove(req.user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok. Görüntüleme Hizmetleri görüşü veya üstü rol gerekli.');
    }
    return this.workflowService.approve(id, req.user, dto.comment);
  }

  @Post(':id/reject')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Log({ action: 'SCHEDULE_REJECTED', entityType: 'schedule', description: 'Program reddedildi' })
  @ApiOperation({ summary: 'Reject schedule' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectScheduleDto,
    @Request() req: RequestWithUser,
  ) {
    if (!canApprove(req.user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok. Görüntüleme Hizmetleri görüşü veya üstü rol gerekli.');
    }
    return this.workflowService.reject(id, req.user, dto.reason);
  }

  @Post(':id/publish')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Log({ action: 'PUBLISH', entityType: 'schedule', description: 'Program yayınlandı' })
  @ApiOperation({ summary: 'Publish approved schedule' })
  publish(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.publish(id, req.user);
  }

  @Post(':id/archive')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @ApiOperation({ summary: 'Archive published schedule' })
  archive(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.archive(id, req.user);
  }

  @Post(':id/rollback/:version')
  @Roles(MinRole.HOSPITAL_ADMIN)
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
  @Roles(MinRole.IMAGING_DIRECTOR)
  @ApiOperation({ summary: 'Create revision from published schedule' })
  createRevision(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.workflowService.createRevision(id, req.user);
  }

  // P3-06 — unscoped `:id/duplicate` endpoint removed. SchedulesService.duplicate()
  // stays in the service layer (existing regression coverage); exposing it again
  // requires an explicit UnitScope + authz decision.

  @Delete(':id')
  @Roles(MinRole.IMAGING_DIRECTOR)
  @Log({ action: 'SCHEDULE_DELETED', entityType: 'schedule', description: 'Program silindi' })
  @ApiOperation({ summary: 'Delete schedule' })
  async delete(@Param('id') id: string, @Request() req: RequestWithUser) {
    const schedule = await this.schedulesService.findOne(id);
    if (schedule.status !== 'draft') {
      throw new ForbiddenException('Sadece taslak programlar silinebilir.');
    }
    return this.schedulesService.delete(id, req.user.id);
  }

  @Post(':id/device-off')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @Log({ action: 'EQUIPMENT_OFF_TOGGLE', entityType: 'device_off_date', description: 'Cihaz kapatma/açma' })
  @ApiOperation({ summary: 'Toggle equipment off for a device on a specific date' })
  toggleDeviceOff(
    @Param('id') id: string,
    @Body() dto: ToggleDeviceOffDto,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.toggleDeviceOff(id, dto, req.user.id, req.user.role);
  }

  @Get(':id/device-off')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'schedule', idParam: 'id' })
  @ApiOperation({ summary: 'Get all equipment-off dates for a schedule' })
  getDeviceOffDates(@Param('id') id: string) {
    return this.schedulesService.getDeviceOffDates(id);
  }

  @Post('generate')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @UnitScope({ unitBodyField: 'unitType' })
  @ApiOperation({ summary: 'Auto-generate and preview monthly schedule' })
  generate(@Body() dto: GenerateScheduleDto, @Request() req: RequestWithUser) {
    return this.autoGeneratorService.preview(req.user.id, dto, req.user.organizationId);
  }

  // P3-06 — `generate/preview` removed: it was byte-identical to `POST generate`
  // (both call autoGeneratorService.preview) and its only FE helper was unused.
  @Post('generate/apply')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @UnitScope({ entityType: 'schedule', entityBodyField: 'scheduleId' })
  @Log({ action: AuditEvent.ASSIGNMENTS_APPLIED, entityType: 'assignment', description: 'Otomatik atamalar plana uygulandı' })
  @ApiOperation({ summary: 'Apply generated assignments to a schedule' })
  apply(@Body() dto: ApplyGeneratedScheduleDto, @Request() req: RequestWithUser) {
    return this.autoGeneratorService.apply(dto, req.user.id, req.user);
  }

  @Post('optimize/dry-run')
  @Roles(MinRole.SENIOR_TECHNICIAN)
  @UnitScope({ unitBodyField: 'unitType' })
  @ApiOperation({ summary: 'Run schedule optimization without persisting (dry-run)' })
  async dryRun(@Body() dto: DryRunOptimizationDto, @Request() req: RequestWithUser) {
    return this.dryRunService.execute(dto, req.user.organizationId);
  }
}