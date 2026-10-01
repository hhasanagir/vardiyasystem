import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CommandCenterService } from './command-center.service';

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

@ApiTags('command-center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('command-center')
export class CommandCenterController {
  constructor(private readonly service: CommandCenterService) {}

  @Get('snapshot')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get real-time command center snapshot' })
  getSnapshot(@Request() req: RequestWithUser) {
    return this.service.getSnapshot(req.user.organizationId!);
  }
}
