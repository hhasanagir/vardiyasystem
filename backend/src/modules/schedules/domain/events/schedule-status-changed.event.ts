import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface ScheduleStatusChangedPayload {
  previousStatus: string;
  newStatus: string;
  userId: string;
  userName: string;
  userRole: string;
  comment?: string;
}

export class ScheduleStatusChangedEvent extends DomainEvent<ScheduleStatusChangedPayload> {
  constructor(aggregateId: string, payload: ScheduleStatusChangedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
