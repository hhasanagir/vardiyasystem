import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssetManagementService } from './asset-management.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';

interface RequestWithUser {
  user: { id: string; email: string; name: string; role: string; organizationId?: string; unitId?: string };
}

@ApiTags('Asset Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class AssetManagementController {
  constructor(private readonly assetService: AssetManagementService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all assets' })
  findAll(@Query() query: AssetQueryDto, @Request() req: RequestWithUser) {
    return this.assetService.findAll({
      category: query.category,
      status: query.status,
      unitId: query.unitId,
      departmentId: query.departmentId,
      hospitalId: query.hospitalId,
      supplierId: query.supplierId,
      isActive: query.isActive,
      search: query.search,
    }, req.user as any);
  }

  @Get('dashboard')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get asset dashboard stats' })
  getDashboard(@Request() req: RequestWithUser) {
    return this.assetService.getDashboard(req.user as any);
  }

  @Get('warranty-status')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get warranty status breakdown' })
  getWarrantyStatus(@Request() req: RequestWithUser) {
    return this.assetService.getWarrantyStatus(req.user as any);
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get asset by ID' })
  findById(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.findById(id, req.user as any);
  }

  @Get(':id/detail')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get full asset detail with all relations' })
  getFullDetail(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.getFullDetail(id, req.user as any);
  }

  @Get(':id/qr')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Generate QR code for asset' })
  generateQR(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.generateQR(id, req.user as any);
  }

  @Get(':id/consumables')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get compatible consumables for asset' })
  getCompatibleConsumables(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.getDeviceCompatibleConsumables(id, req.user as any);
  }

  @Get(':id/documents')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get documents for asset' })
  getDocuments(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.getDocuments(id, req.user as any);
  }

  @Get(':id/movements')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get movement history for asset' })
  getMovements(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.getMovements(id, req.user as any);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create asset' })
  create(@Body() dto: CreateAssetDto, @Request() req: RequestWithUser) {
    return this.assetService.create(dto, req.user as any);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update asset' })
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @Request() req: RequestWithUser) {
    return this.assetService.update(id, dto, req.user as any);
  }

  @Delete(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Delete asset' })
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.assetService.remove(id, req.user as any);
  }
}
