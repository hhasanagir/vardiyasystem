import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { ScheduleAutoGeneratorService } from './schedule-auto-generator.service';
import { SchedulesWorkflowService } from './schedules-workflow.service';
import { SchedulesExportService } from './schedules-export.service';
import { ScheduleAlertService } from './schedule-alert.service';
import { SchedulesController } from './schedules.controller';
import { UnitsModule } from '../units/units.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillModule } from '../skills/skill.module';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { ScheduleValidationService } from './schedule-validation.service';
import { ScheduleApplicationService } from './schedule-application.service';

@Module({
  imports: [UnitsModule, WebsocketModule, NotificationsModule, SkillModule],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    ScheduleAutoGeneratorService,
    SchedulesWorkflowService,
    SchedulesExportService,
    ScheduleAlertService,
    PrismaScheduleRepository,
    ScheduleValidationService,
    ScheduleApplicationService,
  ],
  exports: [
    SchedulesService,
    ScheduleAutoGeneratorService,
    SchedulesWorkflowService,
    SchedulesExportService,
    ScheduleAlertService,
    PrismaScheduleRepository,
    ScheduleValidationService,
    ScheduleApplicationService,
  ],
})
export class SchedulesModule {}
