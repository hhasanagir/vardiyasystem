import { ValueObject } from '../../../../ddd/value-object.base';

export class AssignmentDate extends ValueObject<string> {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  private constructor(value: string) {
    super(value);
  }

  static create(date: string): AssignmentDate {
    if (!AssignmentDate.DATE_REGEX.test(date)) {
      throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }
    const [year, month, day] = date.split('-').map(Number);
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}`);
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      throw new Error(`Invalid day: ${day} for month ${month}/${year}`);
    }
    return new AssignmentDate(date);
  }

  get value(): string {
    return this._value;
  }

  get year(): number {
    return parseInt(this._value.substring(0, 4), 10);
  }

  get month(): number {
    return parseInt(this._value.substring(5, 7), 10);
  }

  get day(): number {
    return parseInt(this._value.substring(8, 10), 10);
  }

  get dayOfWeek(): number {
    const [year, month, day] = this._value.split('-').map(Number);
    return new Date(year, month - 1, day).getDay();
  }

  get dayName(): string {
    const names = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return names[this.dayOfWeek];
  }

  get isWeekend(): boolean {
    return this.dayOfWeek === 0 || this.dayOfWeek === 6;
  }

  get isFriday(): boolean {
    return this.dayOfWeek === 5;
  }

  isSameDay(other: AssignmentDate): boolean {
    return this._value === other._value;
  }

  isBefore(other: AssignmentDate): boolean {
    return this._value < other._value;
  }

  isAfter(other: AssignmentDate): boolean {
    return this._value > other._value;
  }

  daysUntil(other: AssignmentDate): number {
    const thisDate = new Date(this._value);
    const otherDate = new Date(other._value);
    const diffMs = otherDate.getTime() - thisDate.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  addDays(days: number): AssignmentDate {
    const [year, month, day] = this._value.split('-').map(Number);
    const date = new Date(year, month - 1, day + days);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return AssignmentDate.create(`${yyyy}-${mm}-${dd}`);
  }

  toString(): string {
    return this._value;
  }
}
