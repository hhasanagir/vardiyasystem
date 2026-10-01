import { DomainEvent } from '../../../../ddd/domain-event.base';

export interface ScheduleGeneratedPayload {
  unitId: string;
  month: number;
  year: number;
  assignmentCount: number;
  algorithm: string;
  seed: number;
  generationTimeMs: number;
  score: number;
  generatedBy: string;
}

export class ScheduleGeneratedEvent extends DomainEvent<ScheduleGeneratedPayload> {
  constructor(aggregateId: string, payload: ScheduleGeneratedPayload) {
    super({
      aggregateId,
      aggregateType: 'Schedule',
      payload,
    });
  }
}
