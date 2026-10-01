import { ValueObject } from '../../../../ddd/value-object.base';

export class PersonnelId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(id: string): PersonnelId {
    if (!id || id.trim().length === 0) {
      throw new Error('PersonnelId cannot be empty');
    }
    return new PersonnelId(id.trim());
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
