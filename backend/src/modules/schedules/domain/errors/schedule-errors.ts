export class StaleVersionError extends Error {
  constructor(
    scheduleId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Schedule ${scheduleId} version conflict: expected version ${expectedVersion} but found ${actualVersion}. ` +
        `Another user has modified this schedule. Please refresh and try again.`,
    );
    this.name = 'StaleVersionError';
  }
}

export class ScheduleLockError extends Error {
  constructor(scheduleId: string) {
    super(
      `Schedule ${scheduleId} is locked by another operation. Please try again.`,
    );
    this.name = 'ScheduleLockError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(operation: string, idempotencyKey: string) {
    super(
      `Duplicate ${operation} detected (idempotency key: ${idempotencyKey}). ` +
        `This operation was already processed.`,
    );
    this.name = 'IdempotencyConflictError';
  }
}

export class ScheduleNotFoundError extends Error {
  constructor(scheduleId: string) {
    super(`Schedule ${scheduleId} not found`);
    this.name = 'ScheduleNotFoundError';
  }
}

export class InvalidScheduleStateError extends Error {
  constructor(
    scheduleId: string,
    currentStatus: string,
    attemptedAction: string,
  ) {
    super(
      `Cannot ${attemptedAction} schedule ${scheduleId}: current status is '${currentStatus}'`,
    );
    this.name = 'InvalidScheduleStateError';
  }
}

export class ScheduleAlreadyPublishedError extends Error {
  constructor(scheduleId: string) {
    super(`Schedule ${scheduleId} is already published and cannot be modified`);
    this.name = 'ScheduleAlreadyPublishedError';
  }
}

export class ScheduleValidationFailedError extends Error {
  constructor(scheduleId: string, hardViolationCount: number) {
    super(
      `Schedule ${scheduleId} validation failed with ${hardViolationCount} hard violation(s)`,
    );
    this.name = 'ScheduleValidationFailedError';
  }
}

export class AssignmentConflictError extends Error {
  constructor(scheduleId: string, conflictCode: string, message: string) {
    super(
      `Schedule ${scheduleId} assignment conflict [${conflictCode}]: ${message}`,
    );
    this.name = 'AssignmentConflictError';
  }
}

export class InsufficientRestError extends Error {
  constructor(personnelId: string, actualHours: number, requiredHours: number) {
    super(
      `Personnel ${personnelId} has insufficient rest: ${actualHours}h provided, ${requiredHours}h required`,
    );
    this.name = 'InsufficientRestError';
  }
}

export class QualificationRequiredError extends Error {
  constructor(personnelId: string, deviceId: string, requiredSkill: string) {
    super(
      `Personnel ${personnelId} lacks qualification '${requiredSkill}' for device ${deviceId}`,
    );
    this.name = 'QualificationRequiredError';
  }
}

export class OptimisticLockConflictError extends Error {
  constructor(
    scheduleId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Optimistic lock conflict on schedule ${scheduleId}: expected v${expectedVersion}, found v${actualVersion}`,
    );
    this.name = 'OptimisticLockConflictError';
  }
}

export class MasterDataMutationNotAllowedError extends Error {
  constructor(entityType: string, entityId: string) {
    super(
      `Mutation of master data entity ${entityType}(${entityId}) is not allowed by the scheduling engine`,
    );
    this.name = 'MasterDataMutationNotAllowedError';
  }
}

export class TenantIsolationError extends Error {
  constructor(scheduleId: string, organizationId: string) {
    super(
      `Schedule ${scheduleId} does not belong to organization ${organizationId}`,
    );
    this.name = 'TenantIsolationError';
  }
}
