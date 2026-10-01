import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface AssignmentSnapshot {
  personnelId: string;
  personnelName?: string;
  deviceId: string | null;
  deviceName?: string;
  date: string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
}

export interface AssignmentChangedPayload {
  assignmentId: string;
  personnelId: string;
  deviceId: string | null;
  date: string;
  shiftType: string;
  changedFields: string[];
  changedBy: string;
  before?: AssignmentSnapshot;
  after?: AssignmentSnapshot;
}

export class AssignmentChangedEvent extends DomainEvent<AssignmentChangedPayload> {
  constructor(aggregateId: string, payload: AssignmentChangedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
