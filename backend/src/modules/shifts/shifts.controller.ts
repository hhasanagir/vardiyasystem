import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
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

@ApiTags('shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all shifts for organization' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'personnelType', required: false })
  async findAll(
    @Request() req: RequestWithUser,
    @Query('unitId') unitId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('personnelType') personnelType?: string,
  ) {
    if (!req.user.organizationId)
      throw new ForbiddenException('Kullanıcı bir organizasyona bağlı değil');
    return this.shiftsService.findAll(
      req.user.organizationId,
      unitId,
      deviceId,
      personnelType,
    );
  }

  @Get('live')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get live shift tracking data' })
  async getLiveShifts(@Request() req: RequestWithUser) {
    return this.shiftsService.findLiveShifts(req.user.id);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get a shift by ID' })
  async findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    if (!req.user.organizationId)
      throw new ForbiddenException('Kullanıcı bir organizasyona bağlı değil');
    return this.shiftsService.findOne(id, req.user.organizationId);
  }

  @Post()
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SHIFT_CREATED',
    entityType: 'shift',
    description: 'Vardiya oluşturuldu',
  })
  @ApiOperation({ summary: 'Create a new shift' })
  async create(@Body() dto: CreateShiftDto, @Request() req: RequestWithUser) {
    return this.shiftsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SHIFT_UPDATED',
    entityType: 'shift',
    description: 'Vardiya güncellendi',
  })
  @ApiOperation({ summary: 'Update a shift' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
    @Request() req: RequestWithUser,
  ) {
    if (!req.user.organizationId)
      throw new ForbiddenException('Kullanıcı bir organizasyona bağlı değil');
    return this.shiftsService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'SHIFT_DELETED',
    entityType: 'shift',
    description: 'Vardiya silindi',
  })
  @ApiOperation({ summary: 'Delete a shift' })
  async remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    if (!req.user.organizationId)
      throw new ForbiddenException('Kullanıcı bir organizasyona bağlı değil');
    await this.shiftsService.remove(id, req.user.organizationId);
  }
}
