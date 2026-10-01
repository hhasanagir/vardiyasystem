import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from './metrics/metrics.service';
import {
  createSoftDeleteMiddleware,
  createOptimisticLockingMiddleware,
  createTenantMiddleware,
} from './infrastructure/prisma/middleware';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private metrics?: MetricsService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    this.$use(createTenantMiddleware());
    this.$use(createSoftDeleteMiddleware());
    this.$use(createOptimisticLockingMiddleware());

    (this as any).$on('query', (event: any) => {
      const e = event as {
        query: string;
        params: string;
        duration: number;
        timestamp: Date;
      };

      const model = this.inferModel(e.query);
      const action = this.inferAction(e.query);

      this.metrics?.recordDbQuery(model, action, e.duration);
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private inferModel(query: string): string {
    const tables: Record<string, string> = {
      DeviceIncident: 'device_incident',
      DeviceStatus: 'device_status',
      ScheduleAssignment: 'schedule_assignment',
      ScheduleSnapshot: 'schedule_snapshot',
      ScheduleHistory: 'schedule_history',
      SwapRequest: 'swap_request',
      Notification: 'notification',
      Attendance: 'attendance',
      AuditLog: 'audit_log',
      ShiftTask: 'shift_task',
      HandoverNote: 'handover_note',
      PushSubscription: 'push_subscription',
      AuthAttempt: 'auth_attempt',
      AuthSession: 'auth_session',
      EditLock: 'edit_lock',
      Presence: 'presence',
      ConcurrencyLock: 'concurrency_lock',
      EventLog: 'event_log',
    };

    const lower = query.toLowerCase();
    for (const [label, table] of Object.entries(tables)) {
      if (lower.includes(table)) return label;
    }

    for (const prefix of [
      'device',
      'schedule',
      'user',
      'unit',
      'organization',
      'shift',
    ]) {
      if (lower.includes(prefix))
        return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    return 'Other';
  }

  private inferAction(query: string): string {
    const lower = query.trimStart().toLowerCase();
    if (lower.startsWith('select') || lower.startsWith('with'))
      return 'findMany';
    if (lower.startsWith('insert')) return 'create';
    if (lower.startsWith('update')) return 'update';
    if (lower.startsWith('delete')) return 'delete';
    if (
      lower.startsWith('begin') ||
      lower.startsWith('commit') ||
      lower.startsWith('rollback')
    )
      return 'transaction';
    return 'other';
  }
}
