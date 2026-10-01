import {
  Controller,
  Get,
  Post,
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
import { HolidaysService } from './holidays.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';

@ApiTags('holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all holidays' })
  findAll(@Query() query: HolidayQueryDto) {
    return this.holidaysService.findAll(query.year);
  }

  @Get('range')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get holidays by date range' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.holidaysService.findByDateRange(startDate, endDate);
  }

  @Get(':date/check')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Check if date is holiday' })
  isHoliday(@Param('date') date: string) {
    return this.holidaysService.isHoliday(date);
  }

  @Post()
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'HOLIDAY_CREATED',
    entityType: 'holiday',
    description: 'Tatil günü oluşturuldu',
  })
  @ApiOperation({ summary: 'Create holiday' })
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Post('seed-2026')
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'HOLIDAYS_SEEDED',
    entityType: 'holiday',
    description: '2026 tatil günleri yüklendi',
  })
  @ApiOperation({ summary: 'Seed 2026 Turkish holidays' })
  seed2026() {
    return this.holidaysService.seed2026Holidays();
  }
}
