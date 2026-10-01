import { Module } from '@nestjs/common';
import { DataSubjectService } from './data-subject.service';
import { DataSubjectController } from './data-subject.controller';

@Module({
  controllers: [DataSubjectController],
  providers: [DataSubjectService],
  exports: [DataSubjectService],
})
export class DataSubjectModule {}
