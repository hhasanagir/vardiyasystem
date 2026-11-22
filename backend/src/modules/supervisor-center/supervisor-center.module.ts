import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SupervisorCenterController } from './supervisor-center.controller';
import { SupervisorCenterService } from './supervisor-center.service';

@Module({
  imports: [PrismaModule, SchedulesModule],
  controllers: [SupervisorCenterController],
  providers: [SupervisorCenterService],
  exports: [SupervisorCenterService],
})
export class SupervisorCenterModule {}
