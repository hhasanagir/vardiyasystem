import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DataSubjectService } from './data-subject.service';

@Controller('data-subject')
@UseGuards(JwtAuthGuard)
export class DataSubjectController {
  constructor(private dataSubjectService: DataSubjectService) {}

  @Get('me/data')
  async getMyData(@Req() req: any) {
    return this.dataSubjectService.getMyData(req.user.id);
  }

  @Post('me/export')
  async requestExport(@Req() req: any, @Body('format') format: string) {
    return this.dataSubjectService.requestDataExport(req.user.id, format);
  }

  @Post('me/erasure')
  async requestErasure(@Req() req: any, @Body('reason') reason?: string) {
    return this.dataSubjectService.requestErasure(req.user.id, reason);
  }

  @Post('me/rectification')
  async requestRectification(
    @Req() req: any,
    @Body('field') field: string,
    @Body('currentValue') currentValue: string,
    @Body('proposedValue') proposedValue: string,
  ) {
    return this.dataSubjectService.requestRectification(
      req.user.id,
      field,
      currentValue,
      proposedValue,
    );
  }

  @Post('me/restriction')
  async requestRestriction(@Req() req: any, @Body('reason') reason?: string) {
    return this.dataSubjectService.requestRestriction(req.user.id, reason);
  }

  @Post('me/portability')
  async requestPortability(@Req() req: any) {
    return this.dataSubjectService.requestPortability(req.user.id);
  }

  @Get('me/requests')
  async getMyRequests(@Req() req: any) {
    return this.dataSubjectService.getMyRequests(req.user.id);
  }

  @Get('requests/:id')
  async getRequest(@Req() req: any, @Param('id') id: string) {
    return this.dataSubjectService.getRequest(id, req.user.id);
  }

  @Post('requests/:id/process')
  async processRequest(
    @Param('id') id: string,
    @Body('action') action: string,
    @Req() req: any,
    @Body('notes') notes?: string,
  ) {
    return this.dataSubjectService.processRequest(
      id,
      action,
      req.user.id,
      notes,
    );
  }

  @Post('requests/:id/erasure')
  async processErasure(@Param('id') id: string, @Req() req: any) {
    return this.dataSubjectService.processErasure(id, req.user.id);
  }

  @Get('statistics')
  async getStatistics(@Req() req: any) {
    return this.dataSubjectService.getRequestStatistics(
      req.user?.organizationId,
    );
  }
}
