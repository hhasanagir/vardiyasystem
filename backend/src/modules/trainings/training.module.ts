import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingExportService } from './training-export.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingExportService],
  exports: [TrainingService, TrainingExportService],
})
export class TrainingModule {}
