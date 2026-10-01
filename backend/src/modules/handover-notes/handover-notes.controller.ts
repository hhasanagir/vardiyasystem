import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HandoverNotesService } from './handover-notes.service';
import { CreateHandoverNoteDto } from './dto/create-handover-note.dto';
import { UpdateHandoverNoteDto } from './dto/update-handover-note.dto';
import { HandoverNoteQueryDto } from './dto/handover-note-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';

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

@ApiTags('handover-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('handover-notes')
export class HandoverNotesController {
  constructor(private readonly handoverNotesService: HandoverNotesService) {}

  @Post()
  @Roles(MinRole.VIEWER)
  @Log({
    action: 'HANDOVER_NOTE_CREATED',
    entityType: 'handover_note',
    description: 'Teslimat notu oluşturuldu',
  })
  @ApiOperation({ summary: 'Create a handover note' })
  create(@Body() dto: CreateHandoverNoteDto, @Request() req: RequestWithUser) {
    return this.handoverNotesService.create(req.user.id, dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'List handover notes' })
  findAll(
    @Query() query: HandoverNoteQueryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.handoverNotesService.findAll(
      req.user.id,
      req.user.unitId,
      query,
    );
  }

  @Get('unread-count')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get unread handover note count' })
  getUnreadCount(@Request() req: RequestWithUser) {
    return this.handoverNotesService.getUnreadCount(
      req.user.id,
      req.user.unitId,
    );
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get a single handover note' })
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.handoverNotesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @Roles(MinRole.VIEWER)
  @Log({
    action: 'HANDOVER_NOTE_UPDATED',
    entityType: 'handover_note',
    description: 'Teslimat notu güncellendi',
  })
  @ApiOperation({ summary: 'Update a handover note (own notes only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHandoverNoteDto,
    @Request() req: RequestWithUser,
  ) {
    return this.handoverNotesService.update(id, req.user.id, dto);
  }

  @Patch(':id/read')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Mark a handover note as read' })
  markAsRead(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.handoverNotesService.markAsRead(id, req.user.id);
  }
}
