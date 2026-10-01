import { ValueObject } from '../../../../ddd/value-object.base';

export class DateRange extends ValueObject<{ start: string; end: string }> {
  private constructor(value: { start: string; end: string }) {
    super(value);
  }

  static create(start: string, end: string): DateRange {
    if (start > end) throw new Error('Start date must be before end date');
    return new DateRange({ start, end });
  }

  get start(): string {
    return this._value.start;
  }
  get end(): string {
    return this._value.end;
  }

  contains(date: string): boolean {
    return date >= this._value.start && date <= this._value.end;
  }

  overlaps(other: DateRange): boolean {
    return (
      this._value.start <= other._value.end &&
      other._value.start <= this._value.end
    );
  }

  days(): number {
    const s = new Date(this._value.start);
    const e = new Date(this._value.end);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}
