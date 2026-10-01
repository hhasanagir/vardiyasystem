import type { HolidayInfo } from '../../domain/models';

const FIXED_NATIONAL: Array<{ month: number; day: number; name: string }> = [
  { month: 1,  day: 1,  name: 'Yılbaşı' },
  { month: 4,  day: 23, name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { month: 5,  day: 1,  name: 'Emek ve Dayanışma Günü' },
  { month: 5,  day: 19, name: "Atatürk'ü Anma ve Gençlik ve Spor Bayramı" },
  { month: 7,  day: 15, name: 'Demokrasi ve Milli Birlik Günü' },
  { month: 8,  day: 30, name: 'Zafer Bayramı' },
  { month: 10, day: 29, name: 'Cumhuriyet Bayramı' },
];

function generateNational(year: number): HolidayInfo[] {
  return FIXED_NATIONAL.map(h => ({
    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
    name: h.name,
    type: 'national' as const,
  }));
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

const RELIGIOUS: Array<{ year: number; month: number; day: number; name: string }> = [
  { year: 2026, month: 6,  day: 15, name: 'Kurban Bayramı Arifesi' },
  { year: 2026, month: 6,  day: 16, name: 'Kurban Bayramı 1. Gün' },
  { year: 2026, month: 6,  day: 17, name: 'Kurban Bayramı 2. Gün' },
  { year: 2026, month: 6,  day: 18, name: 'Kurban Bayramı 3. Gün' },
  { year: 2026, month: 6,  day: 19, name: 'Kurban Bayramı 4. Gün' },
  { year: 2026, month: 9,  day: 6,  name: 'Hicri Yılbaşı' },
  { year: 2026, month: 9,  day: 13, name: 'Arefe' },
  { year: 2026, month: 9,  day: 14, name: 'Ramazan Bayramı 1. Gün' },
  { year: 2026, month: 9,  day: 15, name: 'Ramazan Bayramı 2. Gün' },
  { year: 2026, month: 9,  day: 16, name: 'Ramazan Bayramı 3. Gün' },

  { year: 2027, month: 6,  day: 4,  name: 'Kurban Bayramı Arifesi' },
  { year: 2027, month: 6,  day: 5,  name: 'Kurban Bayramı 1. Gün' },
  { year: 2027, month: 6,  day: 6,  name: 'Kurban Bayramı 2. Gün' },
  { year: 2027, month: 6,  day: 7,  name: 'Kurban Bayramı 3. Gün' },
  { year: 2027, month: 6,  day: 8,  name: 'Kurban Bayramı 4. Gün' },
  { year: 2027, month: 8,  day: 26, name: 'Hicri Yılbaşı' },
  { year: 2027, month: 9,  day: 1,  name: 'Arefe' },
  { year: 2027, month: 9,  day: 2,  name: 'Ramazan Bayramı 1. Gün' },
  { year: 2027, month: 9,  day: 3,  name: 'Ramazan Bayramı 2. Gün' },
  { year: 2027, month: 9,  day: 4,  name: 'Ramazan Bayramı 3. Gün' },

  { year: 2028, month: 5,  day: 23, name: 'Kurban Bayramı Arifesi' },
  { year: 2028, month: 5,  day: 24, name: 'Kurban Bayramı 1. Gün' },
  { year: 2028, month: 5,  day: 25, name: 'Kurban Bayramı 2. Gün' },
  { year: 2028, month: 5,  day: 26, name: 'Kurban Bayramı 3. Gün' },
  { year: 2028, month: 5,  day: 27, name: 'Kurban Bayramı 4. Gün' },
  { year: 2028, month: 8,  day: 14, name: 'Hicri Yılbaşı' },
  { year: 2028, month: 8,  day: 21, name: 'Arefe' },
  { year: 2028, month: 8,  day: 22, name: 'Ramazan Bayramı 1. Gün' },
  { year: 2028, month: 8,  day: 23, name: 'Ramazan Bayramı 2. Gün' },
  { year: 2028, month: 8,  day: 24, name: 'Ramazan Bayramı 3. Gün' },

  { year: 2029, month: 5,  day: 12, name: 'Kurban Bayramı Arifesi' },
  { year: 2029, month: 5,  day: 13, name: 'Kurban Bayramı 1. Gün' },
  { year: 2029, month: 5,  day: 14, name: 'Kurban Bayramı 2. Gün' },
  { year: 2029, month: 5,  day: 15, name: 'Kurban Bayramı 3. Gün' },
  { year: 2029, month: 5,  day: 16, name: 'Kurban Bayramı 4. Gün' },
  { year: 2029, month: 8,  day: 3,  name: 'Hicri Yılbaşı' },
  { year: 2029, month: 8,  day: 10, name: 'Arefe' },
  { year: 2029, month: 8,  day: 11, name: 'Ramazan Bayramı 1. Gün' },
  { year: 2029, month: 8,  day: 12, name: 'Ramazan Bayramı 2. Gün' },
  { year: 2029, month: 8,  day: 13, name: 'Ramazan Bayramı 3. Gün' },
];

const CACHED: Map<number, HolidayInfo[]> = new Map();

export function getAllHolidays(): HolidayInfo[] {
  const years = [2026, 2027, 2028, 2029];
  const all: HolidayInfo[] = [];
  for (const y of years) {
    all.push(...getHolidaysForYear(y));
  }
  return all;
}

export function getHolidaysForYear(year: number): HolidayInfo[] {
  if (CACHED.has(year)) return CACHED.get(year)!;
  const national = generateNational(year);
  const religious = RELIGIOUS.filter(h => h.year === year).map(h => ({
    date: `${h.year}-${pad(h.month)}-${pad(h.day)}`,
    name: h.name,
    type: 'religious' as const,
  }));
  const result = [...national, ...religious].sort((a, b) => a.date.localeCompare(b.date));
  CACHED.set(year, result);
  return result;
}

export function getHoliday(dateStr: string): HolidayInfo | undefined {
  return getAllHolidays().find(h => h.date === dateStr);
}

export function isHoliday(dateStr: string): boolean {
  return !!getHoliday(dateStr);
}

export function getHolidayCountForMonth(year: number, month: number): number {
  const prefix = `${year}-${pad(month)}`;
  return getAllHolidays().filter(h => h.date.startsWith(prefix)).length;
}

export { HOLIDAY_COLORS } from '../../domain/rules';
