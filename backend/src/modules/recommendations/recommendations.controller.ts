import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { RecommendationsService } from './recommendations.service';

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

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get('recommendations')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all active recommendations' })
  findAll(@Request() req: RequestWithUser) {
    return this.recommendationsService.findAll(req.user.organizationId || '');
  }

  @Post('recommendations/:id/apply')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Apply recommendation' })
  apply(@Param('id') id: string) {
    return this.recommendationsService.apply(id);
  }

  @Post('recommendations/:id/dismiss')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Dismiss recommendation' })
  dismiss(@Param('id') id: string) {
    return this.recommendationsService.dismiss(id);
  }

  @Get('conflicts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all unresolved conflicts' })
  findAllConflicts(@Request() req: RequestWithUser) {
    return this.recommendationsService.findAllConflicts(
      req.user.organizationId || '',
    );
  }

  @Post('conflicts/:id/resolve')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Resolve a conflict' })
  resolveConflict(@Param('id') id: string) {
    return this.recommendationsService.resolveConflict(id);
  }

  @Post('actions/run-validation')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Run schedule validation' })
  runValidation(@Request() req: RequestWithUser) {
    return this.recommendationsService.runValidation(
      req.user.organizationId || '',
    );
  }

  @Post('actions/rebalance')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Rebalance schedule workloads' })
  rebalance(@Request() req: RequestWithUser) {
    return this.recommendationsService.rebalance(req.user.organizationId || '');
  }

  @Post('actions/generate-recommendations')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Generate recommendations from insights' })
  generate(@Request() req: RequestWithUser) {
    return this.recommendationsService.generateAll(
      req.user.organizationId || '',
      req.user.id,
    );
  }
}
