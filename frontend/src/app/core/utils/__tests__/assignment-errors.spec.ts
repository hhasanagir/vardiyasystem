import { describe, it, expect } from 'vitest';
import {
  shiftNameTR,
  formatDateTR,
  normalizeShift,
  shiftsMatch,
  translateAssignmentError,
  conflictMessageFor,
  deviceBookedMessageFor,
} from '../assignment-errors';

describe('assignment-errors utils', () => {
  describe('shiftNameTR', () => {
    it('should translate known shifts', () => {
      expect(shiftNameTR('day')).toBe('Gündüz');
      expect(shiftNameTR('gece')).toBe('Gece');
      expect(shiftNameTR('ikindi')).toBe('İkindi');
      expect(shiftNameTR('morning')).toBe('Sabah');
    });

    it('should fall back to raw value', () => {
      expect(shiftNameTR('weekend')).toBe('weekend');
      expect(shiftNameTR('')).toBe('');
      expect(shiftNameTR(null)).toBe('');
    });
  });

  describe('formatDateTR', () => {
    it('should format ISO date to Turkish', () => {
      expect(formatDateTR('2026-08-04')).toMatch(/4 Ağustos 2026/);
    });

    it('should return raw string for invalid dates', () => {
      expect(formatDateTR('garbage')).toBe('garbage');
    });
  });

  describe('normalizeShift / shiftsMatch', () => {
    it('should normalize Turkish shift names', () => {
      expect(normalizeShift('gunduz')).toBe('day');
      expect(normalizeShift('gece')).toBe('night');
      expect(normalizeShift('ikindi')).toBe('evening');
    });

    it('should pass through English shift names unchanged', () => {
      expect(normalizeShift('day')).toBe('day');
      expect(normalizeShift('DAY')).toBe('DAY');
    });

    it('should match Turkish and English shift names', () => {
      expect(shiftsMatch('gunduz', 'day')).toBe(true);
      expect(shiftsMatch('night', 'gece')).toBe(true);
      expect(shiftsMatch('day', 'night')).toBe(false);
    });
  });

  describe('translateAssignmentError', () => {
    it('should translate "already assigned" conflict', () => {
      const result = translateAssignmentError('Personnel is already assigned to day shift on 2026-08-04');
      expect(result).toEqual({
        title: 'Çakışma',
        message: expect.stringContaining('4 Ağustos 2026'),
      });
      expect(result?.message).toContain('Gündüz');
    });

    it('should translate "device booked" conflict', () => {
      const result = translateAssignmentError('Device is already booked for night shift on 2026-08-04');
      expect(result?.title).toBe('Cihaz Dolu');
      expect(result?.message).toContain('Gece');
    });

    it('should translate inactive personnel', () => {
      expect(translateAssignmentError('Personnel is inactive')?.title).toBe('Atama Engellendi');
    });

    it('should translate rest violation', () => {
      const result = translateAssignmentError('Personnel worked night shift on previous day - day shift not allowed (rest violation)');
      expect(result?.title).toBe('Dinlenme Kuralı');
    });

    it('should return null for unknown messages', () => {
      expect(translateAssignmentError('Beklenmeyen hata')).toBeNull();
      expect(translateAssignmentError('')).toBeNull();
      expect(translateAssignmentError(null)).toBeNull();
    });
  });

  describe('conflictMessageFor', () => {
    const existing = [
      { personnelId: 'p1', personnelName: 'Ahmet Yılmaz', date: '2026-08-04', shiftType: 'day' },
    ];

    it('should detect same-shift conflict on same day', () => {
      const msg = conflictMessageFor(existing, 'p1', 'Ahmet Yılmaz', '2026-08-04', 'day');
      expect(msg).toContain('Ahmet Yılmaz');
      expect(msg).toContain('4 Ağustos 2026');
      expect(msg).toContain('Gündüz');
    });

    it('should detect other-shift conflict on same day', () => {
      const msg = conflictMessageFor(existing, 'p1', 'Ahmet Yılmaz', '2026-08-04', 'night');
      expect(msg).toContain('başka bir vardiyaya');
    });

    it('should return null when no conflict', () => {
      expect(conflictMessageFor(existing, 'p2', 'Mehmet', '2026-08-04', 'day')).toBeNull();
      expect(conflictMessageFor(existing, 'p1', 'Ahmet Yılmaz', '2026-08-05', 'day')).toBeNull();
    });
  });

  describe('deviceBookedMessageFor', () => {
    const existing = [
      { personnelId: 'p1', personnelName: 'Ahmet Yılmaz', deviceId: 'dev-1', date: '2026-08-04', shiftType: 'day', personnelType: 'technician' },
    ];

    it('should detect another person booked on same device+date+shift+personnelType', () => {
      const msg = deviceBookedMessageFor(existing, 'dev-1', 'p2', '2026-08-04', 'day', 'technician');
      expect(msg).toContain('4 Ağustos 2026');
      expect(msg).toContain('Gündüz');
      expect(msg).toContain('zaten dolu');
    });

    it('should not flag the same person reassigning', () => {
      expect(deviceBookedMessageFor(existing, 'dev-1', 'p1', '2026-08-04', 'day', 'technician')).toBeNull();
    });

    it('should allow different personnelType on same slot', () => {
      expect(deviceBookedMessageFor(existing, 'dev-1', 'p2', '2026-08-04', 'day', 'assistant_technician')).toBeNull();
    });

    it('should allow same slot on another device or day or shift', () => {
      expect(deviceBookedMessageFor(existing, 'dev-2', 'p2', '2026-08-04', 'day', 'technician')).toBeNull();
      expect(deviceBookedMessageFor(existing, 'dev-1', 'p2', '2026-08-05', 'day', 'technician')).toBeNull();
      expect(deviceBookedMessageFor(existing, 'dev-1', 'p2', '2026-08-04', 'night', 'technician')).toBeNull();
    });

    it('should return null when personnelType is unknown', () => {
      expect(deviceBookedMessageFor(existing, 'dev-1', 'p2', '2026-08-04', 'day', null)).toBeNull();
    });
  });
});
