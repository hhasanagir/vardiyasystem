import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RadiationSafetyService } from './radiation-safety.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateDosimeterDto } from './dto/create-dosimeter.dto';
import { CreateMeasurementDto } from './dto/create-measurement.dto';

@ApiTags('Radiation Safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('radiation')
export class RadiationSafetyController {
  constructor(private readonly radiationService: RadiationSafetyService) {}

  @Get('dosimeters')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List radiation dosimeters' })
  listDosimeters(@Query('status') status?: string) {
    return this.radiationService.listDosimeters({ status });
  }

  @Post('dosimeters')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create radiation dosimeter' })
  createDosimeter(@Body() dto: CreateDosimeterDto) {
    return this.radiationService.createDosimeter(dto);
  }

  @Get('measurements')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List radiation measurements' })
  listMeasurements(
    @Query('dosimeterId') dosimeterId?: string,
    @Query('type') type?: string,
    @Query('result') result?: string,
  ) {
    return this.radiationService.listMeasurements({
      dosimeterId,
      type,
      result,
    });
  }

  @Post('measurements')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create radiation measurement' })
  createMeasurement(@Body() dto: CreateMeasurementDto) {
    return this.radiationService.createMeasurement(dto);
  }

  @Get('areas')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List radiation areas' })
  listAreas(
    @Query('type') type?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.radiationService.listAreas({ type, departmentId });
  }
}
