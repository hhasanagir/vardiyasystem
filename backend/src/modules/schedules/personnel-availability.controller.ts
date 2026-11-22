import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { PersonnelAvailabilityService, AvailabilityActor } from './services/personnel-availability.service';
import { CreatePersonnelAvailabilityDto } from './dto/create-personnel-availability.dto';
import { UpdatePersonnelAvailabilityDto } from './dto/update-personnel-availability.dto';

interface RequestWithUser {
  user: AvailabilityActor & { id: string };
}

/**
 * Personnel date-availability CRUD.
 *
 * NOTE: intentionally NOT guarded class-level by ScheduleAccessGuard: that guard
 * resolves `params.id` as a SCHEDULE id, which would 404 PATCH/DELETE where :id
 * is an availability row id. Scope enforcement is delegated to the service via
 * UnitScopeService (the same backend-authoritative mechanism used by schedule
 * write endpoints): FIELD_SUPERVISOR single-unit, SUPERVISOR org-scope, NULL-org
 * fail closed, explicit platform SYSTEM_ADMIN carve-out.
 */
@ApiTags('schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personnel-availability')
export class PersonnelAvailabilityController {
  constructor(private readonly personnelAvailability: PersonnelAvailabilityService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'List personnel date-availability records (scoped)' })
  @ApiQuery({ name: 'personnelId', required: false })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  list(
    @Query('personnelId') personnelId?: string,
    @Query('unitId') unitId?: string,
    @Query('date') date?: string,
    @Query('take') take?: number,
    @Query('skip') skip?: number,
    @Request() req?: RequestWithUser,
  ) {
    return this.personnelAvailability.list(
      {
        personnelId,
        unitId,
        date,
        take: take === undefined ? undefined : Number(take),
        skip: skip === undefined ? undefined : Number(skip),
      },
      req!.user,
    );
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create / upsert a personnel date-availability record' })
  create(@Body() dto: CreatePersonnelAvailabilityDto, @Request() req: RequestWithUser) {
    return this.personnelAvailability.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update a personnel date-availability record (incl. reactivation)' })
  update(@Param('id') id: string, @Body() dto: UpdatePersonnelAvailabilityDto, @Request() req: RequestWithUser) {
    return this.personnelAvailability.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Deactivate a personnel date-availability record (soft delete)' })
  deactivate(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.personnelAvailability.deactivate(id, req.user);
  }
}