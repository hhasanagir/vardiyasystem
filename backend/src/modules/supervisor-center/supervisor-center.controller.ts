import { Controller, Get, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { SupervisorCenterService } from './supervisor-center.service';
import { UnitScopeService } from '../rbac/services/unit-scope.service';

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
    private readonly unitScopeService: UnitScopeService,
  ) {}

  @Get('dashboard')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get full supervisor center dashboard' })
  @ApiQuery({ name: 'date', required: false })
  async getDashboard(@Query('date') date?: string, @Request() req?: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req?.user as any);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    return this.supervisorCenterService.getDashboard(
      { organizationId: scope.organizationId ?? '', unitId: scope.unitId },
      date,
    );
  }

  @Get('shift-coverage')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get shift coverage analysis' })
  @ApiQuery({ name: 'date', required: false })
  async getShiftCoverage(@Query('date') date?: string, @Request() req?: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req?.user as any);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    return this.supervisorCenterService.getShiftCoverage(
      { organizationId: scope.organizationId ?? '', unitId: scope.unitId },
      date,
    );
  }
}
