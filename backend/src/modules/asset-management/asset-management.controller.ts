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

@ApiTags('Asset Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class AssetManagementController {
  constructor(private readonly assetService: AssetManagementService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all assets' })
  findAll(@Query() query: AssetQueryDto) {
    return this.assetService.findAll({
      category: query.category,
      status: query.status,
      unitId: query.unitId,
      departmentId: query.departmentId,
      hospitalId: query.hospitalId,
      supplierId: query.supplierId,
      isActive: query.isActive,
      search: query.search,
    });
  }

  @Get('dashboard')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get asset dashboard stats' })
  getDashboard() {
    return this.assetService.getDashboard();
  }

  @Get('warranty-status')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get warranty status breakdown' })
  getWarrantyStatus() {
    return this.assetService.getWarrantyStatus();
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get asset by ID' })
  findById(@Param('id') id: string) {
    return this.assetService.findById(id);
  }

  @Get(':id/detail')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get full asset detail with all relations' })
  getFullDetail(@Param('id') id: string) {
    return this.assetService.getFullDetail(id);
  }

  @Get(':id/qr')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Generate QR code for asset' })
  generateQR(@Param('id') id: string) {
    return this.assetService.generateQR(id);
  }

  @Get(':id/consumables')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get compatible consumables for asset' })
  getCompatibleConsumables(@Param('id') id: string) {
    return this.assetService.getDeviceCompatibleConsumables(id);
  }

  @Get(':id/documents')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get documents for asset' })
  getDocuments(@Param('id') id: string) {
    return this.assetService.getDocuments(id);
  }

  @Get(':id/movements')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get movement history for asset' })
  getMovements(@Param('id') id: string) {
    return this.assetService.getMovements(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create asset' })
  create(@Body() dto: CreateAssetDto) {
    return this.assetService.create(dto);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update asset' })
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetService.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Delete asset' })
  remove(@Param('id') id: string) {
    return this.assetService.remove(id);
  }
}
