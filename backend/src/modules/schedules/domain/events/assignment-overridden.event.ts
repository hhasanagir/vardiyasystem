import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface AssignmentOverriddenPayload {
  assignmentId: string;
  personnelId: string;
  deviceId: string | null;
  date: string;
  shiftType: string;
  overrideReason: string;
  violatedRules: string[];
  overriddenBy: string;
}

export class AssignmentOverriddenEvent extends DomainEvent<AssignmentOverriddenPayload> {
  constructor(aggregateId: string, payload: AssignmentOverriddenPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
