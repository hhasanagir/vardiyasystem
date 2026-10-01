import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BreachNotificationService } from './breach-notification.service';

@Controller('breach-notification')
@UseGuards(JwtAuthGuard)
export class BreachNotificationController {
  constructor(private breachService: BreachNotificationService) {}

  @Post('record')
  async recordBreach(
    @Body()
    data: {
      breachType: string;
      severity: string;
      description: string;
      affectedEntities: string[];
      affectedRecords?: number;
    },
  ) {
    return this.breachService.recordBreach({ ...data, detectedBy: 'system' });
  }

  @Post(':id/contain')
  async containBreach(
    @Param('id') id: string,
    @Body('description') description: string,
  ) {
    return this.breachService.containBreach(id, description);
  }

  @Post(':id/notify-authority')
  async notifyAuthority(
    @Param('id') id: string,
    @Body()
    data: {
      notifiedTo: string;
      method: string;
      content: string;
    },
  ) {
    return this.breachService.notifyAuthority(id, data);
  }

  @Post(':id/notify-subjects')
  async notifySubjects(
    @Param('id') id: string,
    @Body()
    data: {
      notifiedTo: string;
      method: string;
      content: string;
    },
  ) {
    return this.breachService.notifySubjects(id, data);
  }

  @Post(':id/resolve')
  async resolveBreach(
    @Param('id') id: string,
    @Body('rootCause') rootCause: string,
    @Body('remediation') remediation: string,
  ) {
    return this.breachService.resolveBreach(id, rootCause, remediation);
  }

  @Get()
  async getBreaches(@Query('status') status?: string) {
    return this.breachService.getBreachRecords(status);
  }

  @Get('statistics')
  async getStatistics() {
    return this.breachService.getBreachStatistics();
  }
}
