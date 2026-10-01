import { AggregateRoot } from '../../../../ddd/aggregate-root.base';
import { DomainEvent } from '../../../../ddd/domain-event.base';
import { Assignment, AssignmentKind } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { ScheduleCreatedEvent } from '../events/schedule-created.event';
import { AssignmentAddedEvent } from '../events/assignment-added.event';
import { AssignmentRemovedEvent } from '../events/assignment-removed.event';
import { AssignmentOverriddenEvent } from '../events/assignment-overridden.event';
import { ScheduleStatusChangedEvent } from '../events/schedule-status-changed.event';

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
  submittedAt: Date | null;
  submittedComment: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvalComment: string | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  archivedBy: string | null;
  archivedAt: Date | null;
}

export interface ScheduleSnapshot {
  assignments: Array<ReturnType<Assignment['toSnapshot']>>;
  comment?: string;
}

export class Schedule extends AggregateRoot<ScheduleProps> {
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
      submittedAt: new Date(),
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
      approvedAt: new Date(),
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
      rejectedAt: new Date(),
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
    this.upsertApproval({ publishedBy: userId, publishedAt: new Date() });
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
    this.upsertApproval({ archivedBy: userId, archivedAt: new Date() });
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

  addAssignment(
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: AssignmentKind;
      source?: import('../entities/assignment.entity').AssignmentSource;
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
      case 'ScheduleStatusChangedEvent':
        break;
    }
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
