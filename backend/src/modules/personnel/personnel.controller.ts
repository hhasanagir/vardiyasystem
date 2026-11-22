import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PersonnelService } from './personnel.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { UnitScope } from '../rbac/decorators/unit-scope.decorator';
import { UnitScopeGuard } from '../rbac/guards/unit-scope.guard';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { UpdatePersonnelDto } from './dto/update-personnel.dto';
import { PersonnelQueryDto } from './dto/personnel-query.dto';

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

@ApiTags('personnel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitScopeGuard)
@Controller('personnel')
export class PersonnelController {
  constructor(
    private personnelService: PersonnelService,
    private readonly unitScopeService: UnitScopeService,
  ) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all personnel' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  async findAll(@Query() query: PersonnelQueryDto, @Request() req?: RequestWithUser) {
    const user = req?.user;
    const scoped = user ? await this.unitScopeService.resolveReadScope(user as any) : { unitId: null, organizationId: null, denyAll: false };
    if (scoped.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    let unitId = query.unitId;
    if (scoped.unitId) {
      if (unitId) {
        const resolved = await this.personnelService.resolveUnit(unitId);
        if (!resolved || resolved.id !== scoped.unitId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
        unitId = resolved.id;
      } else {
        unitId = scoped.unitId;
      }
    }
    return this.personnelService.findAll({
      unitId,
      organizationId: scoped.organizationId ?? req?.user?.organizationId,
      isActive: query.isActive,
      search: query.search,
      month: query.month ? Number(query.month) : undefined,
      year: query.year ? Number(query.year) : undefined,
    });
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'personnel', idParam: 'id' })
  @ApiOperation({ summary: 'Get personnel by ID' })
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.personnelService.findOne(id, req.user.organizationId);
  }

  @Get(':id/workload')
  @Roles(MinRole.VIEWER)
  @UnitScope({ entityType: 'personnel', idParam: 'id' })
  @ApiOperation({ summary: 'Get personnel workload' })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  getWorkload(
    @Param('id') id: string,
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Request() req?: RequestWithUser,
  ) {
    return this.personnelService.getWorkload(id, month, year, req?.user.organizationId);
  }

  @Post()
  @Roles(MinRole.SUPERVISOR)
  @UnitScope({ unitBodyField: 'unitId' })
  @Log({ action: 'PERSONNEL_CREATED', entityType: 'personnel', description: 'Personel oluşturuldu' })
  @ApiOperation({ summary: 'Create personnel' })
  create(@Body() dto: CreatePersonnelDto, @Request() req: RequestWithUser) {
    return this.personnelService.create(dto, req.user.id, req.user.organizationId);
  }

  @Put(':id')
  @Roles(MinRole.SUPERVISOR)
  @UnitScope({ entityType: 'personnel', idParam: 'id', unitBodyField: 'unitId' })
  @Log({ action: 'PERSONNEL_UPDATED', entityType: 'personnel', description: 'Personel güncellendi' })
  @ApiOperation({ summary: 'Update personnel' })
  update(@Param('id') id: string, @Body() dto: UpdatePersonnelDto, @Request() req: RequestWithUser) {
    return this.personnelService.update(id, dto, req.user.id, req.user.organizationId);
  }

  @Delete(':id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @UnitScope({ entityType: 'personnel', idParam: 'id' })
  @Log({ action: 'PERSONNEL_DELETED', entityType: 'personnel', description: 'Personel silindi' })
  @ApiOperation({ summary: 'Delete personnel' })
  delete(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.personnelService.delete(id, req.user.id, req.user.organizationId);
  }
}
