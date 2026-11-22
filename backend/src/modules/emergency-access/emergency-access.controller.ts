import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { EmergencyAccessService } from './emergency-access.service';

interface RequestWithUser {
  user: {
    id: string;
    role: string;
    name: string;
    email: string;
    organizationId?: string;
    unitId?: string | null;
  };
}

@Controller('emergency-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MinRole.HOSPITAL_ADMIN)
export class EmergencyAccessController {
  constructor(private emergencyAccessService: EmergencyAccessService) {}

  @Post('request')
  async requestAccess(
    @Req() req: RequestWithUser,
    @Body('userId') targetUserId: string,
    @Body('reason') reason: string,
    @Body('justification') justification: string,
    @Body('accessLevel') accessLevel?: string,
    @Body('durationMinutes') durationMinutes?: number,
  ) {
    return this.emergencyAccessService.requestAccess({
      userId: targetUserId,
      grantedById: req.user.id,
      reason,
      justification,
      accessLevel,
      durationMinutes,
    }, req.user.organizationId);
  }

  @Post(':id/revoke')
  async revokeAccess(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.emergencyAccessService.revokeAccess(id, req.user.id, req.user.organizationId);
  }

  @Get('active')
  async getActiveGrants(@Req() req: RequestWithUser) {
    return this.emergencyAccessService.getActiveGrants(req.user.organizationId);
  }

  @Get('history')
  async getHistory(@Req() req: RequestWithUser) {
    return this.emergencyAccessService.getGrantHistory(undefined, req.user.organizationId);
  }

  @Get('validate')
  async validateAccess(@Req() req: RequestWithUser) {
    const hasAccess = await this.emergencyAccessService.validateAccess(req.user.id);
    return { hasEmergencyAccess: hasAccess };
  }
}
