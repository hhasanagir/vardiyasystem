import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeExportService } from './me-export.service';
import { MeDayService } from './me-day.service';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [SchedulesModule],
  controllers: [MeController],
  providers: [MeExportService, MeDayService],
})
export class MeModule {}
