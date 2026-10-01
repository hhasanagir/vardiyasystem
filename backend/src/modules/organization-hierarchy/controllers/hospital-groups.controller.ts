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
import { HospitalGroupsService } from '../services/hospital-groups.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateHospitalGroupDto } from '../dto/create-hospital-group.dto';
import { UpdateHospitalGroupDto } from '../dto/update-hospital-group.dto';
import { HospitalGroupQueryDto } from '../dto/hospital-group-query.dto';

@ApiTags('hospital-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospital-groups')
export class HospitalGroupsController {
  constructor(private readonly service: HospitalGroupsService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create hospital group' })
  create(@Body() dto: CreateHospitalGroupDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all hospital groups' })
  findAll(@Query() query: HospitalGroupQueryDto) {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get hospital group by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update hospital group' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHospitalGroupDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete hospital group' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
