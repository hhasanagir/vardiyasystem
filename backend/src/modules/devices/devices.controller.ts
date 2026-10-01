import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all devices' })
  @ApiQuery({ name: 'unit', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  findAll(@Query('unit') unit?: string, @Query('isActive') isActive?: string) {
    const params: { unit?: string; isActive?: boolean } = {};
    if (unit) params.unit = unit;
    if (isActive !== undefined) params.isActive = isActive === 'true';
    return this.devicesService.findAll(params);
  }

  @Get('unit/:unitCode')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices by unit type code' })
  findByUnitCode(@Param('unitCode') unitCode: string) {
    return this.devicesService.findByUnitCode(unitCode);
  }
}
