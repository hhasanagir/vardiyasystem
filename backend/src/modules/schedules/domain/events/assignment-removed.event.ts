import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface AssignmentRemovedPayload {
  assignmentId: string;
  personnelId: string;
  deviceId: string | null;
  date: string;
  shiftType: string;
  removedBy: string;
}

export class AssignmentRemovedEvent extends DomainEvent<AssignmentRemovedPayload> {
  constructor(aggregateId: string, payload: AssignmentRemovedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
