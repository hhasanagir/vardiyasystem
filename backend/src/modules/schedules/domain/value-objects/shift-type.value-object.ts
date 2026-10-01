import { ValueObject } from '../../../../ddd/value-object.base';

export type ShiftTypeValue =
  | 'day'
  | 'evening'
  | 'night'
  | 'morning'
  | 'off'
  | 'leave'
  | 'sick'
  | 'training'
  | 'backup';

export class ShiftTypeVO extends ValueObject<ShiftTypeValue> {
  static readonly WORKING_TYPES: ShiftTypeValue[] = [
    'day',
    'evening',
    'night',
    'morning',
  ];
  static readonly NON_WORKING_TYPES: ShiftTypeValue[] = [
    'off',
    'leave',
    'sick',
    'training',
  ];
  static readonly SPECIAL_TYPES: ShiftTypeValue[] = ['backup'];

  private static readonly VALID_TYPES: ShiftTypeValue[] = [
    'day',
    'evening',
    'night',
    'morning',
    'off',
    'leave',
    'sick',
    'training',
    'backup',
  ];

  private constructor(value: ShiftTypeValue) {
    super(value);
  }

  static create(value: string): ShiftTypeVO {
    if (!ShiftTypeVO.VALID_TYPES.includes(value as ShiftTypeValue)) {
      throw new Error(
        `Invalid shift type: ${value}. Valid types: ${ShiftTypeVO.VALID_TYPES.join(', ')}`,
      );
    }
    return new ShiftTypeVO(value as ShiftTypeValue);
  }

  get value(): ShiftTypeValue {
    return this._value;
  }

  get isWorking(): boolean {
    return ShiftTypeVO.WORKING_TYPES.includes(this._value);
  }

  get isNonWorking(): boolean {
    return ShiftTypeVO.NON_WORKING_TYPES.includes(this._value);
  }

  get isNightShift(): boolean {
    return this._value === 'night';
  }

  get isOff(): boolean {
    return this._value === 'off';
  }

  get isLeave(): boolean {
    return this._value === 'leave';
  }

  get isSick(): boolean {
    return this._value === 'sick';
  }

  get isTraining(): boolean {
    return this._value === 'training';
  }

  get isBackup(): boolean {
    return this._value === 'backup';
  }

  get isCountable(): boolean {
    return this._value !== 'off' && this._value !== 'backup';
  }

  get label(): string {
    const labels: Record<ShiftTypeValue, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
      off: 'İzin',
      leave: 'Mazeret',
      sick: 'Hasta',
      training: 'Eğitim',
      backup: 'Yedek',
    };
    return labels[this._value];
  }

  toString(): string {
    return this._value;
  }
}
