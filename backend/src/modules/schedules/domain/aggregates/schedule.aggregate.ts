import { AggregateRoot } from '../../../../ddd/aggregate-root.base';
import { DomainEvent } from '../../../../ddd/domain-event.base';
import {
  Assignment,
  AssignmentKind,
  AssignmentSource,
} from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { ScheduleCreatedEvent } from '../events/schedule-created.event';
import { AssignmentAddedEvent } from '../events/assignment-added.event';
import { AssignmentRemovedEvent } from '../events/assignment-removed.event';
import { AssignmentOverriddenEvent } from '../events/assignment-overridden.event';
import { AssignmentChangedEvent } from '../events/assignment-changed.event';
import { ScheduleStatusChangedEvent } from '../events/schedule-status-changed.event';
import { ScheduleRolledBackEvent } from '../events/schedule-rolled-back.event';
import { StaleVersionError } from '../errors/schedule-errors';

export type ScheduleStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'rejected';

const VALID_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  draft: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['published'],
  published: ['archived'],
  archived: [],
  rejected: ['draft'],
};

const TRANSITION_ALLOWED_ROLES: Record<string, ScheduleStatus[]> = {
  imaging_director: [
    'under_review',
    'approved',
    'rejected',
    'published',
    'archived',
    'draft',
  ],
  supervisor: ['under_review', 'approved', 'rejected', 'draft'],
  medical_engineer: ['under_review', 'draft'],
  senior_technician: ['under_review', 'draft'],
  system_admin: [
    'under_review',
    'approved',
    'rejected',
    'published',
    'archived',
    'draft',
  ],
  hospital_admin: [
    'under_review',
    'approved',
    'rejected',
    'published',
    'archived',
    'draft',
  ],
};

export interface ScheduleProps {
  unitId: string;
  month: number;
  year: number;
  status: ScheduleStatus;
  version: number;
  createdById: string | null;
  publishedAt: Date | null;
  assignments: AssignmentCollection;
  approvalData: ApprovalData | null;
}

export interface ApprovalData {
  submittedBy: string | null;
  submittedAt: string | null;
  submittedComment: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
}

export interface ScheduleSnapshot {
  assignments: Array<ReturnType<Assignment['toSnapshot']>>;
  comment?: string;
}

export class Schedule extends AggregateRoot<ScheduleProps> {
  private _expectedVersion: number | null = null;

  private constructor(props: ScheduleProps, id?: string) {
    super(props, id);
  }

  static create(params: {
    unitId: string;
    month: number;
    year: number;
    createdById: string;
    id?: string;
  }): Schedule {
    const schedule = new Schedule(
      {
        unitId: params.unitId,
        month: params.month,
        year: params.year,
        status: 'draft',
        version: 1,
        createdById: params.createdById,
        publishedAt: null,
        assignments: new AssignmentCollection(),
        approvalData: null,
      },
      params.id,
    );

    schedule.addDomainEvent(
      new ScheduleCreatedEvent(schedule.id, {
        unitId: params.unitId,
        month: params.month,
        year: params.year,
        createdById: params.createdById,
      }),
    );

    return schedule;
  }

  static reconstitute(id: string, props: ScheduleProps): Schedule {
    return new Schedule(props, id);
  }

  get unitId(): string {
    return this.props.unitId;
  }
  get month(): number {
    return this.props.month;
  }
  get year(): number {
    return this.props.year;
  }
  get status(): ScheduleStatus {
    return this.props.status;
  }
  get scheduleVersion(): number {
    return this.props.version;
  }
  get createdById(): string | null {
    return this.props.createdById;
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }
  get assignments(): AssignmentCollection {
    return this.props.assignments;
  }
  get approvalData(): ApprovalData | null {
    return this.props.approvalData;
  }
  get expectedVersion(): number | null {
    return this._expectedVersion;
  }

  get isEditable(): boolean {
    return this.props.status === 'draft' || this.props.status === 'rejected';
  }

  get isPublished(): boolean {
    return (
      this.props.status === 'published' || this.props.status === 'archived'
    );
  }

  get totalAssignments(): number {
    return this.props.assignments.size;
  }

  get workingDaysCount(): number {
    const dates = new Set<string>();
    for (const a of this.props.assignments.all) {
      if (a.shiftType.isWorking) {
        dates.add(a.date.value);
      }
    }
    return dates.size;
  }

  getMonthDays(): number {
    return new Date(this.props.year, this.props.month, 0).getDate();
  }

  canTransitionTo(newStatus: ScheduleStatus): boolean {
    const allowed = VALID_TRANSITIONS[this.props.status];
    return allowed.includes(newStatus);
  }

  canRoleTransition(newStatus: ScheduleStatus, userRole: string): boolean {
    if (!this.canTransitionTo(newStatus)) return false;
    const roleTransitions = TRANSITION_ALLOWED_ROLES[userRole];
    return roleTransitions?.includes(newStatus) ?? false;
  }

  setExpectedVersion(version: number): void {
    this._expectedVersion = version;
  }

  verifyVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new StaleVersionError(this.id, expectedVersion, this.props.version);
    }
  }

  submitForReview(
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
  ): void {
    if (!this.canRoleTransition('under_review', userRole)) {
      throw new Error(
        `Cannot submit schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    const prev = this.props.status;
    this.transitionTo('under_review');
    this.upsertApproval({
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
      submittedComment: comment || null,
    });
    this.emitStatusChange(prev, userId, userName, userRole, comment);
  }

  approve(
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
  ): void {
    if (!this.canRoleTransition('approved', userRole)) {
      throw new Error(
        `Cannot approve schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    const prev = this.props.status;
    this.transitionTo('approved');
    this.upsertApproval({
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
      approvalComment: comment || null,
    });
    this.emitStatusChange(prev, userId, userName, userRole, comment);
  }

  reject(
    userId: string,
    userName: string,
    userRole: string,
    reason: string,
  ): void {
    if (!this.canRoleTransition('rejected', userRole)) {
      throw new Error(
        `Cannot reject schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }
    const prev = this.props.status;
    this.transitionTo('rejected');
    this.upsertApproval({
      rejectedBy: userId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
    });
    this.emitStatusChange(prev, userId, userName, userRole, reason);
  }

  publish(userId: string, userName: string, userRole: string): void {
    if (!this.canRoleTransition('published', userRole)) {
      throw new Error(
        `Cannot publish schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    const prev = this.props.status;
    this.transitionTo('published');
    this.props.publishedAt = new Date();
    this.upsertApproval({
      publishedBy: userId,
      publishedAt: new Date().toISOString(),
    });
    this.emitStatusChange(prev, userId, userName, userRole);
  }

  archive(userId: string, userName: string, userRole: string): void {
    if (!this.canRoleTransition('archived', userRole)) {
      throw new Error(
        `Cannot archive schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    const prev = this.props.status;
    this.transitionTo('archived');
    this.upsertApproval({
      archivedBy: userId,
      archivedAt: new Date().toISOString(),
    });
    this.emitStatusChange(prev, userId, userName, userRole);
  }

  revertToDraft(userId: string, userName: string, userRole: string): void {
    if (!this.canRoleTransition('draft', userRole)) {
      throw new Error(
        `Cannot revert schedule from ${this.props.status} with role ${userRole}`,
      );
    }
    const prev = this.props.status;
    this.transitionTo('draft');
    this.emitStatusChange(
      prev,
      userId,
      userName,
      userRole,
      'Reverted to draft',
    );
  }

  rollback(
    targetVersion: number,
    snapshotAssignments: Array<ReturnType<Assignment['toSnapshot']>>,
    userId: string,
    userName: string,
    userRole: string,
    reason: string,
  ): void {
    if (this.props.version <= targetVersion) {
      throw new Error(
        `Cannot rollback to version ${targetVersion}: current version is ${this.props.version}`,
      );
    }

    const restoredAssignments = snapshotAssignments.map((s) =>
      Assignment.create({
        id: `restored-${s.personnelId}-${s.date}-${s.shiftType}-${Date.now()}`,
        scheduleId: this.id,
        personnelId: s.personnelId,
        deviceId: s.deviceId,
        unitId: s.unitId,
        personnelGroupId: s.personnelGroupId,
        shiftTemplateId: s.shiftTemplateId,
        kind: s.kind as AssignmentKind,
        source: 'override',
        date: s.date,
        shiftType: s.shiftType,
        startTime: s.startTime,
        endTime: s.endTime,
        personnelType: s.personnelType,
      }),
    );

    const fromVersion = this.props.version;
    this.props.assignments = new AssignmentCollection(restoredAssignments);
    this.props.status = 'draft';
    this.incrementVersion();

    this.addDomainEvent(
      new ScheduleRolledBackEvent(this.id, {
        fromVersion,
        toVersion: this.props.version,
        userId,
        userName,
        userRole,
        reason,
      }),
    );

    this.emitStatusChange(
      'published' as ScheduleStatus,
      userId,
      userName,
      userRole,
      `Rolled back from v${fromVersion} to v${this.props.version}: ${reason}`,
    );
  }

  addAssignment(
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: AssignmentKind;
      source?: AssignmentSource;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
      id?: string;
    },
    userId: string,
  ): Assignment {
    if (!this.isEditable && this.props.status !== 'published') {
      throw new Error(
        `Cannot add assignment to schedule in ${this.props.status} status`,
      );
    }

    const assignment = Assignment.create({
      scheduleId: this.id,
      ...params,
      source: params.source || 'manual',
    });

    this.props.assignments.add(assignment);
    this.incrementVersion();

    this.addDomainEvent(
      new AssignmentAddedEvent(this.id, {
        assignmentId: assignment.id,
        personnelId: params.personnelId,
        deviceId: params.deviceId || null,
        date: params.date,
        shiftType: params.shiftType,
        startTime: params.startTime,
        endTime: params.endTime,
        addedBy: userId,
      }),
    );

    return assignment;
  }

  overrideAssignment(
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: AssignmentKind;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
      id?: string;
    },
    userId: string,
    overrideReason: string,
    violatedRules: string[],
  ): Assignment {
    const assignment = this.addAssignment(
      { ...params, source: 'override' },
      userId,
    );

    this.addDomainEvent(
      new AssignmentOverriddenEvent(this.id, {
        assignmentId: assignment.id,
        personnelId: params.personnelId,
        deviceId: params.deviceId || null,
        date: params.date,
        shiftType: params.shiftType,
        overrideReason,
        violatedRules,
        overriddenBy: userId,
      }),
    );

    return assignment;
  }

  updateAssignment(
    assignmentId: string,
    changes: Partial<{
      deviceId: string | null;
      shiftType: string;
      startTime: string;
      endTime: string;
      kind: AssignmentKind;
      personnelGroupId: string | null;
      shiftTemplateId: string | null;
    }>,
    userId: string,
  ): Assignment | undefined {
    const assignment = this.props.assignments.getById(assignmentId);
    if (!assignment) return undefined;

    const changedFields: string[] = [];

    if (
      changes.deviceId !== undefined &&
      changes.deviceId !== (assignment.deviceId?.value ?? null)
    ) {
      changedFields.push('deviceId');
    }
    if (
      changes.shiftType !== undefined &&
      changes.shiftType !== assignment.shiftType.value
    ) {
      changedFields.push('shiftType');
    }
    if (
      changes.startTime !== undefined &&
      changes.startTime !== assignment.startTime
    ) {
      changedFields.push('startTime');
    }
    if (
      changes.endTime !== undefined &&
      changes.endTime !== assignment.endTime
    ) {
      changedFields.push('endTime');
    }

    if (changedFields.length === 0) return assignment;

    this.props.assignments.remove(assignmentId);

    const updated = Assignment.create({
      id: assignmentId,
      scheduleId: this.id,
      personnelId: assignment.personnelId.value,
      deviceId:
        changes.deviceId !== undefined
          ? changes.deviceId
          : (assignment.deviceId?.value ?? null),
      unitId: assignment.unitId,
      personnelGroupId:
        changes.personnelGroupId !== undefined
          ? changes.personnelGroupId
          : assignment.personnelGroupId,
      shiftTemplateId:
        changes.shiftTemplateId !== undefined
          ? changes.shiftTemplateId
          : assignment.shiftTemplateId,
      kind: changes.kind || assignment.kind,
      source: 'manual',
      date: assignment.date.value,
      shiftType: changes.shiftType || assignment.shiftType.value,
      startTime: changes.startTime || assignment.startTime,
      endTime: changes.endTime || assignment.endTime,
      personnelType: assignment.personnelType,
    });

    this.props.assignments.add(updated);
    this.incrementVersion();

    this.addDomainEvent(
      new AssignmentChangedEvent(this.id, {
        assignmentId,
        personnelId: assignment.personnelId.value,
        deviceId: updated.deviceId?.value ?? null,
        date: assignment.date.value,
        shiftType: assignment.shiftType.value,
        changedFields,
        changedBy: userId,
        before: {
          personnelId: assignment.personnelId.value,
          deviceId: assignment.deviceId?.value ?? null,
          date: assignment.date.value,
          shiftType: assignment.shiftType.value,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
        },
        after: {
          personnelId: updated.personnelId.value,
          deviceId: updated.deviceId?.value ?? null,
          date: updated.date.value,
          shiftType: updated.shiftType.value,
          startTime: updated.startTime,
          endTime: updated.endTime,
        },
      }),
    );

    return updated;
  }

  removeAssignment(
    assignmentId: string,
    userId: string,
  ): Assignment | undefined {
    if (!this.isEditable && this.props.status !== 'published') {
      throw new Error(
        `Cannot remove assignment from schedule in ${this.props.status} status`,
      );
    }

    const assignment = this.props.assignments.remove(assignmentId);
    if (assignment) {
      this.incrementVersion();

      this.addDomainEvent(
        new AssignmentRemovedEvent(this.id, {
          assignmentId: assignment.id,
          personnelId: assignment.personnelId.value,
          deviceId: assignment.deviceId?.value ?? null,
          date: assignment.date.value,
          shiftType: assignment.shiftType.value,
          removedBy: userId,
        }),
      );
    }

    return assignment;
  }

  replaceAllAssignments(assignments: Assignment[], userId: string): void {
    this.props.assignments = new AssignmentCollection(assignments);
    this.incrementVersion();
  }

  toSnapshot(): ScheduleSnapshot {
    return {
      assignments: this.props.assignments.toJSON(),
    };
  }

  protected applyEvent(event: DomainEvent): void {
    switch (event.eventName) {
      case 'ScheduleCreatedEvent':
        break;
      case 'AssignmentAddedEvent':
        break;
      case 'AssignmentRemovedEvent':
        break;
      case 'AssignmentOverriddenEvent':
        break;
      case 'AssignmentChangedEvent':
        break;
      case 'ScheduleStatusChangedEvent':
        break;
      case 'ScheduleRolledBackEvent':
        break;
      case 'ScheduleGeneratedEvent':
        break;
      case 'ScheduleValidatedEvent':
        break;
    }
  }

  private transitionTo(newStatus: ScheduleStatus): void {
    this.props.status = newStatus;
    this.incrementVersion();
  }

  private upsertApproval(data: Partial<ApprovalData>): void {
    if (!this.props.approvalData) {
      this.props.approvalData = {
        submittedBy: null,
        submittedAt: null,
        submittedComment: null,
        approvedBy: null,
        approvedAt: null,
        approvalComment: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        publishedBy: null,
        publishedAt: null,
        archivedBy: null,
        archivedAt: null,
      };
    }
    Object.assign(this.props.approvalData, data);
  }

  private emitStatusChange(
    prev: ScheduleStatus,
    userId: string,
    userName: string,
    userRole: string,
    comment?: string,
  ): void {
    this.addDomainEvent(
      new ScheduleStatusChangedEvent(this.id, {
        previousStatus: prev,
        newStatus: this.props.status,
        userId,
        userName,
        userRole,
        comment,
      }),
    );
  }
}
