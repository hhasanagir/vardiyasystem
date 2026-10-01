import { describe, it, expect } from 'vitest';
import { AssignmentDate } from '../domain/value-objects/assignment-date.value-object';
import { WorkDuration } from '../domain/value-objects/work-duration.value-object';
import { RestDuration } from '../domain/value-objects/rest-duration.value-object';
import { Score } from '../domain/value-objects/score.value-object';
import { DateRange } from '../domain/value-objects/date-range.value-object';
import { DeviceId } from '../domain/value-objects/device-id.value-object';
import { PersonnelId } from '../domain/value-objects/personnel-id.value-object';

describe('Value Objects', () => {
  describe('AssignmentDate', () => {
    it('creates valid date', () => {
      const d = AssignmentDate.create('2026-08-15');
      expect(d.value).toBe('2026-08-15');
      expect(d.year).toBe(2026);
      expect(d.month).toBe(8);
      expect(d.day).toBe(15);
    });

    it('rejects invalid format', () => {
      expect(() => AssignmentDate.create('2026/08/15')).toThrow(
        'Invalid date format',
      );
    });

    it('rejects invalid day', () => {
      expect(() => AssignmentDate.create('2026-02-30')).toThrow('Invalid day');
    });

    it('detects weekend', () => {
      const friday = AssignmentDate.create('2026-08-21');
      expect(friday.isFriday).toBe(true);
    });

    it('adds days correctly', () => {
      const d = AssignmentDate.create('2026-08-15');
      const next = d.addDays(5);
      expect(next.value).toBe('2026-08-20');
    });
  });

  describe('WorkDuration', () => {
    it('creates valid duration', () => {
      const w = WorkDuration.create(8);
      expect(w.hours).toBe(8);
      expect(w.minutes).toBe(480);
    });

    it('rejects negative', () => {
      expect(() => WorkDuration.create(-1)).toThrow('negative');
    });

    it('rejects > 24h', () => {
      expect(() => WorkDuration.create(25)).toThrow('24 hours');
    });

    it('checks limit', () => {
      expect(WorkDuration.create(8).isWithinLimit(10)).toBe(true);
      expect(WorkDuration.create(12).isWithinLimit(10)).toBe(false);
    });
  });

  describe('RestDuration', () => {
    it('creates valid rest', () => {
      const r = RestDuration.create(11);
      expect(r.hours).toBe(11);
    });

    it('checks sufficiency', () => {
      expect(RestDuration.create(11).isSufficient(11)).toBe(true);
      expect(RestDuration.create(8).isSufficient(11)).toBe(false);
    });

    it('REQUIRED returns 11h', () => {
      expect(RestDuration.REQUIRED().hours).toBe(11);
    });
  });

  describe('Score', () => {
    it('creates valid score', () => {
      const s = Score.create(85, 100);
      expect(s.scoreValue).toBe(85);
      expect(s.percentage).toBe(85);
    });

    it('grades correctly', () => {
      expect(Score.create(95).grade()).toBe('A');
      expect(Score.create(85).grade()).toBe('B');
      expect(Score.create(75).grade()).toBe('C');
      expect(Score.create(65).grade()).toBe('D');
      expect(Score.create(50).grade()).toBe('F');
    });

    it('rejects negative', () => {
      expect(() => Score.create(-1)).toThrow('negative');
    });

    it('rejects > max', () => {
      expect(() => Score.create(101, 100)).toThrow('exceed');
    });
  });

  describe('DateRange', () => {
    it('creates valid range', () => {
      const r = DateRange.create('2026-08-01', '2026-08-31');
      expect(r.start).toBe('2026-08-01');
      expect(r.end).toBe('2026-08-31');
    });

    it('calculates days', () => {
      const r = DateRange.create('2026-08-01', '2026-08-03');
      expect(r.days()).toBe(3);
    });

    it('detects containment', () => {
      const r = DateRange.create('2026-08-01', '2026-08-31');
      expect(r.contains('2026-08-15')).toBe(true);
      expect(r.contains('2026-09-01')).toBe(false);
    });

    it('detects overlap', () => {
      const r1 = DateRange.create('2026-08-01', '2026-08-15');
      const r2 = DateRange.create('2026-08-10', '2026-08-20');
      expect(r1.overlaps(r2)).toBe(true);
    });

    it('rejects start > end', () => {
      expect(() => DateRange.create('2026-08-31', '2026-08-01')).toThrow();
    });
  });
});
