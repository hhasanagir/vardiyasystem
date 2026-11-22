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
  NotFoundException,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HospitalsService } from '../services/hospitals.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { CreateHospitalDto } from '../dto/create-hospital.dto';
import { UpdateHospitalDto } from '../dto/update-hospital.dto';
import { HospitalQueryDto } from '../dto/hospital-query.dto';

interface HospitalScopeUser {
  id?: string;
  role?: string | null;
  organizationId?: string | null;
  rbacRoles?: Array<{
    roleName?: string;
    organizationId?: string | null;
    hospitalGroupId?: string | null;
    hospitalId?: string | null;
  }>;
}

interface RequestWithHospitalScope {
  user?: HospitalScopeUser;
}

@ApiTags('hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly service: HospitalsService) {}

  @Post()
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Create hospital' })
  create(@Body() dto: CreateHospitalDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all hospitals scoped to the caller tenant' })
  findAll(@Query() query: HospitalQueryDto, @Request() req: RequestWithHospitalScope) {
    return this.service.findAllScoped(req.user);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get hospital by ID (tenant scoped)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: RequestWithHospitalScope) {
    const hospital = await this.service.findOneScoped(id, req.user);
    if (!hospital) {
      throw new NotFoundException('Hastane bulunamadı');
    }
    return hospital;
  }

  @Patch(':id')
  @Roles(MinRole.ADMIN)
  @ApiOperation({ summary: 'Update hospital' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHospitalDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete hospital' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
