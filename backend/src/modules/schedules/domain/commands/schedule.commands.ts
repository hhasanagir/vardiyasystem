import { Command } from '../../../../ddd/command.base';

export interface UserContext {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string;
  unitId?: string;
}

export class CreateScheduleCommand extends Command<void> {
  constructor(
    public readonly unitId: string,
    public readonly month: number,
    public readonly year: number,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class GenerateScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
    public readonly configuration?: Record<string, unknown>,
  ) {
    super();
  }
}

export class ValidateScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class EditAssignmentCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly assignmentId: string,
    public readonly changes: Record<string, unknown>,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class ValidateAssignmentCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly assignmentParams: Record<string, unknown>,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class SubmitScheduleForReviewCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
    public readonly comment?: string,
  ) {
    super();
  }
}

export class ApproveScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
    public readonly comment?: string,
  ) {
    super();
  }
}

export class RejectScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
    public readonly reason: string,
  ) {
    super();
  }
}

export class PublishScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class RollbackScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly targetVersion: number,
    public readonly user: UserContext,
    public readonly reason: string,
  ) {
    super();
  }
}

export class ArchiveScheduleCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class CompareScheduleVersionsCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class AddAssignmentCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly assignmentParams: Record<string, unknown>,
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class OverrideAssignmentCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly assignmentParams: Record<string, unknown>,
    public readonly overrideReason: string,
    public readonly violatedRules: string[],
    public readonly user: UserContext,
  ) {
    super();
  }
}

export class RemoveAssignmentCommand extends Command<void> {
  constructor(
    public readonly scheduleId: string,
    public readonly assignmentId: string,
    public readonly user: UserContext,
  ) {
    super();
  }
}
