import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BiomedicalService } from './biomedical.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@ApiTags('Biomedical Engineering')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('biomedical/maintenance')
export class BiomedicalController {
  constructor(private readonly biomedicalService: BiomedicalService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all maintenance records' })
  findAll(@Query('type') type?: string, @Query('status') status?: string) {
    return this.biomedicalService.findAll({ type, status });
  }

  @Get('asset/:assetId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get maintenance records by asset' })
  getByAsset(@Param('assetId') assetId: string) {
    return this.biomedicalService.getByAsset(assetId);
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get maintenance record by ID' })
  findById(@Param('id') id: string) {
    return this.biomedicalService.findById(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create maintenance record' })
  create(@Body() dto: CreateMaintenanceDto) {
    return this.biomedicalService.create(dto);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update maintenance record' })
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceDto) {
    return this.biomedicalService.update(id, dto);
  }
}
