import { ValueObject } from '../../../../ddd/value-object.base';

export class DeviceId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(id: string): DeviceId {
    if (!id || id.trim().length === 0) {
      throw new Error('DeviceId cannot be empty');
    }
    return new DeviceId(id.trim());
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
