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
import { AreasService } from '../services/areas.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateAreaDto } from '../dto/create-area.dto';
import { UpdateAreaDto } from '../dto/update-area.dto';
import { AreaQueryDto } from '../dto/area-query.dto';

@ApiTags('areas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('areas')
export class AreasController {
  constructor(private readonly service: AreasService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create area' })
  create(@Body() dto: CreateAreaDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all areas' })
  findAll(@Query() query: AreaQueryDto) {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get area by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update area' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete area' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
