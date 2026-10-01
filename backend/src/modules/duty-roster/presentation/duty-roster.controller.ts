import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DutyRosterService } from '../duty-roster.service';
import {
  CreateDutyRosterEntryDto,
  UpdateDutyRosterEntryDto,
  DutyRosterFilterDto,
} from './duty-roster.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

interface RequestWithUser {
  user: { id: string; organizationId?: string; role: string };
}

@ApiTags('Duty Roster')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('duty-roster')
export class DutyRosterController {
  constructor(private readonly dutyRosterService: DutyRosterService) {}

  @Post()
  @Roles('hospital_admin', 'system_admin', 'supervisor', 'senior_technician')
  @ApiOperation({ summary: 'Create a duty roster entry' })
  create(
    @Body() dto: CreateDutyRosterEntryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.dutyRosterService.create({
      ...dto,
      organizationId: req.user.organizationId!,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List duty roster entries with filters' })
  findAll(
    @Query() filter: DutyRosterFilterDto,
    @Request() req: RequestWithUser,
  ) {
    return this.dutyRosterService.findAll({
      ...filter,
      organizationId: req.user.organizationId!,
    });
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get duty roster calendar view (monthly)' })
  getCalendar(
    @Query('month') month: number,
    @Query('year') year: number,
    @Request() req: RequestWithUser,
  ) {
    return this.dutyRosterService.getCalendar(
      req.user.organizationId!,
      +month,
      +year,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a duty roster entry by ID' })
  findById(@Param('id') id: string) {
    return this.dutyRosterService.findById(id);
  }

  @Put(':id')
  @Roles('hospital_admin', 'system_admin', 'supervisor', 'senior_technician')
  @ApiOperation({ summary: 'Update a duty roster entry' })
  update(@Param('id') id: string, @Body() dto: UpdateDutyRosterEntryDto) {
    return this.dutyRosterService.update(id, dto);
  }

  @Delete(':id')
  @Roles('hospital_admin', 'system_admin')
  @ApiOperation({ summary: 'Delete a duty roster entry' })
  remove(@Param('id') id: string) {
    return this.dutyRosterService.remove(id);
  }

  @Delete(':id/soft')
  @Roles('hospital_admin', 'system_admin', 'supervisor')
  @ApiOperation({ summary: 'Soft delete a duty roster entry' })
  softRemove(@Param('id') id: string) {
    return this.dutyRosterService.softRemove(id);
  }
}
