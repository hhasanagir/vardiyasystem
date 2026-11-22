import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { ScheduleAutoGeneratorService } from './schedule-auto-generator.service';
import { SchedulesWorkflowService } from './schedules-workflow.service';
import { SchedulesExportService } from './schedules-export.service';
import { ScheduleAlertService } from './schedule-alert.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesDDDController } from './schedules-ddd.controller';
import { UnitsModule } from '../units/units.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillModule } from '../skills/skill.module';
import { PrismaScheduleRepository } from './infrastructure/prisma-schedule.repository';
import { ScheduleValidationService } from './schedule-validation.service';
import { ScheduleApplicationService } from './schedule-application.service';
import { ScheduleAccessGuard } from './guards/schedule-access.guard';
import { ScheduleJobQueueModule } from './job-queue/schedule-job-queue.module';
import { ScheduleJobStatusService } from './job-queue/schedule-job-status.service';
import { ScheduleDryRunService } from './schedule-dry-run.service';
import { PersonnelAvailabilityService } from './services/personnel-availability.service';
import { PersonnelAvailabilityController } from './personnel-availability.controller';
import { ScheduleCoverageService } from './services/schedule-coverage.service';

@Module({
  imports: [UnitsModule, WebsocketModule, NotificationsModule, SkillModule, ScheduleJobQueueModule],
  controllers: [SchedulesController, SchedulesDDDController, PersonnelAvailabilityController],
  providers: [
    SchedulesService,
    ScheduleAutoGeneratorService,
    SchedulesWorkflowService,
    SchedulesExportService,
    ScheduleAlertService,
    PrismaScheduleRepository,
    ScheduleValidationService,
    ScheduleApplicationService,
    ScheduleAccessGuard,
    ScheduleJobStatusService,
    ScheduleDryRunService,
    PersonnelAvailabilityService,
    ScheduleCoverageService,
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
    ScheduleCoverageService,
  ],
})
export class SchedulesModule {}
