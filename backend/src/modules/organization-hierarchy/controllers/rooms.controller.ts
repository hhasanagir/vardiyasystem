import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from '../services/rooms.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateRoomDto } from '../dto/create-room.dto';
import { UpdateRoomDto } from '../dto/update-room.dto';
import { RoomQueryDto } from '../dto/room-query.dto';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly service: RoomsService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create room' })
  create(@Body() dto: CreateRoomDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all rooms' })
  findAll(@Query() query: RoomQueryDto) {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get room by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update room' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete room' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
