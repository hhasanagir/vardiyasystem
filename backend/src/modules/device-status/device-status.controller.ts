import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
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
import { DeviceStatusService } from './device-status.service';
import { UpdateDeviceStatusDto } from './dto/update-device-status.dto';

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

@ApiTags('device-status')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('device-status')
export class DeviceStatusController {
  constructor(private deviceStatusService: DeviceStatusService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices for my unit with latest status' })
  getMyUnitDevices(@Request() req: RequestWithUser) {
    return this.deviceStatusService.getMyUnitDevices(req.user.id);
  }

  @Get('device/:deviceId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get current status for a device' })
  getCurrentStatus(@Param('deviceId') deviceId: string) {
    return this.deviceStatusService.getCurrentStatus(deviceId);
  }

  @Get('device/:deviceId/history')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get status history for a device' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStatusHistory(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: number,
  ) {
    return this.deviceStatusService.getStatusHistory(deviceId, limit || 20);
  }

  @Post()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Update device operational status' })
  updateStatus(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateDeviceStatusDto,
  ) {
    return this.deviceStatusService.updateStatus(
      req.user.id,
      dto.deviceId,
      dto.status,
      dto.notes,
    );
  }
}
