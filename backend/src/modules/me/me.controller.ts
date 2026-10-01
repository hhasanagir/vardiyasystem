import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { SchedulesService } from '../schedules/schedules.service';
import { MeExportService } from './me-export.service';
import { MeDayService } from './me-day.service';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId?: string;
    unitId?: string;
  };
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('me')
export class MeController {
  constructor(
    private schedulesService: SchedulesService,
    private meExportService: MeExportService,
    private meDayService: MeDayService,
  ) {}

  @Get('my-day')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'Get aggregated technician dashboard data (my-day)',
  })
  getMyDay(@Request() req: RequestWithUser) {
    return this.meDayService.getMyDay(req.user.email);
  }

  @Get('today')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: "Get today's shift for the current user" })
  getToday(@Request() req: RequestWithUser) {
    return this.meDayService.getToday(req.user.email);
  }

  @Get('week')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: "Get this week's schedule for the current user" })
  getWeek(@Request() req: RequestWithUser) {
    return this.meDayService.getWeek(req.user.email);
  }

  @Get('shifts')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get my shifts for a month' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getMyShifts(
    @Query('month') month: number,
    @Query('year') year: number,
    @Request() req: RequestWithUser,
  ) {
    return this.schedulesService.findMyShifts(req.user.email, month, year);
  }

  @Get('summary')
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'Get my shift summary (today, week, upcoming, totals)',
  })
  getMySummary(@Request() req: RequestWithUser) {
    return this.schedulesService.getMySummary(req.user.email);
  }

  @Get('shifts/export/ics')
  @Roles(MinRole.VIEWER)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vardiyalarim.ics"')
  @ApiOperation({
    summary:
      'Export my shifts as iCal file (Google Calendar, Outlook, Apple Calendar)',
  })
  async exportIcs(@Request() req: RequestWithUser) {
    return this.meExportService.exportIcs(req.user.email);
  }
}
