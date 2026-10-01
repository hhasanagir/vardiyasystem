import type { UnitType } from '../enums';
import type { HolidayInfo } from '../models';
import { ShiftTypeEnum, type ShiftType } from '../enums';

export * from './scheduling-constraints';

export const CONSTRAINT_LIMITS = {
  MIN_REST_HOURS: 11,
  MAX_WEEKLY_SHIFTS: 6,
  MAX_NIGHT_SHIFTS_WEEKLY: 3,
  MAX_CONSECUTIVE_DAYS: 6,
  MAX_WEEKLY_HOURS: 48,
  MIN_ADVANCE_NOTICE_DAYS: 7,
} as const;

export const SHIFT_TIMES = {
  day: { start: 8, end: 20, label: 'Gündüz', icon: '☀️' },
  evening: { start: 16, end: 24, label: 'Akşam', icon: '🌅' },
  night: { start: 20, end: 8, label: 'Gece', icon: '🌙' },
} as const;

export interface ShiftDefinition {
  type: ShiftType;
  label: string;
  startHour: number;
  endHour: number;
  shortLabel: string;
}

export const UNIT_SHIFT_CONFIGS: Record<UnitType, ShiftDefinition[]> = {
  mr: [
    { type: ShiftTypeEnum.DAY, label: 'Gündüz', startHour: 8, endHour: 20, shortLabel: 'G' },
    { type: ShiftTypeEnum.NIGHT, label: 'Gece', startHour: 20, endHour: 8, shortLabel: 'Ge' },
  ],
  bt: [
    { type: ShiftTypeEnum.DAY, label: 'Gündüz', startHour: 8, endHour: 20, shortLabel: 'G' },
    { type: ShiftTypeEnum.NIGHT, label: 'Gece', startHour: 20, endHour: 8, shortLabel: 'Ge' },
  ],
  rontgen: [
    { type: ShiftTypeEnum.DAY, label: 'Gündüz', startHour: 8, endHour: 20, shortLabel: 'G' },
    { type: ShiftTypeEnum.NIGHT, label: 'Gece', startHour: 20, endHour: 8, shortLabel: 'Ge' },
  ],
  nukleer: [
    { type: ShiftTypeEnum.DAY, label: 'Gündüz', startHour: 8, endHour: 20, shortLabel: 'G' },
  ],
  onkoloji: [
    {
      type: 'sabah' as unknown as ShiftType,
      label: 'Sabah',
      startHour: 8,
      endHour: 14,
      shortLabel: 'S',
    },
    {
      type: 'ogle' as unknown as ShiftType,
      label: 'Öğleden',
      startHour: 14,
      endHour: 20,
      shortLabel: 'Ö',
    },
    {
      type: 'aksam' as unknown as ShiftType,
      label: 'Akşam',
      startHour: 20,
      endHour: 2,
      shortLabel: 'A',
    },
  ],
  supervizor: [
    { type: ShiftTypeEnum.DAY, label: 'Gündüz', startHour: 8, endHour: 20, shortLabel: 'G' },
    { type: ShiftTypeEnum.NIGHT, label: 'Gece', startHour: 20, endHour: 8, shortLabel: 'Ge' },
  ],
};

export function getShiftConfigForUnit(unit: UnitType): ShiftDefinition[] {
  return UNIT_SHIFT_CONFIGS[unit] || UNIT_SHIFT_CONFIGS.mr;
}

export function getShiftConfigForDevice(device: {
  mode: 'vardiya' | 'polyclinic';
  tripleShift?: boolean;
  unit: UnitType;
}): ShiftDefinition[] {
  if (device.unit === 'onkoloji') {
    return UNIT_SHIFT_CONFIGS.onkoloji;
  }
  if (device.mode === 'polyclinic') {
    return [UNIT_SHIFT_CONFIGS[device.unit]?.[0] || UNIT_SHIFT_CONFIGS.mr[0]];
  }
  return UNIT_SHIFT_CONFIGS[device.unit] || UNIT_SHIFT_CONFIGS.mr;
}

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  Gündüz: 'Gündüz',
  Gece: 'Gece',
  Akşam: 'Akşam',
  Sabah: 'Sabah',
  Öğleden: 'Öğleden',
  day: 'Gündüz',
  night: 'Gece',
  evening: 'Akşam',
  sabah: 'Sabah',
  ogle: 'Öğleden',
  aksam: 'Akşam',
};

export const UNIT_COLORS: Record<UnitType, string> = {
  mr: '#3b82f6',
  bt: '#14b8a6',
  rontgen: '#f97316',
  nukleer: '#22c55e',
  onkoloji: '#ec4899',
  supervizor: '#8b5cf6',
} as const;

export const UNIT_CONFIG: Record<UnitType, UnitConfig> = {
  mr: {
    label: 'MR',
    color: '#3b82f6',
    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
    deviceCount: 8,
    mode: 'vardiya',
  },
  bt: {
    label: 'BT',
    color: '#14b8a6',
    icon: 'M2 3h20v14H2zm10 14h8',
    deviceCount: 7,
    mode: 'vardiya',
  },
  rontgen: {
    label: 'RÖ',
    color: '#f97316',
    icon: 'M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4',
    deviceCount: 26,
    mode: 'vardiya',
  },
  nukleer: {
    label: 'NT',
    color: '#22c55e',
    icon: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    deviceCount: 6,
    mode: 'polyclinic',
  },
  onkoloji: {
    label: 'RONK',
    color: '#ec4899',
    icon: 'M12 2v20M2 12h20',
    deviceCount: 4,
    mode: 'vardiya',
  },
  supervizor: {
    label: 'Süpervizör',
    color: '#8b5cf6',
    icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    deviceCount: 5,
    mode: 'vardiya',
  },
} as const;

export interface UnitConfig {
  label: string;
  color: string;
  icon: string;
  deviceCount: number;
  mode: 'vardiya' | 'polyclinic';
}

export const TURKISH_HOLIDAYS_2026: HolidayInfo[] = [
  { date: '2026-01-01', name: 'Yılbaşı', type: 'national' },
  { date: '2026-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı', type: 'national' },
  { date: '2026-05-01', name: 'Emek ve Dayanışma Günü', type: 'national' },
  { date: '2026-05-19', name: "Atatürk'ü Anma ve Gençlik ve Spor Bayramı", type: 'national' },
  { date: '2026-06-15', name: 'Kurban Bayramı Arifesi', type: 'religious' },
  { date: '2026-06-16', name: 'Kurban Bayramı 1. Gün', type: 'religious' },
  { date: '2026-06-17', name: 'Kurban Bayramı 2. Gün', type: 'religious' },
  { date: '2026-06-18', name: 'Kurban Bayramı 3. Gün', type: 'religious' },
  { date: '2026-06-19', name: 'Kurban Bayramı 4. Gün', type: 'religious' },
  { date: '2026-07-15', name: 'Demokrasi ve Milli Birlik Günü', type: 'national' },
  { date: '2026-08-30', name: 'Zafer Bayramı', type: 'national' },
  { date: '2026-09-06', name: 'Hicri Yılbaşı', type: 'religious' },
  { date: '2026-09-13', name: 'Arefe', type: 'religious' },
  { date: '2026-09-14', name: 'Ramazan Bayramı 1. Gün', type: 'religious' },
  { date: '2026-09-15', name: 'Ramazan Bayramı 2. Gün', type: 'religious' },
  { date: '2026-09-16', name: 'Ramazan Bayramı 3. Gün', type: 'religious' },
  { date: '2026-10-29', name: 'Cumhuriyet Bayramı', type: 'national' },
];

export const HOLIDAY_COLORS = {
  national: '#dc2626',
  religious: '#eab308',
} as const;

export const RESTRICTION_MESSAGES = {
  MIN_REST: `Minimum ${CONSTRAINT_LIMITS.MIN_REST_HOURS} saat dinlenme süresi gereklidir`,
  NO_NIGHT_TO_DAY: 'Gece vardiyasından sonra gündüz vardiyası atanamaz',
  MAX_WEEKLY_SHIFTS: `Haftada en fazla ${CONSTRAINT_LIMITS.MAX_WEEKLY_SHIFTS} vardiya atanabilir`,
  MAX_NIGHT_SHIFTS: `Haftada en fazla ${CONSTRAINT_LIMITS.MAX_NIGHT_SHIFTS_WEEKLY} gece vardiyası atanabilir`,
  SKILL_GAP: 'Personel cihaz için gerekli yetkinliklere sahip değil',
  LEAVE_CONFLICT: 'Bu tarihte izin kayıtlı',
  COVERAGE_GAP: 'Bu cihazda personel ataması yapılmamış',
} as const;
