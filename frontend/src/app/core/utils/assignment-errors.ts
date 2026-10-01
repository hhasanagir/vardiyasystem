const SHIFT_TR: Record<string, string> = {
  day: 'Gündüz',
  gunduz: 'Gündüz',
  night: 'Gece',
  gece: 'Gece',
  evening: 'İkindi',
  ikindi: 'İkindi',
  aksam: 'İkindi',
  sabah: 'Sabah',
  morning: 'Sabah',
  off: 'İzin',
  leave: 'İzin',
};

export function shiftNameTR(s: string | null | undefined): string {
  if (!s) return '';
  return SHIFT_TR[s.toLowerCase()] || s;
}

export function formatDateTR(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function normalizeShift(s: string): string {
  const map: Record<string, string> = { gunduz: 'day', gece: 'night', sabah: 'morning', ikindi: 'evening', aksam: 'evening' };
  return map[s.toLowerCase()] || s;
}

export function shiftsMatch(a: string, b: string): boolean {
  return normalizeShift(a) === normalizeShift(b);
}

export interface TranslatedError {
  title: string;
  message: string;
}

const ASSIGNED_RE = /Personnel is already assigned to (\w+) shift on (\d{4}-\d{2}-\d{2})/i;
const DEVICE_BOOKED_RE = /Device is already booked for (\w+) shift on (\d{4}-\d{2}-\d{2})/i;

export function translateAssignmentError(raw: string | null | undefined): TranslatedError | null {
  const m = raw || '';
  if (!m) return null;

  const already = ASSIGNED_RE.exec(m);
  if (already) {
    return { title: 'Çakışma', message: `Bu personel ${formatDateTR(already[2])} tarihinde zaten ${shiftNameTR(already[1])} vardiyasına atanmıştır.` };
  }
  const device = DEVICE_BOOKED_RE.exec(m);
  if (device) {
    return { title: 'Cihaz Dolu', message: `Bu cihaz ${formatDateTR(device[2])} tarihinde ${shiftNameTR(device[1])} vardiyası için zaten dolu.` };
  }
  if (/personnel is inactive/i.test(m)) {
    return { title: 'Atama Engellendi', message: 'Pasif durumdaki personel atanamaz.' };
  }
  if (/off day/i.test(m)) {
    return { title: 'İzin Günü', message: 'Bu personelin seçilen tarihte izin günü bulunuyor.' };
  }
  if (/rest violation/i.test(m) || /night shift on previous day/i.test(m)) {
    return { title: 'Dinlenme Kuralı', message: 'Önceki gün gece vardiyası çalışan personel, ertesi gün gündüz vardiyasına atanamaz.' };
  }
  return null;
}

export function conflictMessageFor(
  existingAssignments: Array<{ personnelId: string; personnelName?: string; date: string; shiftType: string }>,
  personnelId: string,
  personnelName: string,
  date: string,
  shiftType: string,
): string | null {
  const sameDay = existingAssignments.filter(a => a.personnelId === personnelId && a.date === date);
  for (const a of sameDay) {
    if (shiftsMatch(a.shiftType, shiftType)) {
      return `${personnelName} ${formatDateTR(date)} tarihinde zaten ${shiftNameTR(shiftType)} vardiyasına atanmıştır.`;
    }
  }
  if (sameDay.length > 0) {
    return `${personnelName} ${formatDateTR(date)} tarihinde başka bir vardiyaya atanmıştır.`;
  }
  return null;
}

export function deviceBookedMessageFor(
  existingAssignments: Array<{ personnelId: string; personnelName?: string; deviceId: string; date: string; shiftType: string; personnelType?: string | null }>,
  deviceId: string,
  personnelId: string,
  date: string,
  shiftType: string,
  personnelType: string | null | undefined,
): string | null {
  const pt = personnelType || null;
  if (!pt) return null;
  const booked = existingAssignments.find(a =>
    a.personnelId !== personnelId &&
    a.deviceId === deviceId &&
    a.date === date &&
    shiftsMatch(a.shiftType, shiftType) &&
    (a.personnelType || null) === pt
  );
  if (!booked) return null;
  return `Bu cihaz ${formatDateTR(date)} tarihinde ${shiftNameTR(shiftType)} vardiyası için zaten dolu.`;
}
