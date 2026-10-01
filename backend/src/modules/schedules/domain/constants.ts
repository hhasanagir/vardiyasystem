export const MIN_REST_HOURS = 11;
export const REQUIRED_REST_HOURS = 11;
export const NIGHT_TO_DAY_REST_HOURS = 24;
export const MAX_CONSECUTIVE_NIGHTS = 3;
export const STANDARD_SHIFT_HOURS = 8;
export const MINUTES_PER_DAY = 1440;
export const DEFAULT_SHIFT_MINUTES = 480;
export const MONTHLY_HOUR_BASELINE = 160;
export const OVERTIME_THRESHOLD_HOURS = 200;
export const SHIFT_COUNT_THRESHOLD = 25;
export const UPCOMING_LIMIT = 10;

export const IDEMPOTENCY_TTL_MS = 300_000;

export const DEFAULT_PAGE_TAKE = 100;
export const MAX_PAGE_TAKE = 500;

export const OVERRIDE_ROLES = [
  'system_admin',
  'hospital_admin',
  'imaging_director',
  'supervisor',
] as const;

export const SHIFT_TYPES_OFF = [
  'off',
  'leave',
  'sick',
  'training',
  'backup',
] as const;

export const GENERATION_DEFAULTS = {
  MAX_WORKLOAD_PER_PERSON: 20,
  MIN_REST_HOURS: 11,
  NIGHT_ELIGIBILITY_MIN_SENIORITY: 6,
  MAX_CONSECUTIVE_DAYS: 3,
} as const;
