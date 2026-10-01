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
import { DirectoratesService } from '../services/directorates.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateDirectorateDto } from '../dto/create-directorate.dto';
import { UpdateDirectorateDto } from '../dto/update-directorate.dto';
import { DirectorateQueryDto } from '../dto/directorate-query.dto';

@ApiTags('directorates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('directorates')
export class DirectoratesController {
  constructor(private readonly service: DirectoratesService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create directorate' })
  create(@Body() dto: CreateDirectorateDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all directorates' })
  findAll(@Query() query: DirectorateQueryDto) {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get directorate by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update directorate' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectorateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete directorate' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
