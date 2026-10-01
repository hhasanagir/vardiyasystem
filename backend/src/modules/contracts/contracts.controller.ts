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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get all contracts' })
  findAll(@Query('type') type?: string, @Query('status') status?: string) {
    return this.contractsService.findAll({ type, status });
  }

  @Get('expiring')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get expiring contracts' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiring(@Query('days') days?: number) {
    return this.contractsService.getExpiring(days || 30);
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get contract by ID' })
  findById(@Param('id') id: string) {
    return this.contractsService.findById(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create contract' })
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update contract' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }
}
