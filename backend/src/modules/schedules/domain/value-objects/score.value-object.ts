import { ValueObject } from '../../../../ddd/value-object.base';

export class Score extends ValueObject<{ value: number; max: number }> {
  private constructor(value: { value: number; max: number }) {
    super(value);
  }

  static create(value: number, max: number = 100): Score {
    if (value < 0) throw new Error('Score cannot be negative');
    if (value > max) throw new Error(`Score cannot exceed ${max}`);
    return new Score({ value, max });
  }

  get scoreValue(): number {
    return this._value.value;
  }
  get max(): number {
    return this._value.max;
  }
  get percentage(): number {
    return this._value.max === 0
      ? 0
      : (this._value.value / this._value.max) * 100;
  }

  isAbove(threshold: number): boolean {
    return this.percentage >= threshold;
  }

  grade(): 'A' | 'B' | 'C' | 'D' | 'F' {
    const p = this.percentage;
    if (p >= 90) return 'A';
    if (p >= 80) return 'B';
    if (p >= 70) return 'C';
    if (p >= 60) return 'D';
    return 'F';
  }
}
