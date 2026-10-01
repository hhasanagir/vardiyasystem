import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface AssignmentAddedPayload {
  assignmentId: string;
  personnelId: string;
  deviceId: string | null;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  addedBy: string;
}

export class AssignmentAddedEvent extends DomainEvent<AssignmentAddedPayload> {
  constructor(aggregateId: string, payload: AssignmentAddedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
