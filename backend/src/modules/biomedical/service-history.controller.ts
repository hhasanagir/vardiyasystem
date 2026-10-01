import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { ServiceHistoryService } from './service-history.service';

@ApiTags('Biomedical - Device History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('biomedical/devices')
export class ServiceHistoryController {
  constructor(private readonly serviceHistoryService: ServiceHistoryService) {}

  @Get(':assetId/service-history')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get consolidated service history for a device' })
  getByAsset(@Param('assetId') assetId: string) {
    return this.serviceHistoryService.getByAsset(assetId);
  }
}
