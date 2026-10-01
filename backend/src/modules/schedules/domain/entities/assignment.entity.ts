import { Entity } from '../../../../ddd/entity.base';
import { AssignmentDate } from '../value-objects/assignment-date.value-object';
import { TimeSlot } from '../value-objects/time-slot.value-object';
import {
  ShiftTypeVO,
  ShiftTypeValue,
} from '../value-objects/shift-type.value-object';
import { PersonnelId } from '../value-objects/personnel-id.value-object';
import { DeviceId } from '../value-objects/device-id.value-object';

export type AssignmentKind = 'device' | 'person';
export type AssignmentSource =
  | 'manual'
  | 'auto-generated'
  | 'override'
  | 'swap'
  | 'template'
  | 'import';

export interface AssignmentProps {
  scheduleId: string;
  personnelId: PersonnelId;
  deviceId: DeviceId | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: AssignmentKind;
  source: AssignmentSource;
  date: AssignmentDate;
  shiftType: ShiftTypeVO;
  timeSlot: TimeSlot;
  personnelType: string;
  isConfirmed: boolean;
  overrideReason: string | null;
  overriddenBy: string | null;
  overriddenAt: Date | null;
}

export class Assignment extends Entity<AssignmentProps> {
  private constructor(props: AssignmentProps, id?: string) {
    super(props, id);
  }

  static create(params: {
    scheduleId: string;
    personnelId: string;
    deviceId?: string | null;
    unitId?: string | null;
    personnelGroupId?: string | null;
    shiftTemplateId?: string | null;
    kind?: AssignmentKind;
    source?: AssignmentSource;
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    personnelType?: string;
    isConfirmed?: boolean;
    overrideReason?: string | null;
    overriddenBy?: string | null;
    id?: string;
  }): Assignment {
    return new Assignment(
      {
        scheduleId: params.scheduleId,
        personnelId: PersonnelId.create(params.personnelId),
        deviceId: params.deviceId ? DeviceId.create(params.deviceId) : null,
        unitId: params.unitId || null,
        personnelGroupId: params.personnelGroupId || null,
        shiftTemplateId: params.shiftTemplateId || null,
        kind: params.kind || 'device',
        source: params.source || 'manual',
        date: AssignmentDate.create(params.date),
        shiftType: ShiftTypeVO.create(params.shiftType),
        timeSlot: TimeSlot.create(params.startTime, params.endTime),
        personnelType: params.personnelType || 'technician',
        isConfirmed: params.isConfirmed ?? false,
        overrideReason: params.overrideReason ?? null,
        overriddenBy: params.overriddenBy ?? null,
        overriddenAt: params.overriddenBy ? new Date() : null,
      },
      params.id,
    );
  }

  get scheduleId(): string {
    return this.props.scheduleId;
  }
  get personnelId(): PersonnelId {
    return this.props.personnelId;
  }
  get deviceId(): DeviceId | null {
    return this.props.deviceId;
  }
  get unitId(): string | null {
    return this.props.unitId;
  }
  get personnelGroupId(): string | null {
    return this.props.personnelGroupId;
  }
  get shiftTemplateId(): string | null {
    return this.props.shiftTemplateId;
  }
  get kind(): AssignmentKind {
    return this.props.kind;
  }
  get source(): AssignmentSource {
    return this.props.source;
  }
  get date(): AssignmentDate {
    return this.props.date;
  }
  get shiftType(): ShiftTypeVO {
    return this.props.shiftType;
  }
  get timeSlot(): TimeSlot {
    return this.props.timeSlot;
  }
  get personnelType(): string {
    return this.props.personnelType;
  }
  get isConfirmed(): boolean {
    return this.props.isConfirmed;
  }
  get overrideReason(): string | null {
    return this.props.overrideReason;
  }
  get overriddenBy(): string | null {
    return this.props.overriddenBy;
  }
  get overriddenAt(): Date | null {
    return this.props.overriddenAt;
  }
  get startTime(): string {
    return this.props.timeSlot.startTime;
  }
  get endTime(): string {
    return this.props.timeSlot.endTime;
  }
  get durationHours(): number {
    return this.props.timeSlot.durationHours;
  }

  overlapsWith(other: Assignment): boolean {
    if (!this.props.date.isSameDay(other.props.date)) return false;
    if (this.props.personnelId.equals(other.props.personnelId)) {
      return this.props.timeSlot.overlaps(other.props.timeSlot);
    }
    if (
      this.props.deviceId &&
      other.props.deviceId &&
      this.props.deviceId.equals(other.props.deviceId)
    ) {
      return (
        this.props.shiftType.value === other.props.shiftType.value &&
        this.props.timeSlot.overlaps(other.props.timeSlot)
      );
    }
    return false;
  }

  isSameSlot(other: Assignment): boolean {
    return (
      this.props.date.isSameDay(other.props.date) &&
      this.props.shiftType.value === other.props.shiftType.value &&
      this.props.personnelId.equals(other.props.personnelId)
    );
  }

  isOnSameDevice(other: Assignment): boolean {
    return (
      this.props.deviceId !== null &&
      other.props.deviceId !== null &&
      this.props.deviceId.equals(other.props.deviceId) &&
      this.props.date.isSameDay(other.props.date) &&
      this.props.shiftType.value === other.props.shiftType.value
    );
  }

  confirm(): void {
    this.props.isConfirmed = true;
    this.incrementVersion();
  }

  unconfirm(): void {
    this.props.isConfirmed = false;
    this.incrementVersion();
  }

  toSnapshot(): {
    personnelId: string;
    deviceId: string | null;
    unitId: string | null;
    personnelGroupId: string | null;
    shiftTemplateId: string | null;
    kind: AssignmentKind;
    source: AssignmentSource;
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    personnelType: string;
    overrideReason: string | null;
    overriddenBy: string | null;
  } {
    return {
      personnelId: this.props.personnelId.value,
      deviceId: this.props.deviceId?.value ?? null,
      unitId: this.props.unitId,
      personnelGroupId: this.props.personnelGroupId,
      shiftTemplateId: this.props.shiftTemplateId,
      kind: this.props.kind,
      source: this.props.source,
      date: this.props.date.value,
      shiftType: this.props.shiftType.value,
      startTime: this.props.timeSlot.startTime,
      endTime: this.props.timeSlot.endTime,
      personnelType: this.props.personnelType,
      overrideReason: this.props.overrideReason,
      overriddenBy: this.props.overriddenBy,
    };
  }
}
