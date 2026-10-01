import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('device-incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('device-incidents')
export class DeviceIncidentsController {
  constructor(
    private readonly deviceIncidentsService: DeviceIncidentsService,
  ) {}

  @Post()
  @Roles(MinRole.TECHNICIAN)
  @Log({
    action: 'DEVICE_INCIDENT_CREATED',
    entityType: 'device_incident',
    description: 'Cihaz arızası bildirildi',
  })
  @ApiOperation({ summary: 'Report a device fault/incident' })
  create(
    @Body() dto: CreateDeviceIncidentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.deviceIncidentsService.create(req.user.id, dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'List device incidents' })
  findAll(@Query() query: IncidentQueryDto, @Request() req: RequestWithUser) {
    return this.deviceIncidentsService.findAll(req.user.unitId, query);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get a single device incident' })
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.deviceIncidentsService.findOne(id, req.user.organizationId);
  }

  @Patch(':id')
  @Roles(MinRole.TECHNICIAN)
  @Log({
    action: 'DEVICE_INCIDENT_UPDATED',
    entityType: 'device_incident',
    description: 'Cihaz arızası güncellendi',
  })
  @ApiOperation({ summary: 'Update a device incident' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceIncidentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.deviceIncidentsService.update(
      id,
      req.user.id,
      dto,
      req.user.organizationId,
    );
  }

  @Patch(':id/status')
  @Roles(MinRole.TECHNICIAN)
  @Log({
    action: 'DEVICE_INCIDENT_STATUS_UPDATED',
    entityType: 'device_incident',
    description: 'Cihaz arızası durumu güncellendi',
  })
  @ApiOperation({ summary: 'Update incident status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: RequestWithUser,
  ) {
    return this.deviceIncidentsService.updateStatus(id, status);
  }
}
