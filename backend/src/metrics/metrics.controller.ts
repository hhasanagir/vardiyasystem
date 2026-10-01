import { Controller, Get, Res, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { SkipCsrf } from '../modules/auth/csrf';

@ApiTags('metrics')
@SkipCsrf()
@Controller()
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async getMetrics(@Res() res: Response) {
    const data = await this.metrics.getMetrics();
    res.set('Content-Type', this.metrics.getContentType());
    res.end(data);
  }
}
