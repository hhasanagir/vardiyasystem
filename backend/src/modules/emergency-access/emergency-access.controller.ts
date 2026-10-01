import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { EmergencyAccessService } from './emergency-access.service';

@Controller('emergency-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MinRole.HOSPITAL_ADMIN)
export class EmergencyAccessController {
  constructor(private emergencyAccessService: EmergencyAccessService) {}

  @Post('request')
  async requestAccess(
    @Req() req: any,
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
    });
  }

  @Post(':id/revoke')
  async revokeAccess(@Param('id') id: string, @Req() req: any) {
    return this.emergencyAccessService.revokeAccess(id, req.user.id);
  }

  @Get('active')
  async getActiveGrants() {
    return this.emergencyAccessService.getActiveGrants();
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    return this.emergencyAccessService.getGrantHistory();
  }

  @Get('validate')
  async validateAccess(@Req() req: any) {
    const hasAccess = await this.emergencyAccessService.validateAccess(
      req.user.id,
    );
    return { hasEmergencyAccess: hasAccess };
  }
}
