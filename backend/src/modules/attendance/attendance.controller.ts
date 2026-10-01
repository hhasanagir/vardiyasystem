import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

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

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get('today')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get today attendance status for current user' })
  getToday(@Request() req: RequestWithUser) {
    return this.attendanceService.getTodayStatus(req.user.id);
  }

  @Get('history')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get attendance history for current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(@Request() req: RequestWithUser, @Query('limit') limit?: number) {
    return this.attendanceService.getHistory(req.user.id, limit || 30);
  }

  @Get('stats')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get monthly attendance stats' })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getStats(
    @Request() req: RequestWithUser,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.attendanceService.getMonthlyStats(req.user.id, month, year);
  }

  @Post('clock-in')
  @Roles(MinRole.VIEWER)
  @Log({
    action: 'CLOCK_IN',
    entityType: 'attendance',
    description: 'Mesai başlangıcı',
  })
  @ApiOperation({ summary: 'Clock in for today shift' })
  clockIn(
    @Request() req: RequestWithUser,
    @Body() dto: ClockInDto,
    @Req() expressReq: ExpressRequest,
  ) {
    const ip = expressReq.ip || expressReq.socket?.remoteAddress;
    return this.attendanceService.clockIn(req.user.id, dto, ip);
  }

  @Post('clock-out')
  @Roles(MinRole.VIEWER)
  @Log({
    action: 'CLOCK_OUT',
    entityType: 'attendance',
    description: 'Mesai bitişi',
  })
  @ApiOperation({ summary: 'Clock out from today shift' })
  clockOut(@Request() req: RequestWithUser, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(req.user.id, dto);
  }
}
