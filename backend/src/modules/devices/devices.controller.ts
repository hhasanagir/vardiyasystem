import { Controller, Get, Param, Query, Request, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { PrismaService } from '../../prisma.service';
import { isValidUnitType } from '../../models/unit-type';

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

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  constructor(
    private devicesService: DevicesService,
    private readonly unitScopeService: UnitScopeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all devices' })
  @ApiQuery({ name: 'unit', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  async findAll(
    @Query('unit') unit?: string,
    @Query('isActive') isActive?: string,
    @Request() req?: RequestWithUser,
  ) {
    const scope = await this.unitScopeService.resolveReadScope(req?.user as any);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime eriÅŸim yetkiniz yok');
    }
    const params: { unit?: string; isActive?: boolean; organizationId?: string; scopedUnitId?: string } = {};
    if (scope.organizationId) params.organizationId = scope.organizationId;
    if (scope.unitId) params.scopedUnitId = scope.unitId;
    if (unit) params.unit = unit;
    if (isActive !== undefined) params.isActive = isActive === 'true';
    return this.devicesService.findAll(params);
  }

  @Get('unit/:unitCode')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get devices by unit type code' })
  async findByUnitCode(@Param('unitCode') unitCode: string, @Request() req: RequestWithUser) {
    await this.enforceUnitAccess(req?.user, unitCode, req?.user?.organizationId);
    return this.devicesService.findByUnitCode(unitCode);
  }

  private async enforceUnitAccess(
    user: RequestWithUser['user'] | undefined,
    unitParam: string,
    _userOrg?: string,
  ): Promise<void> {
    if (!user) return;
    const unit = await this.prisma.unit.findFirst({
      where: {
        OR: [
          { id: unitParam },
          { code: unitParam },
          // The type column is an enum: a UUID or free-text param would make
          // Prisma reject the whole query (500), so it is only compared when
          // the param is a real UnitType member.
          ...(isValidUnitType(unitParam) ? [{ type: unitParam }] : []),
        ],
      },
      select: { id: true, organizationId: true },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadÄ±: ${unitParam}`);
    }
    const allowed = await this.unitScopeService.canAccessUnit(user as any, unit.id, unit.organizationId);
    if (!allowed) {
      throw new ForbiddenException('Bu birime eriÅŸim yetkiniz yok');
    }
  }
}