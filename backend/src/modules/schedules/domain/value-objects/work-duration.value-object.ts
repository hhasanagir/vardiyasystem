import { ValueObject } from '../../../../ddd/value-object.base';

export class WorkDuration extends ValueObject<{ hours: number }> {
  private constructor(value: { hours: number }) {
    super(value);
  }

  static create(hours: number): WorkDuration {
    if (hours < 0) throw new Error('Work duration cannot be negative');
    if (hours > 24) throw new Error('Work duration cannot exceed 24 hours');
    return new WorkDuration({ hours });
  }

  get hours(): number {
    return this._value.hours;
  }
  get minutes(): number {
    return this._value.hours * 60;
  }

  isWithinLimit(maxHours: number): boolean {
    return this._value.hours <= maxHours;
  }
}
