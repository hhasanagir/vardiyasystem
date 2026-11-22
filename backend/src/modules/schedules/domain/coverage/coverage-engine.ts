/**
 * PHASE 5C.26 P1-A1 — CoverageEngine minimum-staffing FOUNDATION (pure domain).
 *
 * The single authoritative slot-enumeration + minimum-coverage calculator for
 * the schedule domain. Pure and deterministic: identical input => byte-identical
 * JSON output; no I/O, no Date.now, no Math.random, no unordered iteration.
 *
 * Semantics (byte-pinned by 5c26-coverage-foundation.spec.ts):
 *   - a slot is required per (device, in-scope date, shiftDef) when at least
 *     one operational person of that slot's personnel tier exists — a unit with
 *     0 technicians / 0 assistants / 0 supervisors requires NO such slot
 *     (phantom-free; fully vacuous when ALL tiers are 0 => allCovered=true).
 *   - Weekend days are excluded when includeWeekends=false; night-type shift
 *     defs are excluded when includeNightShifts=false; holidays, device off
 *     dates (`deviceId:date`) and shift-date overrides (`shiftId|date`) are
 *     excluded from the required set.
 *   - a matching assignment satisfies a slot only when its personnel is NOT
 *     blocked on that date (blockedPersonnelDates: Map<personnelId, Set<date>>).
 */
import {
  COVERAGE_ASSISTANT_PERSONNEL_TYPE,
  COVERAGE_SUPERVISOR_PERSONNEL_TYPE,
  COVERAGE_TECHNICIAN_PERSONNEL_TYPE,
  CoverageAssignmentInput,
  CoverageInput,
  CoverageLine,
  CoverageResult,
} from './coverage-types';

const SHIFT_ALIASES: Record<string, string> = {
  gündüz: 'day',
  gunduz: 'day',
  sabah: 'morning',
  akşam: 'evening',
  aksam: 'evening',
  öğle: 'afternoon',
  ogle: 'afternoon',
  gece: 'night',
};

export class CoverageEngine {
  evaluateCoverage(input: CoverageInput): CoverageResult {
    const daysInMonth = new Date(input.year, input.month, 0).getDate();
    const devices = [...input.devices].sort((a, b) => a.id.localeCompare(b.id));
    const shiftDefs = [...input.shiftDefs].sort((a, b) => a.id.localeCompare(b.id));

    const lines: CoverageLine[] = [];

    for (const device of devices) {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${input.year}-${pad2(input.month)}-${pad2(day)}`;
        const dayOfWeek = new Date(input.year, input.month - 1, day).getDay();

        if (device.workDays.length === 0 || device.workDays.includes(dayOfWeek)) {
          // device is open this day
        } else {
          continue;
        }

        if (!input.includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
        if (input.holidays.has(date)) continue;
        if (input.deviceOffDates?.has(`${device.id}:${date}`)) continue;

        for (const sd of shiftDefs) {
          if (sd.deviceId !== device.id) continue;
          if (input.shiftDateOverrides?.has(`${sd.id}|${date}`)) continue;

          const shiftType = normalizeShiftType(sd.shiftType);
          if (shiftType === 'night' && !input.includeNightShifts) continue;

          const personnelType = normalizePersonnelType(sd.personnelType);
          const tierCount = tierOperationalCount(personnelType, input);
          if (tierCount === 0) continue;

          const required = 1;
          const assigned = this.countAssigned(
            input.assignments,
            device.id,
            date,
            shiftType,
            personnelType,
            input.blockedPersonnelDates ?? new Map<string, Set<string>>(),
          );

          lines.push({
            key: `${device.id}:${date}:${shiftType}:${personnelType}`,
            date,
            shiftType,
            personnelType,
            deviceId: device.id,
            deviceName: device.name,
            required,
            assigned: Math.min(assigned, required),
            shortfall: Math.max(required - Math.min(assigned, required), 0),
          });
        }
      }
    }

    lines.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.deviceId.localeCompare(b.deviceId) ||
        a.shiftType.localeCompare(b.shiftType) ||
        a.personnelType.localeCompare(b.personnelType),
    );

    const underCoverage = lines.filter(l => l.shortfall > 0);
    const requiredSlots = lines.reduce((sum, l) => sum + l.required, 0);
    const assignedSlots = lines.reduce((sum, l) => sum + l.assigned, 0);
    const coveragePercent =
      requiredSlots === 0 ? 100 : Math.round((assignedSlots / requiredSlots) * 100);

    const uncoveredDates: string[] = [];
    for (const line of underCoverage) {
      if (!uncoveredDates.includes(line.date)) uncoveredDates.push(line.date);
    }

    return {
      lines,
      underCoverage,
      requiredSlots,
      assignedSlots,
      coveragePercent,
      allCovered: underCoverage.length === 0,
      uncoveredDates,
    };
  }

  private countAssigned(
    assignments: CoverageAssignmentInput[],
    deviceId: string,
    date: string,
    shiftType: string,
    personnelType: string,
    blocked: Map<string, Set<string>>,
  ): number {
    let count = 0;
    for (const a of assignments) {
      if (a.deviceId !== deviceId) continue;
      if (a.date !== date) continue;
      if (normalizeShiftType(a.shiftType) !== shiftType) continue;
      if (normalizePersonnelType(a.personnelType) !== personnelType) continue;
      if (blocked.get(a.personnelId)?.has(date)) continue;
      count++;
    }
    return count;
  }
}

function tierOperationalCount(
  personnelType: string,
  input: CoverageInput,
): number {
  if (personnelType === COVERAGE_TECHNICIAN_PERSONNEL_TYPE) return input.technicianPersonnelCount;
  if (personnelType === COVERAGE_ASSISTANT_PERSONNEL_TYPE) return input.assistantPersonnelCount;
  if (personnelType === COVERAGE_SUPERVISOR_PERSONNEL_TYPE) return input.supervisorPersonnelCount;
  return 0;
}

function normalizePersonnelType(value?: string): string {
  const v = (value || '').trim();
  if (!v) return COVERAGE_TECHNICIAN_PERSONNEL_TYPE;
  const lower = v.toLowerCase();
  if (lower === 'senior_technician' || lower.startsWith('technician_')) {
    return COVERAGE_TECHNICIAN_PERSONNEL_TYPE;
  }
  if (lower === 'assistant' || lower === 'assistant-technician' || lower === 'yardımcı') {
    return COVERAGE_ASSISTANT_PERSONNEL_TYPE;
  }
  return v;
}

function normalizeShiftType(value?: string): string {
  const v = (value || '').trim().toLowerCase();
  if (!v) return 'day';
  return SHIFT_ALIASES[v] ?? v;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}