import type { AssignmentDTO } from '../models';

export interface GridDay {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isToday: boolean;
  label: string;
}

export interface GridRow {
  personnelId: string;
  personnelName: string;
  groupId: string | null;
  groupName: string;
  assignments: Map<string, AssignmentDTO>;
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTH_LABELS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function getDaysInMonth(year: number, month: number): GridDay[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split('T')[0];
  const days: GridDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const jsDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    days.push({
      date: dateStr,
      dayOfMonth: d,
      dayOfWeek: jsDay,
      isWeekend: jsDay >= 5,
      isToday: dateStr === today,
      label: DAY_LABELS[jsDay],
    });
  }
  return days;
}

export function buildGridRows(
  assignments: AssignmentDTO[],
  personnelNames: Map<string, string>,
  groupNames: Map<string, string>,
): GridRow[] {
  const rowMap = new Map<string, GridRow>();

  for (const a of assignments) {
    if (!rowMap.has(a.personnelId)) {
      rowMap.set(a.personnelId, {
        personnelId: a.personnelId,
        personnelName: a.personnelName ?? personnelNames.get(a.personnelId) ?? a.personnelId,
        groupId: a.personnelGroupId,
        groupName: a.personnelGroupId ? (groupNames.get(a.personnelGroupId) ?? '') : '',
        assignments: new Map(),
      });
    }
    const row = rowMap.get(a.personnelId)!;
    const key = `${a.date}-${a.shiftType}`;
    row.assignments.set(key, a);
  }

  return Array.from(rowMap.values()).sort((a, b) =>
    a.personnelName.localeCompare(b.personnelName, 'tr'),
  );
}

export function getMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? '';
}

export function getAssignmentForCell(
  row: GridRow,
  date: string,
  shiftType?: string,
): AssignmentDTO | undefined {
  if (shiftType) {
    return row.assignments.get(`${date}-${shiftType}`);
  }
  for (const [key, a] of row.assignments) {
    if (key.startsWith(date)) return a;
  }
  return undefined;
}

export const SHIFT_TYPES_WORK = ['day', 'morning', 'evening', 'night'] as const;
export const SHIFT_TYPE_LABELS: Record<string, string> = {
  day: 'Gündüz',
  morning: 'Sabah',
  evening: 'Akşam',
  night: 'Gece',
  off: 'İzin',
  leave: 'Raporlu',
  sick: 'Hasta',
  training: 'Eğitim',
  backup: 'Yedek',
};
export const SHIFT_TYPE_COLORS: Record<string, string> = {
  day: '#fbbf24',
  morning: '#22d3ee',
  evening: '#f97316',
  night: '#6366f1',
  off: '#94a3b8',
  leave: '#a78bfa',
  sick: '#f87171',
  training: '#34d399',
  backup: '#8b5cf6',
};
