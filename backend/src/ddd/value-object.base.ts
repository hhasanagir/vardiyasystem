export abstract class ValueObject<T = unknown> {
  protected readonly _value: T;

  constructor(value: T) {
    this._value = Object.freeze(value);
  }

  get value(): T {
    return this._value;
  }

  public equals(other: ValueObject<T>): boolean {
    if (!other) return false;
    return JSON.stringify(this._value) === JSON.stringify(other._value);
  }

  public toJSON(): T {
    return this._value;
  }
}
