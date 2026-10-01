import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { StockAdjustDto } from './dto/stock-adjust.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('warehouses')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List warehouses' })
  listWarehouses(@Query('hospitalId') hospitalId?: string) {
    return this.inventoryService.listWarehouses({ hospitalId });
  }

  @Post('warehouses')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('inventory/stock')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get inventory stock levels' })
  getStock(
    @Query('warehouseId') warehouseId?: string,
    @Query('catalogId') catalogId?: string,
  ) {
    return this.inventoryService.getStock({ warehouseId, catalogId });
  }

  @Get('inventory/transactions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get inventory transactions' })
  getTransactions(
    @Query('warehouseId') warehouseId?: string,
    @Query('catalogId') catalogId?: string,
    @Query('type') type?: string,
  ) {
    return this.inventoryService.getTransactions({
      warehouseId,
      catalogId,
      type,
    });
  }

  @Post('inventory/adjust')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Adjust inventory stock' })
  adjustStock(@Body() dto: StockAdjustDto) {
    return this.inventoryService.adjustStock(dto);
  }
}
