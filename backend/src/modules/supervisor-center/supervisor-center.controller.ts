import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { SupervisorCenterService } from './supervisor-center.service';

interface RequestWithUser {
  user: {
    id: string;
    organizationId: string;
    role: string;
  };
}

@ApiTags('Supervisor Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('supervisor-center')
export class SupervisorCenterController {
  constructor(
    private readonly supervisorCenterService: SupervisorCenterService,
  ) {}

  @Get('dashboard')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get full supervisor center dashboard' })
  @ApiQuery({ name: 'date', required: false })
  getDashboard(@Query('date') date?: string, @Request() req?: RequestWithUser) {
    return this.supervisorCenterService.getDashboard(
      req?.user?.organizationId || '',
      date,
    );
  }

  @Get('shift-coverage')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get shift coverage analysis' })
  @ApiQuery({ name: 'date', required: false })
  getShiftCoverage(
    @Query('date') date?: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.supervisorCenterService.getShiftCoverage(
      req?.user?.organizationId || '',
      date,
    );
  }
}
