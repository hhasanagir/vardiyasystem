import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { PrismaService } from '../../prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitQueryDto } from './dto/unit-query.dto';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(
    private unitsService: UnitsService,
    private readonly unitScopeService: UnitScopeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all units' })
  async findAll(@Query() query: UnitQueryDto, @Request() req: RequestWithUser) {
    // Authoritative scope: saha sorumlusu is confined to the single assigned
    // unit (null unit fails closed). SUPERVISOR/others are org-scoped. The
    // client-supplied organizationId is never trusted for cross-org enumeration.
    const scope = await this.unitScopeService.resolveReadScope(req.user as any);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    if (scope.unitId) {
      const units = await this.unitsService.findAll({ organizationId: scope.organizationId ?? undefined });
      const owned = units.filter((u: any) => u.id === scope.unitId);
      return owned;
    }
    return this.unitsService.findAll({
      organizationId: scope.organizationId ?? query.organizationId,
      type: query.type,
    });
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get unit by ID' })
  async findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    await this.enforceUnitAccess(req.user, id);
    return this.unitsService.findOne(id);
  }

  @Get(':id/devices')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices for unit' })
  async getDevices(@Param('id') id: string, @Request() req: RequestWithUser) {
    await this.enforceUnitAccess(req.user, id);
    return this.unitsService.getDevices(id);
  }

  private async enforceUnitAccess(user: RequestWithUser['user'], unitId: string): Promise<void> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, organizationId: true },
    });
    if (!unit) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    const allowed = await this.unitScopeService.canAccessUnit(user as any, unit.id, unit.organizationId);
    if (!allowed) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
  }

  @Post()
  @Roles(MinRole.ADMIN)
  @Log({ action: 'UNIT_CREATED', entityType: 'unit', description: 'Birim oluşturuldu' })
  @ApiOperation({ summary: 'Create unit' })
  create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }

  @Put(':id')
  @Roles(MinRole.ADMIN)
  @Log({ action: 'UNIT_UPDATED', entityType: 'unit', description: 'Birim güncellendi' })
  @ApiOperation({ summary: 'Update unit' })
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }
}
