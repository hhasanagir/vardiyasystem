import { Assignment } from './assignment.entity';
import { AssignmentDate } from '../value-objects/assignment-date.value-object';
import { PersonnelId } from '../value-objects/personnel-id.value-object';
import { DeviceId } from '../value-objects/device-id.value-object';

export class AssignmentCollection {
  private readonly _items: Map<string, Assignment> = new Map();

  constructor(existing?: Assignment[]) {
    if (existing) {
      for (const assignment of existing) {
        this._items.set(assignment.id, assignment);
      }
    }
  }

  get size(): number {
    return this._items.size;
  }

  get all(): Assignment[] {
    return Array.from(this._items.values());
  }

  getById(id: string): Assignment | undefined {
    return this._items.get(id);
  }

  add(assignment: Assignment): void {
    if (this._items.has(assignment.id)) {
      throw new Error(`Assignment ${assignment.id} already exists`);
    }
    this._items.set(assignment.id, assignment);
  }

  remove(id: string): Assignment | undefined {
    const assignment = this._items.get(id);
    if (assignment) {
      this._items.delete(id);
    }
    return assignment;
  }

  findByDate(date: AssignmentDate): Assignment[] {
    return this.all.filter((a) => a.date.isSameDay(date));
  }

  findByPersonnel(personnelId: PersonnelId): Assignment[] {
    return this.all.filter((a) => a.personnelId.equals(personnelId));
  }

  findByDevice(deviceId: DeviceId): Assignment[] {
    return this.all.filter(
      (a) => a.deviceId !== null && a.deviceId.equals(deviceId),
    );
  }

  findByPersonnelAndDate(
    personnelId: PersonnelId,
    date: AssignmentDate,
  ): Assignment[] {
    return this.all.filter(
      (a) => a.personnelId.equals(personnelId) && a.date.isSameDay(date),
    );
  }

  findByDeviceAndDate(deviceId: DeviceId, date: AssignmentDate): Assignment[] {
    return this.all.filter(
      (a) =>
        a.deviceId !== null &&
        a.deviceId.equals(deviceId) &&
        a.date.isSameDay(date),
    );
  }

  findOverlapping(assignment: Assignment): Assignment[] {
    return this.all.filter(
      (a) => a.id !== assignment.id && a.overlapsWith(assignment),
    );
  }

  hasOverlap(assignment: Assignment): boolean {
    return this.findOverlapping(assignment).length > 0;
  }

  hasSameSlot(assignment: Assignment): boolean {
    return this.all.some(
      (a) => a.id !== assignment.id && a.isSameSlot(assignment),
    );
  }

  countByPersonnel(personnelId: PersonnelId): number {
    return this.findByPersonnel(personnelId).length;
  }

  countWorkingDaysByPersonnel(personnelId: PersonnelId): number {
    return this.findByPersonnel(personnelId).filter(
      (a) => a.shiftType.isWorking,
    ).length;
  }

  countNightShiftsByPersonnel(personnelId: PersonnelId): number {
    return this.findByPersonnel(personnelId).filter(
      (a) => a.shiftType.isNightShift,
    ).length;
  }

  getConsecutiveDays(personnelId: PersonnelId): number {
    const assignments = this.findByPersonnel(personnelId)
      .filter((a) => a.shiftType.isWorking)
      .sort((a, b) => a.date.value.localeCompare(b.date.value));

    if (assignments.length === 0) return 0;

    let maxConsecutive = 1;
    let currentConsecutive = 1;

    for (let i = 1; i < assignments.length; i++) {
      const prevDate = new Date(assignments[i - 1].date.value);
      const currDate = new Date(assignments[i].date.value);
      const diffDays = Math.round(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }

    return maxConsecutive;
  }

  getWeeklyHours(personnelId: PersonnelId, weekStart: AssignmentDate): number {
    const weekEnd = weekStart.addDays(6);
    return this.findByPersonnel(personnelId)
      .filter((a) => {
        const d = a.date.value;
        return (
          d >= weekStart.value && d <= weekEnd.value && a.shiftType.isWorking
        );
      })
      .reduce((total, a) => total + a.durationHours, 0);
  }

  getLastAssignmentBefore(
    personnelId: PersonnelId,
    date: AssignmentDate,
  ): Assignment | undefined {
    return this.findByPersonnel(personnelId)
      .filter((a) => a.date.isBefore(date) && a.shiftType.isWorking)
      .sort((a, b) => b.date.value.localeCompare(a.date.value))[0];
  }

  getLastNightShiftBefore(
    personnelId: PersonnelId,
    date: AssignmentDate,
  ): Assignment | undefined {
    return this.findByPersonnel(personnelId)
      .filter((a) => a.date.isBefore(date) && a.shiftType.isNightShift)
      .sort((a, b) => b.date.value.localeCompare(a.date.value))[0];
  }

  countByUnit(unitId: string): number {
    return this.all.filter((a) => a.unitId === unitId).length;
  }

  toJSON(): Array<ReturnType<Assignment['toSnapshot']>> {
    return this.all.map((a) => a.toSnapshot());
  }
}
