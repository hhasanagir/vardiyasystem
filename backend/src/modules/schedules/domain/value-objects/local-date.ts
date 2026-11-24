/**
 * P2-12 — local (Europe/Istanbul) calendar keys for schedule dates.
 *
 * A schedule date is a plain `YYYY-MM-DD` calendar day, NOT an instant.
 * `new Date('YYYY-MM-DD')` parses as UTC midnight and `toISOString()` renders
 * UTC, so day arithmetic can shift by one in non-UTC offsets. All schedule
 * date keys are therefore built from local Y/M/D parts.
 */

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateParts(value: string | Date): LocalDateParts {
  if (value instanceof Date) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }
  const text = String(value ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return { year: 1970, month: 1, day: 1 };
  }
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Render a Date or a date string as a local calendar key (never UTC). */
export function toDateKey(value: string | Date): string {
  const parts = parseDateParts(value);
  return dateKey(parts.year, parts.month, parts.day);
}

/** 0=Sunday … 6=Saturday, computed from local calendar parts. */
export function dayOfWeek(value: string | Date): number {
  const parts = parseDateParts(value);
  return new Date(parts.year, parts.month - 1, parts.day).getDay();
}

export function addDays(value: string | Date, amount: number): string {
  const parts = parseDateParts(value);
  const date = new Date(parts.year, parts.month - 1, parts.day + amount);
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Calendar-day distance (`to - from`) between two local date keys.
 *
 * Built from Y/M/D parts via `Date.UTC` so daylight-saving transitions in the
 * deployment timezone cannot shift the by-one-day result of the older
 * `new Date('YYYY-MM-DD')` arithmetic.
 */
export function daysBetweenKeys(from: string, to: string): number {
  const a = parseDateParts(from);
  const b = parseDateParts(to);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((end - start) / 86_400_000);
}

/** Real calendar-day count for the scheduled month (leap-safe, no hardcode). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday-based start of the week containing the given date. */
export function startOfWeek(value: string | Date): string {
  const parts = parseDateParts(value);
  const weekday = dayOfWeek(value);
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return addDays(dateKey(parts.year, parts.month, parts.day), -daysFromMonday);
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}
