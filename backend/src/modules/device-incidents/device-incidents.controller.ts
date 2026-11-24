import { Controller, Get, Post, Patch, Param, Body, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceIncidentsService } from './device-incidents.service';
import { CreateDeviceIncidentDto } from './dto/create-device-incident.dto';
import { UpdateDeviceIncidentDto } from './dto/update-device-incident.dto';
import { IncidentQueryDto } from './dto/incident-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { UnitScopeService } from '../rbac/services/unit-scope.service';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('device-incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('device-incidents')
export class DeviceIncidentsController {
  constructor(
    private readonly deviceIncidentsService: DeviceIncidentsService,
    private readonly unitScopeService: UnitScopeService,
  ) {}

  @Post()
  @Roles(MinRole.TECHNICIAN)
  @Log({ action: 'DEVICE_INCIDENT_CREATED', entityType: 'device_incident', description: 'Cihaz arızası bildirildi' })
  @ApiOperation({ summary: 'Report a device fault/incident' })
  async create(@Body() dto: CreateDeviceIncidentDto, @Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    return this.deviceIncidentsService.create(req.user.id, dto, scope);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'List device incidents' })
  async findAll(@Query() query: IncidentQueryDto, @Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    const userUnitId = scope.unitId ?? req.user.unitId;
    return this.deviceIncidentsService.findAll(userUnitId, query, scope);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get a single device incident' })
  async findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    if (scope.denyAll) throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    return this.deviceIncidentsService.findOne(id, req.user.organizationId, scope.unitId ?? undefined);
  }

  @Patch(':id')
  @Roles(MinRole.TECHNICIAN)
  @Log({ action: 'DEVICE_INCIDENT_UPDATED', entityType: 'device_incident', description: 'Cihaz arızası güncellendi' })
  @ApiOperation({ summary: 'Update a device incident' })
  async update(@Param('id') id: string, @Body() dto: UpdateDeviceIncidentDto, @Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    if (scope.denyAll) throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    return this.deviceIncidentsService.update(id, req.user.id, dto, req.user.organizationId, scope.unitId ?? undefined);
  }

  @Patch(':id/status')
  @Roles(MinRole.TECHNICIAN)
  @Log({ action: 'DEVICE_INCIDENT_STATUS_UPDATED', entityType: 'device_incident', description: 'Cihaz arızası durumu güncellendi' })
  @ApiOperation({ summary: 'Update incident status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    if (scope.denyAll) throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    return this.deviceIncidentsService.updateStatus(id, status, req.user.organizationId, scope.unitId ?? undefined);
  }
}
