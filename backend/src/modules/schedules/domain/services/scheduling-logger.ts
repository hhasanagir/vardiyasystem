import { Logger } from '@nestjs/common';

export interface SchedulingLogMetadata {
  correlationId: string;
  scheduleId?: string;
  unitId?: string;
  algorithm?: string;
  duration?: number;
  assignmentCount?: number;
  conflictCount?: number;
  score?: number;
  result?: string;
  userId?: string;
  organizationId?: string;
}

const SENSITIVE_FIELDS = new Set([
  'personnelId',
  'personnelName',
  'email',
  'phone',
]);

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key)) {
      clean[key] = '***';
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class SchedulingLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  logGenerationStarted(meta: SchedulingLogMetadata): void {
    this.logger.log(
      `[SCHEDULING] Generation started`,
      sanitize(meta as unknown as Record<string, unknown>),
    );
  }

  logGenerationCompleted(meta: SchedulingLogMetadata): void {
    this.logger.log(
      `[SCHEDULING] Generation completed`,
      sanitize(meta as unknown as Record<string, unknown>),
    );
  }

  logValidationStarted(meta: SchedulingLogMetadata): void {
    this.logger.log(
      `[SCHEDULING] Validation started`,
      sanitize(meta as unknown as Record<string, unknown>),
    );
  }

  logValidationCompleted(meta: SchedulingLogMetadata): void {
    this.logger.log(
      `[SCHEDULING] Validation completed`,
      sanitize(meta as unknown as Record<string, unknown>),
    );
  }

  logStateTransition(
    scheduleId: string,
    from: string,
    to: string,
    userId: string,
  ): void {
    this.logger.log(`[SCHEDULING] State transition: ${from} -> ${to}`, {
      scheduleId,
      userId,
    });
  }

  logOptimisticLockConflict(
    scheduleId: string,
    expected: number,
    actual: number,
  ): void {
    this.logger.warn(`[SCHEDULING] Optimistic lock conflict`, {
      scheduleId,
      expected,
      actual,
    });
  }

  logRollback(
    scheduleId: string,
    fromVersion: number,
    toVersion: number,
    userId: string,
    reason: string,
  ): void {
    this.logger.warn(`[SCHEDULING] Rollback performed`, {
      scheduleId,
      fromVersion,
      toVersion,
      userId,
      reason,
    });
  }

  logError(message: string, meta: Partial<SchedulingLogMetadata>): void {
    this.logger.error(
      `[SCHEDULING] ${message}`,
      sanitize(meta as unknown as Record<string, unknown>),
    );
  }

  logOverride(scheduleId: string, userId: string, reason: string): void {
    this.logger.log(`[SCHEDULING] Assignment override`, {
      scheduleId,
      userId,
      reason,
    });
  }
}
