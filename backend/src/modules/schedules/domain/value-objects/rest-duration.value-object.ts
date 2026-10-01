import { ValueObject } from '../../../../ddd/value-object.base';

export class RestDuration extends ValueObject<{ hours: number }> {
  private constructor(value: { hours: number }) {
    super(value);
  }

  static create(hours: number): RestDuration {
    if (hours < 0) throw new Error('Rest duration cannot be negative');
    return new RestDuration({ hours });
  }

  get hours(): number {
    return this._value.hours;
  }
  get minutes(): number {
    return this._value.hours * 60;
  }

  isSufficient(minHours: number): boolean {
    return this._value.hours >= minHours;
  }

  static REQUIRED(): RestDuration {
    return RestDuration.create(11);
  }
}
