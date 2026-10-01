import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface ScheduleRolledBackPayload {
  fromVersion: number;
  toVersion: number;
  userId: string;
  userName: string;
  userRole: string;
  reason: string;
}

export class ScheduleRolledBackEvent extends DomainEvent<ScheduleRolledBackPayload> {
  constructor(aggregateId: string, payload: ScheduleRolledBackPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
