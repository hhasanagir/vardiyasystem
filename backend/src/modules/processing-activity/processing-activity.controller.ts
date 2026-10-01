import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProcessingActivityService } from './processing-activity.service';

@Controller('processing-activities')
@UseGuards(JwtAuthGuard)
export class ProcessingActivityController {
  constructor(private service: ProcessingActivityService) {}

  @Post()
  async create(@Body() data: any) {
    return this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.service.update(id, data);
  }

  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly !== 'false');
  }

  @Get('register')
  async getRegister() {
    return this.service.getRegister();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post(':id/dpia')
  async conductDpia(@Param('id') id: string, @Body() data: any) {
    return this.service.conductDpia(id, data);
  }

  @Post('dpia/:dpiaId/approve')
  async approveDpia(
    @Param('dpiaId') dpiaId: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    return this.service.approveDpia(dpiaId, approvedBy);
  }

  @Get('dpia/list')
  async getDpias(@Query('status') status?: string) {
    return this.service.getDpias(status);
  }

  @Get('statistics/all')
  async getStatistics() {
    return this.service.getStatistics();
  }
}
