import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface ScheduleCreatedPayload {
  unitId: string;
  month: number;
  year: number;
  createdById: string;
}

export class ScheduleCreatedEvent extends DomainEvent<ScheduleCreatedPayload> {
  constructor(aggregateId: string, payload: ScheduleCreatedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
