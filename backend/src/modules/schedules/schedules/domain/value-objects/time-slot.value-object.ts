import { ValueObject } from '../../../../ddd/value-object.base';

export class TimeSlot extends ValueObject<{ start: string; end: string }> {
  private static readonly TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

  private constructor(props: { start: string; end: string }) {
    super(props);
  }

  static create(startTime: string, endTime: string): TimeSlot {
    if (!TimeSlot.TIME_REGEX.test(startTime)) {
      throw new Error(`Invalid start time: ${startTime}. Expected HH:mm (24h)`);
    }
    if (!TimeSlot.TIME_REGEX.test(endTime)) {
      throw new Error(`Invalid end time: ${endTime}. Expected HH:mm (24h)`);
    }
    return new TimeSlot({ start: startTime, end: endTime });
  }

  static fromShiftType(shiftType: string): TimeSlot {
    const shiftTimes: Record<string, { start: string; end: string }> = {
      day: { start: '08:00', end: '16:00' },
      evening: { start: '16:00', end: '00:00' },
      night: { start: '00:00', end: '08:00' },
      morning: { start: '08:00', end: '16:00' },
    };
    const times = shiftTimes[shiftType];
    if (!times) {
      throw new Error(`No default time range for shift type: ${shiftType}`);
    }
    return new TimeSlot(times);
  }

  get startTime(): string {
    return this._value.start;
  }

  get endTime(): string {
    return this._value.end;
  }

  get durationHours(): number {
    const [startH, startM] = this._value.start.split(':').map(Number);
    const [endH, endM] = this._value.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }
    return (endMinutes - startMinutes) / 60;
  }

  get isOvernight(): boolean {
    return this._value.end <= this._value.start && this._value.end !== '00:00';
  }

  overlaps(other: TimeSlot): boolean {
    const [startA, endA] = this.toMinutesRange();
    const [startB, endB] = other.toMinutesRange();
    return startA < endB && startB < endA;
  }

  contains(time: string): boolean {
    const [h, m] = time.split(':').map(Number);
    const timeMinutes = h * 60 + m;
    const [startMinutes, endMinutes] = this.toMinutesRange();
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }

  private toMinutesRange(): [number, number] {
    const [startH, startM] = this._value.start.split(':').map(Number);
    const [endH, endM] = this._value.end.split(':').map(Number);
    const start = startH * 60 + startM;
    let end = endH * 60 + endM;
    if (end <= start) end += 24 * 60;
    return [start, end];
  }

  toString(): string {
    return `${this._value.start}-${this._value.end}`;
  }
}
