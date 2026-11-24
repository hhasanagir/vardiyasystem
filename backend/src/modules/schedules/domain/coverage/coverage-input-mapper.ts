/**
 * P3-11 — shared adapter from persisted roster/assignment rows to the single
 * CoverageEngine input contract.
 *
 * Pure and deterministic. No I/O, no clock, no ordering side effects. The
 * CoverageEngine remains the ONLY place that decides how many people a slot
 * needs and which dates/shifts are in scope; this mapper only normalises row
 * shapes into `CoverageAssignmentInput`.
 */

import {
  COVERAGE_ASSISTANT_PERSONNEL_TYPE,
  COVERAGE_SUPERVISOR_PERSONNEL_TYPE,
  COVERAGE_TECHNICIAN_PERSONNEL_TYPE,
  CoverageAssignmentInput,
} from './coverage-types';

export interface CoverageRowLike {
  personnelId: string;
  deviceId?: string | null;
  date: string | Date;
  shiftType?: string | null;
  personnelType?: string | null;
  /** DutyRoster rows carry `role` instead of `personnelType`. */
  role?: string | null;
}

/** Map one persisted row. Rows without a device cannot satisfy a device slot. */
export function toCoverageAssignmentInput(row: CoverageRowLike): CoverageAssignmentInput | null {
  if (!row.deviceId) return null;
  return {
    personnelId: row.personnelId,
    deviceId: row.deviceId,
    date: normalizeDate(row.date),
    shiftType: row.shiftType || 'day',
    personnelType: normalizePersonnelType(row),
  };
}

/**
 * Batch variant with stable deduplication: the same person/device/date/shift/tier
 * row appearing in both a schedule assignment and a duty roster is one
 * assignment, never two. This prevents the single-source coverage calculation
 * from being inflated by duplicate overlays.
 */
export function toCoverageAssignmentInputs(rows: readonly CoverageRowLike[]): CoverageAssignmentInput[] {
  const seen = new Set<string>();
  const result: CoverageAssignmentInput[] = [];

  for (const row of rows) {
    const mapped = toCoverageAssignmentInput(row);
    if (!mapped) continue;
    const key = [
      mapped.personnelId,
      mapped.deviceId,
      mapped.date,
      mapped.shiftType,
      mapped.personnelType,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mapped);
  }

  return result;
}

function normalizeDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Persisted dates are already `YYYY-MM-DD`; keep the canonical string form.
  return value.slice(0, 10);
}

function normalizePersonnelType(row: CoverageRowLike): string {
  if (row.personnelType) return row.personnelType;
  switch ((row.role || '').toLowerCase()) {
    case 'sorumlu_tekniker':
    case 'tekniker':
    case 'radyolog':
      return COVERAGE_TECHNICIAN_PERSONNEL_TYPE;
    case 'yardimci_tekniker':
    case 'assistant_technician':
      return COVERAGE_ASSISTANT_PERSONNEL_TYPE;
    case 'supervisor':
      return COVERAGE_SUPERVISOR_PERSONNEL_TYPE;
    default:
      return COVERAGE_TECHNICIAN_PERSONNEL_TYPE;
  }
}
