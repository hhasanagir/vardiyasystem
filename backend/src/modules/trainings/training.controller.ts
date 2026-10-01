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
  Request,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { TrainingService } from './training.service';
import { TrainingExportService } from './training-export.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { AssignTrainingDto } from './dto/assign-training.dto';
import { TrainingQueryDto } from './dto/training-query.dto';

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

@ApiTags('trainings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainings')
export class TrainingController {
  constructor(
    private trainingService: TrainingService,
    private exportService: TrainingExportService,
  ) {}

  @Post()
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'TRAINING_CREATED',
    entityType: 'training',
    description: 'Eğitim oluşturuldu',
  })
  @ApiOperation({ summary: 'Create a new training' })
  create(@Body() dto: CreateTrainingDto) {
    return this.trainingService.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all trainings' })
  findAll(@Query() query: TrainingQueryDto) {
    return this.trainingService.findAll(query);
  }

  @Get('risk-summary')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get certification risk summary for dashboard' })
  getRiskSummary() {
    return this.trainingService.getRiskSummary();
  }

  @Get('expiring')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get expiring certifications' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiring(@Query('days') days?: number) {
    return this.trainingService.getExpiringCertifications(days || 30);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get training by id' })
  findOne(@Param('id') id: string) {
    return this.trainingService.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'TRAINING_UPDATED',
    entityType: 'training',
    description: 'Eğitim güncellendi',
  })
  @ApiOperation({ summary: 'Update training' })
  update(@Param('id') id: string, @Body() dto: UpdateTrainingDto) {
    return this.trainingService.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'TRAINING_DELETED',
    entityType: 'training',
    description: 'Eğitim silindi',
  })
  @ApiOperation({ summary: 'Delete training' })
  delete(@Param('id') id: string) {
    return this.trainingService.delete(id);
  }

  @Post('personnel/:personnelId')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'TRAINING_ASSIGNED',
    entityType: 'personnel_training',
    description: 'Eğitimin personele atanması',
  })
  @ApiOperation({ summary: 'Assign training to personnel' })
  assign(
    @Param('personnelId') personnelId: string,
    @Body() dto: AssignTrainingDto,
  ) {
    return this.trainingService.assign(personnelId, dto);
  }

  @Get('personnel/:personnelId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get personnel trainings' })
  getPersonnelTrainings(@Param('personnelId') personnelId: string) {
    return this.trainingService.getPersonnelTrainings(personnelId);
  }

  @Patch('personnel-training/:id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'TRAINING_ASSIGNMENT_UPDATED',
    entityType: 'personnel_training',
    description: 'Eğitim ataması güncellendi',
  })
  @ApiOperation({ summary: 'Update personnel training assignment' })
  updateAssignment(
    @Param('id') id: string,
    @Body() dto: Partial<AssignTrainingDto>,
  ) {
    return this.trainingService.updateAssignment(id, dto);
  }

  @Delete('personnel-training/:id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'TRAINING_ASSIGNMENT_REMOVED',
    entityType: 'personnel_training',
    description: 'Eğitim ataması kaldırıldı',
  })
  @ApiOperation({ summary: 'Remove personnel training assignment' })
  removeAssignment(@Param('id') id: string) {
    return this.trainingService.removeAssignment(id);
  }

  @Get('export/excel')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Export trainings as Excel' })
  @ApiQuery({ name: 'status', required: false })
  async exportExcel(@Query() query: TrainingQueryDto, @Res() res: Response) {
    const data = await this.trainingService.findAll(query);
    const buf = await this.exportService.exportExcel(data);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sertifikalar.xlsx"',
      'Content-Length': buf.byteLength,
    });
    res.send(Buffer.from(buf));
  }

  @Get('export/pdf')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Export trainings as PDF' })
  @ApiQuery({ name: 'status', required: false })
  async exportPdf(@Query() query: TrainingQueryDto, @Res() res: Response) {
    const data = await this.trainingService.findAll(query);
    const buf = await this.exportService.exportPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="sertifikalar.pdf"',
      'Content-Length': buf.length,
    });
    res.send(buf);
  }
}
