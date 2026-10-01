import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';

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

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'Get dashboard KPIs, alerts, upcoming shifts and unit summary',
  })
  getDashboard(@Request() req: RequestWithUser) {
    return this.analyticsService.getDashboard(
      req?.user?.organizationId || '',
      req?.user?.unitId || undefined,
    );
  }

  @Get('overview')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get overview KPIs' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'unitType', required: false })
  getOverview(
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('unitType') unitType?: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.analyticsService.getOverview(
      req?.user?.organizationId || '',
      month,
      year,
      unitType,
    );
  }

  @Get('workload')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get per-personnel workload' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'unitType', required: false })
  getWorkload(
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('unitType') unitType?: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.analyticsService.getWorkload(
      req?.user?.organizationId || '',
      month,
      year,
      unitType,
    );
  }

  @Get('overtime')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get overtime ranking' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'unitType', required: false })
  getOvertime(
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('unitType') unitType?: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.analyticsService.getOvertimeRanking(
      req?.user?.organizationId || '',
      month,
      year,
      unitType,
    );
  }

  @Get('device-utilization')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get device utilization rates' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'unitType', required: false })
  getDeviceUtilization(
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('unitType') unitType?: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.analyticsService.getDeviceUtilization(
      req?.user?.organizationId || '',
      month,
      year,
      unitType,
    );
  }
}
