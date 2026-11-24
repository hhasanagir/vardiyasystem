import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addDays,
  dateKey,
  dayOfWeek,
  parseDateParts,
  startOfWeek,
  todayKey,
  toDateKey,
} from '../domain/value-objects/local-date';

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('P2-12 — local calendar keys', () => {
  it('keeps weekday and date arithmetic stable in a negative UTC offset', () => {
    process.env.TZ = 'America/New_York';

    // Legacy behaviour would report Sunday (0) for this Monday.
    expect(new Date('2026-11-16').getDay()).toBe(0);
    expect(dayOfWeek('2026-11-16')).toBe(1);

    expect(addDays('2026-11-16', -1)).toBe('2026-11-15');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // Sunday -> Monday
    expect(toDateKey(new Date(2026, 10, 16, 23, 30))).toBe('2026-11-16');
    expect(parseDateParts('2026-11-16T23:30:00.000Z')).toEqual({ year: 2026, month: 11, day: 16 });
    expect(dateKey(2026, 11, 16)).toBe('2026-11-16');
  });

  it('uses local parts for "today" instead of UTC', () => {
    process.env.TZ = 'America/New_York';
    // 02:30 UTC is still the previous calendar day in New York.
    expect(todayKey(new Date('2026-11-16T02:30:00Z'))).toBe('2026-11-15');
  });

  it('removes UTC date arithmetic from production schedule code', () => {
    const root = process.cwd();
    const files = [
      'src/modules/schedules/schedules.service.ts',
      'src/modules/schedules/schedule-auto-generator.service.ts',
      'src/modules/schedules/domain/models/fatigue-engine.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source, `${file} must not use toISOString date keys`).not.toContain("toISOString().split('T')[0]");
      expect(source, `${file} must not parse date keys as UTC`).not.toContain('new Date(dto.date).getDay()');
      expect(source, `${file} must not parse date keys as UTC`).not.toContain('new Date(dateStr).getDay()');
      expect(source, `${file} must not parse date keys as UTC`).not.toContain('new Date(a.date).getDay()');
    }
  });
});
