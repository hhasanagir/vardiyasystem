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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { DeviceStatusService } from './device-status.service';
import { UpdateDeviceStatusDto } from './dto/update-device-status.dto';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('device-status')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('device-status')
export class DeviceStatusController {
  constructor(
    private deviceStatusService: DeviceStatusService,
    private readonly unitScopeService: UnitScopeService,
  ) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices for my unit with latest status' })
  async getMyUnitDevices(@Request() req: RequestWithUser) {
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    if (scope.denyAll) return [];
    return this.deviceStatusService.getMyUnitDevices(req.user.id, scope.unitId);
  }

  @Get('device/:deviceId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get current status for a device' })
  async getCurrentStatus(@Param('deviceId') deviceId: string, @Request() req: RequestWithUser) {
    const target = await this.unitScopeService.resolveTargetScope('device', deviceId);
    if (!target) {
      throw new NotFoundException('Cihaz bulunamadı');
    }
    const allowed = await this.unitScopeService.canAccessUnit(
      req.user as any, target.unitId, target.organizationId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    return this.deviceStatusService.getCurrentStatus(deviceId);
  }

  @Get('device/:deviceId/history')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get status history for a device' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getStatusHistory(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: number,
    @Request() req?: RequestWithUser,
  ) {
    if (req?.user) {
      const target = await this.unitScopeService.resolveTargetScope('device', deviceId);
      if (!target) {
        throw new NotFoundException('Cihaz bulunamadı');
      }
      const allowed = await this.unitScopeService.canAccessUnit(
        req.user as any, target.unitId, target.organizationId,
      );
      if (!allowed) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
    }
    return this.deviceStatusService.getStatusHistory(deviceId, limit || 20);
  }

  @Post()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Update device operational status' })
  async updateStatus(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateDeviceStatusDto,
  ) {
    // Authoritative scope: the client-supplied deviceId must resolve to a unit
    // inside the actor's own scope. Strictly unit-scoped roles (saha sorumlusu)
    // are confined to their assigned unit; cross-org is denied for every role.
    const target = await this.unitScopeService.resolveTargetScope('device', dto.deviceId);
    if (!target) {
      throw new NotFoundException('Cihaz bulunamadı');
    }
    const allowed = await this.unitScopeService.canAccessUnit(
      req.user as any, target.unitId, target.organizationId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    return this.deviceStatusService.updateStatus(
      req.user.id,
      dto.deviceId,
      dto.status,
      dto.notes,
    );
  }
}
