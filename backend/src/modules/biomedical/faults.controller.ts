import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { FaultsService } from './faults.service';

@ApiTags('Biomedical - Faults')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('biomedical/faults')
export class FaultsController {
  constructor(private readonly faultsService: FaultsService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get fault/incident records' })
  findAll(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('assetId') assetId?: string,
  ) {
    return this.faultsService.findAll({ status, severity, assetId });
  }

  @Get('stats')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get fault statistics (MTBF, MTTR, top faults)' })
  getStats() {
    return this.faultsService.getStats();
  }
}
