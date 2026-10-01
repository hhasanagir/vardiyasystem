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
import { AssignmentSlotsService } from '../services/assignment-slots.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateAssignmentSlotDto } from '../dto/create-assignment-slot.dto';
import { UpdateAssignmentSlotDto } from '../dto/update-assignment-slot.dto';
import { AssignmentSlotQueryDto } from '../dto/assignment-slot-query.dto';

@ApiTags('assignment-slots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assignment-slots')
export class AssignmentSlotsController {
  constructor(private readonly service: AssignmentSlotsService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create assignment slot' })
  create(@Body() dto: CreateAssignmentSlotDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all assignment slots' })
  findAll(@Query() query: AssignmentSlotQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get assignment slot by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update assignment slot' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentSlotDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete assignment slot' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
