import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SmartInventoryService } from './smart-inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';

interface RequestWithUser {
  user: { id: string };
}

@ApiTags('Smart Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class SmartInventoryController {
  constructor(private readonly service: SmartInventoryService) {}

  @Get('transfers')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List inventory transfers' })
  listTransfers(
    @Query('status') status?: string,
    @Query('catalogId') catalogId?: string,
  ) {
    return this.service.listTransfers(status, catalogId);
  }

  @Get('transfers/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get transfer by ID' })
  getTransfer(@Param('id') id: string) {
    return this.service.getTransfer(id);
  }

  @Post('transfers')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create inventory transfer' })
  createTransfer(
    @Body()
    body: {
      fromWarehouseId?: string;
      toWarehouseId?: string;
      fromUnitId?: string;
      toUnitId?: string;
      catalogId: string;
      quantity: number;
      batchNumber?: string;
      notes?: string;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.service.createTransfer({ ...body, requestedById: req.user.id });
  }

  @Post('transfers/:id/approve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Approve transfer' })
  approveTransfer(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.approveTransfer(id, req.user.id);
  }

  @Post('transfers/:id/complete')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Complete transfer' })
  completeTransfer(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.completeTransfer(id, req.user.id);
  }

  @Post('transfers/:id/cancel')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Cancel transfer' })
  cancelTransfer(@Param('id') id: string) {
    return this.service.cancelTransfer(id);
  }

  @Get('consumptions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List consumption records' })
  listConsumptions(
    @Query('catalogId') catalogId?: string,
    @Query('assetId') assetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listConsumptions(catalogId, assetId, from, to);
  }

  @Post('consumptions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create consumption record' })
  createConsumption(
    @Body()
    body: {
      catalogId: string;
      quantity: number;
      consumptionType: string;
      assetId?: string;
      examinationType?: string;
      departmentId?: string;
      unitId?: string;
      batchNumber?: string;
      cost?: number;
      notes?: string;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.service.createConsumption({
      ...body,
      recordedById: req.user.id,
    });
  }

  @Get('counts')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List inventory counts' })
  listCounts(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listCounts(warehouseId, status);
  }

  @Post('counts')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create inventory count' })
  createCount(
    @Body()
    body: {
      warehouseId?: string;
      catalogId: string;
      expectedQty: number;
      actualQty: number;
      unitCost?: number;
      notes?: string;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.service.createCount({ ...body, countedById: req.user.id });
  }

  @Post('counts/:id/approve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Approve inventory count' })
  approveCount(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.approveCount(id, req.user.id);
  }

  @Get('waste')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List waste records' })
  listWaste(
    @Query('wasteType') wasteType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listWaste(wasteType, from, to);
  }

  @Post('waste')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create waste record' })
  createWaste(
    @Body()
    body: {
      catalogId: string;
      quantity: number;
      wasteType: string;
      batchNumber?: string;
      reason: string;
      disposalMethod?: string;
      cost?: number;
      notes?: string;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.service.createWaste({ ...body, disposedById: req.user.id });
  }

  @Get('alerts')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List stock alerts' })
  listAlerts(
    @Query('isResolved') isResolved?: string,
    @Query('alertType') alertType?: string,
  ) {
    const resolved =
      isResolved !== undefined ? isResolved === 'true' : undefined;
    return this.service.listAlerts(resolved, alertType);
  }

  @Post('alerts')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create stock alert' })
  createAlert(
    @Body()
    body: {
      catalogId: string;
      alertType: string;
      threshold?: number;
      currentValue: number;
      message: string;
      severity?: string;
    },
  ) {
    return this.service.createAlert(body);
  }

  @Post('alerts/:id/resolve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Resolve stock alert' })
  resolveAlert(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.service.resolveAlert(id, req.user.id);
  }

  @Post('alerts/check')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Check stock levels and auto-create alerts' })
  checkStockLevels() {
    return this.service.checkStockLevels();
  }
}
