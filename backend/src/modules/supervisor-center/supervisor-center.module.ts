import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { SupervisorCenterController } from './supervisor-center.controller';
import { SupervisorCenterService } from './supervisor-center.service';

@Module({
  imports: [PrismaModule],
  controllers: [SupervisorCenterController],
  providers: [SupervisorCenterService],
  exports: [SupervisorCenterService],
})
export class SupervisorCenterModule {}
