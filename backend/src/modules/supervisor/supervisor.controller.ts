import { Controller, Get, Query, Request, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupervisorService } from './supervisor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { UnitScopeService } from '../rbac/services/unit-scope.service';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('supervisor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('supervisor')
export class SupervisorController {
  constructor(
    private readonly supervisorService: SupervisorService,
    private readonly unitScopeService: UnitScopeService,
  ) {}

  @Get('dashboard')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get supervisor dashboard data' })
  async getDashboard(@Query('date') date?: string, @Request() req?: RequestWithUser) {
    // Authoritative scope: saha sorumlusu is confined to the assigned unit (null
    // unit fails closed => 403). SUPERVISOR is org-scoped. Never "all units".
    const scope = await this.unitScopeService.resolveReadScope(req?.user as any);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    return this.supervisorService.getDashboard(date, scope, req?.user?.id);
  }
}
