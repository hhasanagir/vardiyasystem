import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InsightsService } from './insights.service';
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

@ApiTags('insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insights')
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get('dashboard')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({
    summary:
      'Get dashboard insights (staffing gaps, fatigue, overtime, holiday overload)',
  })
  getDashboardInsights(@Request() req: RequestWithUser) {
    return this.insightsService.getDashboardInsights(req.user?.organizationId);
  }
}
