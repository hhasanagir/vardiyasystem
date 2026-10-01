import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { DataRetentionService } from './data-retention.service';

@Controller('data-retention')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MinRole.SYSTEM_ADMIN)
export class DataRetentionController {
  constructor(private dataRetentionService: DataRetentionService) {}

  @Get('policies')
  async getPolicies() {
    return this.dataRetentionService.getPolicies();
  }

  @Post('policies')
  async upsertPolicy(
    @Body()
    data: {
      entityType: string;
      retentionDays: number;
      archiveAfterDays?: number;
      purgeAfterDays?: number;
      description?: string;
    },
  ) {
    return this.dataRetentionService.upsertPolicy(data);
  }

  @Post('run')
  async runRetention() {
    await this.dataRetentionService.runAllRetention();
    return { message: 'Retention job triggered' };
  }

  @Get('jobs')
  async getJobHistory(@Query('limit') limit?: string) {
    return this.dataRetentionService.getJobHistory(
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
