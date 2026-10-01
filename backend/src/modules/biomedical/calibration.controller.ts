import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CalibrationService } from './calibration.service';
import { CreateCalibrationDto } from './dto/calibration/create-calibration.dto';
import { UpdateCalibrationDto } from './dto/calibration/update-calibration.dto';
import { CompleteCalibrationDto } from './dto/calibration/complete-calibration.dto';

@ApiTags('Biomedical - Calibration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('biomedical/calibration')
export class CalibrationController {
  constructor(private readonly calibrationService: CalibrationService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all calibration records' })
  findAll(
    @Query('assetId') assetId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.calibrationService.findAll({ assetId, status, type });
  }

  @Get('due')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get upcoming/overdue calibrations' })
  getDue() {
    return this.calibrationService.getDue();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get calibration record by ID' })
  findById(@Param('id') id: string) {
    return this.calibrationService.findById(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create calibration record' })
  create(@Body() dto: CreateCalibrationDto) {
    return this.calibrationService.create(dto);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update calibration record' })
  update(@Param('id') id: string, @Body() dto: UpdateCalibrationDto) {
    return this.calibrationService.update(id, dto);
  }

  @Patch(':id/complete')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Mark calibration as complete' })
  complete(@Param('id') id: string, @Body() dto: CompleteCalibrationDto) {
    return this.calibrationService.complete(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Delete calibration record' })
  remove(@Param('id') id: string) {
    return this.calibrationService.remove(id);
  }
}
