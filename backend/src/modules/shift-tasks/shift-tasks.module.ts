import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { ShiftTasksController } from './shift-tasks.controller';
import { ShiftTasksService } from './shift-tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShiftTasksController],
  providers: [ShiftTasksService],
  exports: [ShiftTasksService],
})
export class ShiftTasksModule {}
