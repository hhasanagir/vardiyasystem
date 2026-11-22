import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QualityService } from './quality.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { CreateQualityRecordDto } from './dto/create-quality-record.dto';
import { CreateActionDto } from './dto/create-action.dto';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('Quality Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quality')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Get('records')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List quality records' })
  listRecords(
    @Request() req: RequestWithUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.qualityService.listRecords({ type, status, severity }, req.user as any);
  }

  @Post('records')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create quality record' })
  createRecord(@Body() dto: CreateQualityRecordDto, @Request() req: RequestWithUser) {
    return this.qualityService.createRecord(dto, req.user as any);
  }

  @Get('records/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get quality record by ID' })
  getRecord(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.qualityService.getRecord(id, req.user as any);
  }

  @Patch('records/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update quality record' })
  updateRecord(@Param('id') id: string, @Body() dto: CreateQualityRecordDto, @Request() req: RequestWithUser) {
    return this.qualityService.updateRecord(id, dto, req.user as any);
  }

  @Post('records/:id/actions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Add action to quality record' })
  addAction(@Param('id') id: string, @Body() dto: CreateActionDto, @Request() req: RequestWithUser) {
    return this.qualityService.addAction(id, dto, req.user as any);
  }

  @Post('records/:id/approve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @Log({ action: 'QUALITY_RECORD_APPROVED', entityType: 'quality_record', description: 'Kalite kaydı onaylandı' })
  @ApiOperation({ summary: 'Approve/close quality record' })
  approveRecord(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.qualityService.approveRecord(id, req.user.id);
  }

  @Get('records/:id/actions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List actions for a quality record' })
  listActions(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.qualityService.listActions(id, req.user as any);
  }

  @Patch('actions/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update a quality action' })
  updateAction(@Param('id') id: string, @Body() dto: CreateActionDto, @Request() req: RequestWithUser) {
    return this.qualityService.updateAction(id, dto, req.user as any);
  }

  @Delete('actions/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Delete a quality action' })
  deleteAction(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.qualityService.deleteAction(id, req.user as any);
  }
}
