import { Module } from '@nestjs/common';
import { ProcessingActivityService } from './processing-activity.service';
import { ProcessingActivityController } from './processing-activity.controller';

@Module({
  controllers: [ProcessingActivityController],
  providers: [ProcessingActivityService],
  exports: [ProcessingActivityService],
})
export class ProcessingActivityModule {}
