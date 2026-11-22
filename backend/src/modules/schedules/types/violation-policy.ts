import type { ViolationSeverity } from './violation.types';

export interface ViolationPolicyEntry {
  readonly severity: ViolationSeverity;
  readonly isOverrideAllowed: boolean;
}

const BLOCKING: ViolationPolicyEntry = Object.freeze({
  severity: 'BLOCKING',
  isOverrideAllowed: false,
});

const OVERRIDABLE_WARNING: ViolationPolicyEntry = Object.freeze({
  severity: 'WARNING',
  isOverrideAllowed: true,
});

/**
 * Single source of truth for validation severity/override behaviour across the
 * legacy validator (schedules.service.ts) and the DDD constraint engine.
 *
 * Where the two engines disagreed, the stricter side wins: BLOCKING beats
 * WARNING/INFO and isOverrideAllowed=false beats true. No rule is weakened.
 */
export const VIOLATION_POLICY: Readonly<Record<string, ViolationPolicyEntry>> = Object.freeze({
  PERSONNEL_NOT_FOUND: BLOCKING,
  DEVICE_REQUIRED: BLOCKING,
  DEVICE_BOOKED: BLOCKING,
  PERSON_DEVICE_NOT_ALLOWED: BLOCKING,
  PERSON_FIELDS_REQUIRED: BLOCKING,
  PERSONNEL_NOT_IN_UNIT: BLOCKING,
  PERSONNEL_NOT_IN_GROUP: BLOCKING,
  GROUP_NOT_FOUND: BLOCKING,
  GROUP_NOT_IN_UNIT: BLOCKING,
  TEMPLATE_NOT_FOUND: BLOCKING,
  TEMPLATE_NOT_IN_GROUP: BLOCKING,
  TEMPLATE_NOT_IN_UNIT: BLOCKING,
  TEMPLATE_SHIFT_MISMATCH: BLOCKING,
  GROUP_SLOT_OCCUPIED: BLOCKING,
  SAME_SLOT: BLOCKING,
  TIME_OVERLAP: BLOCKING,
  INACTIVE_PERSONNEL: BLOCKING,
  NOT_NIGHT_ELIGIBLE: BLOCKING,
  REST_RULE_VIOLATION: BLOCKING,
  DEVICE_OFF_DATE: BLOCKING,
  UNIT_CLOSED: BLOCKING,
  PERSONNEL_AVAILABILITY_CONFLICT: BLOCKING,
  // P2-14 / P2-11 — newly canonical hard rules. Registered explicitly so the
  // strictest-wins policy is authoritative even if a legacy surface emits one
  // of these codes as a warning or INFO.
  HOLIDAY_CONFLICT: BLOCKING,
  MAX_WORK_EXCEEDED: BLOCKING,

  // Both engines already agreed on these; keep their (overridable) severity.
  OFF_DAY_CONFLICT: OVERRIDABLE_WARNING,
  REQUIRED_REST_NOT_MET: OVERRIDABLE_WARNING,
});

/** Unknown rules fail closed — they can never be treated as an overridable warning. */
export function policyFor(rule: string): ViolationPolicyEntry {
  return VIOLATION_POLICY[rule] ?? BLOCKING;
}

export function normalizeViolationPolicy<
  T extends { rule: string; severity: ViolationSeverity; isOverrideAllowed: boolean },
>(violation: T): T {
  const policy = policyFor(violation.rule);
  return {
    ...violation,
    severity: policy.severity,
    isOverrideAllowed: policy.isOverrideAllowed,
  };
}
