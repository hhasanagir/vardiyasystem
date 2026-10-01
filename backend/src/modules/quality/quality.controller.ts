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
import { QualityService } from './quality.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateQualityRecordDto } from './dto/create-quality-record.dto';
import { CreateActionDto } from './dto/create-action.dto';

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
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.qualityService.listRecords({ type, status, severity });
  }

  @Post('records')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create quality record' })
  createRecord(@Body() dto: CreateQualityRecordDto) {
    return this.qualityService.createRecord(dto);
  }

  @Get('records/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get quality record by ID' })
  getRecord(@Param('id') id: string) {
    return this.qualityService.getRecord(id);
  }

  @Patch('records/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update quality record' })
  updateRecord(@Param('id') id: string, @Body() dto: CreateQualityRecordDto) {
    return this.qualityService.updateRecord(id, dto);
  }

  @Post('records/:id/actions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Add action to quality record' })
  addAction(@Param('id') id: string, @Body() dto: CreateActionDto) {
    return this.qualityService.addAction(id, dto);
  }

  @Post('records/:id/approve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Approve/close quality record' })
  approveRecord(
    @Param('id') id: string,
    @Body('approvedById') approvedById: string,
  ) {
    return this.qualityService.approveRecord(id, approvedById);
  }

  @Get('records/:id/actions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List actions for a quality record' })
  listActions(@Param('id') id: string) {
    return this.qualityService.listActions(id);
  }

  @Patch('actions/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update a quality action' })
  updateAction(@Param('id') id: string, @Body() dto: CreateActionDto) {
    return this.qualityService.updateAction(id, dto);
  }

  @Delete('actions/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Delete a quality action' })
  deleteAction(@Param('id') id: string) {
    return this.qualityService.deleteAction(id);
  }
}
