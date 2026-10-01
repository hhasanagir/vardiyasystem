import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConsumablesService } from './consumables.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateConsumableDto } from './dto/create-consumable.dto';
import { UpdateConsumableDto } from './dto/update-consumable.dto';

@ApiTags('Consumables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consumables')
export class ConsumablesController {
  constructor(private readonly consumablesService: ConsumablesService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all consumables' })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.consumablesService.findAll({ category, search });
  }

  @Get('stock')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get aggregate stock overview' })
  getAllStock() {
    return this.consumablesService.getAllStock();
  }

  @Get('transactions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all recent transactions' })
  getAllTransactions() {
    return this.consumablesService.getAllTransactions();
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get consumable by ID' })
  findById(@Param('id') id: string) {
    return this.consumablesService.findById(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create consumable' })
  create(@Body() dto: CreateConsumableDto) {
    return this.consumablesService.create(dto);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update consumable' })
  update(@Param('id') id: string, @Body() dto: UpdateConsumableDto) {
    return this.consumablesService.update(id, dto);
  }

  @Get(':id/stock')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get consumable stock levels' })
  getStock(@Param('id') id: string) {
    return this.consumablesService.getStock(id);
  }

  @Get(':id/transactions')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get consumable transactions' })
  getTransactions(@Param('id') id: string) {
    return this.consumablesService.getTransactions(id);
  }
}
