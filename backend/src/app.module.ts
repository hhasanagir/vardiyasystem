import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PrismaModule } from './prisma.module';
import { SeedService } from './seed.service';
import { AuthModule } from './modules/auth/auth.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { PersonnelModule } from './modules/personnel/personnel.module';
import { UnitsModule } from './modules/units/units.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { HolidaysModule } from './modules/holidays/holidays.module';
import { SwapRequestsModule } from './modules/swap-requests/swap-requests.module';
import { DevicesModule } from './modules/devices/devices.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { HealthModule } from './modules/health/health.module';
import { InsightsModule } from './modules/insights/insights.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { MeModule } from './modules/me/me.module';
import { HandoverNotesModule } from './modules/handover-notes/handover-notes.module';
import { DeviceIncidentsModule } from './modules/device-incidents/device-incidents.module';
import { PushSubscriptionsModule } from './modules/push-subscriptions/push-subscriptions.module';
import { PushTokensModule } from './modules/push-tokens/push-tokens.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ShiftTasksModule } from './modules/shift-tasks/shift-tasks.module';
import { DeviceStatusModule } from './modules/device-status/device-status.module';
import { SkillModule } from './modules/skills/skill.module';
import { TrainingModule } from './modules/trainings/training.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SupervisorModule } from './modules/supervisor/supervisor.module';
import { CommandCenterModule } from './modules/command-center/command-center.module';
import { VaultModule } from './vault/vault.module';
import { AlertingModule } from './alerting/alerting.module';
import { CorrelationModule } from './correlation/correlation.module';
import { MetricsModule } from './metrics/metrics.module';
import { EventBusModule } from './events/event-bus.module';
import { RbacModule } from './modules/rbac';
import { RbacSeedService } from './modules/rbac/seeds/rbac-seed.service';
import { CsrfGuard } from './modules/auth/csrf';
import { InactivityInterceptor } from './interceptors/inactivity.interceptor';
import { TenantContextInterceptor } from './infrastructure/tenant-context.interceptor';
import { CorrelationInterceptor } from './correlation/correlation.interceptor';
import { DistributedLockModule } from './infrastructure/distributed-lock.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { ConsentModule } from './modules/consent/consent.module';
import { DataSubjectModule } from './modules/data-subject/data-subject.module';
import { DataRetentionModule } from './modules/data-retention/data-retention.module';
import { EmergencyAccessModule } from './modules/emergency-access/emergency-access.module';
import { BreachNotificationModule } from './modules/breach-notification/breach-notification.module';
import { DataClassificationModule } from './modules/data-classification/data-classification.module';
import { ProcessingActivityModule } from './modules/processing-activity/processing-activity.module';
import { HierarchyModule } from './modules/hierarchy/hierarchy.module';
import { OrganizationHierarchyModule } from './modules/organization-hierarchy/organization-hierarchy.module';
import { DutyRosterModule } from './modules/duty-roster/duty-roster.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AssetManagementModule } from './modules/asset-management/asset-management.module';
import { BiomedicalModule } from './modules/biomedical/biomedical.module';
import { ConsumablesModule } from './modules/consumables/consumables.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { QualityModule } from './modules/quality/quality.module';
import { RadiationSafetyModule } from './modules/radiation-safety/radiation-safety.module';
import { DeviceLifecycleModule } from './modules/device-lifecycle/device-lifecycle.module';
import { SmartInventoryModule } from './modules/smart-inventory/smart-inventory.module';
import { SupervisorCenterModule } from './modules/supervisor-center/supervisor-center.module';
import { PersonnelGroupsModule } from './modules/personnel-groups/personnel-groups.module';
import configuration from './config/configuration';
import rateLimitConfig from './config/rate-limit.config';
import { validationSchema } from './config/env.config';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const storage = redisUrl
          ? new ThrottlerStorageRedisService(new Redis(redisUrl))
          : undefined;
        return {
          throttlers: [
            {
              ttl: seconds(60),
              limit: config.get<number>('GLOBAL_THROTTLE_LIMIT', 200),
            },
          ],
          storage,
        };
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration, rateLimitConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    AuthModule,
    SchedulesModule,
    PersonnelModule,
    UnitsModule,
    AuditLogModule,
    HolidaysModule,
    SwapRequestsModule,
    DevicesModule,
    WebsocketModule,
    HealthModule,
    InsightsModule,
    NotificationsModule,
    ShiftsModule,
    MeModule,
    HandoverNotesModule,
    DeviceIncidentsModule,
    AttendanceModule,
    AnalyticsModule,
    ShiftTasksModule,
    DeviceStatusModule,
    PushSubscriptionsModule,
    PushTokensModule,
    SkillModule,
    TrainingModule,
    RecommendationsModule,
    SupervisorModule,
    CommandCenterModule,
    VaultModule,
    AlertingModule,
    CorrelationModule,
    MetricsModule,
    EventBusModule,
    RbacModule,
    EncryptionModule,
    ConsentModule,
    DataSubjectModule,
    DataRetentionModule,
    EmergencyAccessModule,
    BreachNotificationModule,
    DataClassificationModule,
    ProcessingActivityModule,
    HierarchyModule,
    OrganizationHierarchyModule,
    DutyRosterModule,
    InfrastructureModule,
    AssetManagementModule,
    BiomedicalModule,
    ConsumablesModule,
    InventoryModule,
    ProcurementModule,
    ContractsModule,
    SuppliersModule,
    QualityModule,
    RadiationSafetyModule,
    DeviceLifecycleModule,
    SmartInventoryModule,
    SupervisorCenterModule,
    PersonnelGroupsModule,
    DistributedLockModule,
  ],
  providers: [
    SeedService,
    RbacSeedService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: InactivityInterceptor,
    },
  ],
})
export class AppModule {}
