import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface ScheduleValidatedPayload {
  valid: boolean;
  hardViolationCount: number;
  softViolationCount: number;
  overallScore: number;
  validatedBy: string;
}

export class ScheduleValidatedEvent extends DomainEvent<ScheduleValidatedPayload> {
  constructor(aggregateId: string, payload: ScheduleValidatedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
