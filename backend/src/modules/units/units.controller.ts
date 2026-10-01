import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitQueryDto } from './dto/unit-query.dto';

@ApiTags('units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all units' })
  findAll(@Query() query: UnitQueryDto) {
    return this.unitsService.findAll({
      organizationId: query.organizationId,
      type: query.type,
    });
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get unit by ID' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Get(':id/devices')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices for unit' })
  getDevices(@Param('id') id: string) {
    return this.unitsService.getDevices(id);
  }

  @Post()
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'UNIT_CREATED',
    entityType: 'unit',
    description: 'Birim oluşturuldu',
  })
  @ApiOperation({ summary: 'Create unit' })
  create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }

  @Put(':id')
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'UNIT_UPDATED',
    entityType: 'unit',
    description: 'Birim güncellendi',
  })
  @ApiOperation({ summary: 'Update unit' })
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }
}
