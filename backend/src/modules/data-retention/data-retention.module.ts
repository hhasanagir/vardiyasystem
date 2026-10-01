import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DataRetentionService } from './data-retention.service';
import { DataRetentionController } from './data-retention.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [DataRetentionController],
  providers: [DataRetentionService],
  exports: [DataRetentionService],
})
export class DataRetentionModule {}
