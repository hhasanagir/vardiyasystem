import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { BiomedicalKpiService } from './biomedical-kpi.service';

@ApiTags('Biomedical - KPIs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('biomedical/kpis')
export class BiomedicalKpiController {
  constructor(private readonly biomedicalKpiService: BiomedicalKpiService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get biomedical KPIs' })
  @ApiQuery({ name: 'hospitalId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getKpis(
    @Query('hospitalId') hospitalId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.biomedicalKpiService.getKpis({
      hospitalId,
      departmentId,
      startDate,
      endDate,
    });
  }
}
