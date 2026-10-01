import { describe, it, expect } from 'vitest';
import {
  Schedule,
  ScheduleStatus,
} from '../domain/aggregates/schedule.aggregate';
import {
  Assignment,
  AssignmentSource,
} from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { AssignmentDate } from '../domain/value-objects/assignment-date.value-object';
import { PersonnelId } from '../domain/value-objects/personnel-id.value-object';

describe('Schedule Aggregate', () => {
  function createSchedule(
    overrides?: Partial<{ unitId: string; month: number; year: number }>,
  ): Schedule {
    return Schedule.create({
      unitId: overrides?.unitId || 'unit-1',
      month: overrides?.month || 8,
      year: overrides?.year || 2026,
      createdById: 'user-1',
    });
  }

  it('creates with draft status', () => {
    const s = createSchedule();
    expect(s.status).toBe('draft');
    expect(s.scheduleVersion).toBe(1);
  });

  it('transitions draft → under_review', () => {
    const s = createSchedule();
    s.submitForReview('user-1', 'Admin', 'supervisor');
    expect(s.status).toBe('under_review');
  });

  it('transitions under_review → approved', () => {
    const s = createSchedule();
    s.submitForReview('user-1', 'Admin', 'supervisor');
    s.approve('user-2', 'Director', 'imaging_director');
    expect(s.status).toBe('approved');
  });

  it('transitions under_review → rejected', () => {
    const s = createSchedule();
    s.submitForReview('user-1', 'Admin', 'supervisor');
    s.reject('user-2', 'Director', 'imaging_director', 'Needs work');
    expect(s.status).toBe('rejected');
  });

  it('transitions rejected → draft', () => {
    const s = createSchedule();
    s.submitForReview('user-1', 'Admin', 'supervisor');
    s.reject('user-2', 'Director', 'imaging_director', 'Needs work');
    s.revertToDraft('user-2', 'Director', 'imaging_director');
    expect(s.status).toBe('draft');
  });

  it('transitions approved → published', () => {
    const s = createSchedule();
    s.submitForReview('user-1', 'Admin', 'supervisor');
    s.approve('user-2', 'Director', 'imaging_director');
    s.publish('user-2', 'Director', 'imaging_director');
    expect(s.status).toBe('published');
  });

  it('rejects invalid transition', () => {
    const s = createSchedule();
    expect(() => s.approve('user-2', 'Director', 'imaging_director')).toThrow();
  });

  it('verifies version for optimistic locking', () => {
    const s = createSchedule();
    expect(() => s.verifyVersion(2)).toThrow();
    expect(() => s.verifyVersion(1)).not.toThrow();
  });

  it('adds assignment', () => {
    const s = createSchedule();
    const a = s.addAssignment(
      {
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
      'user-1',
    );
    expect(a).toBeDefined();
    expect(a.personnelId.value).toBe('p-1');
  });

  it('removes assignment', () => {
    const s = createSchedule();
    const a = s.addAssignment(
      {
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
      'user-1',
    );
    const removed = s.removeAssignment(a.id, 'user-1');
    expect(removed).toBeDefined();
  });

  it('creates schedule snapshot', () => {
    const s = createSchedule();
    s.addAssignment(
      {
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      },
      'user-1',
    );
    const snapshot = s.toSnapshot();
    expect(snapshot.assignments).toHaveLength(1);
  });

  it('emits domain events', () => {
    const s = createSchedule();
    const events = s.domainEvents;
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].eventName).toBe('ScheduleCreatedEvent');
  });
});

describe('Assignment Entity', () => {
  it('creates assignment with source', () => {
    const a = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    expect(a.source).toBe('manual');
  });

  it('creates assignment with override source', () => {
    const a = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
      source: 'override',
    });
    expect(a.source).toBe('override');
  });

  it('detects same slot overlap', () => {
    const a1 = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    const a2 = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    expect(a1.isSameSlot(a2)).toBe(true);
  });

  it('creates snapshot', () => {
    const a = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    const snap = a.toSnapshot();
    expect(snap.personnelId).toBe('p-1');
    expect(snap.date).toBe('2026-08-15');
  });
});

describe('AssignmentCollection', () => {
  it('filters by date', () => {
    const col = new AssignmentCollection([
      Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      }),
      Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-2',
        date: '2026-08-16',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      }),
    ]);
    const byDate = col.findByDate(AssignmentDate.create('2026-08-15'));
    expect(byDate).toHaveLength(1);
  });

  it('filters by personnel', () => {
    const col = new AssignmentCollection([
      Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-1',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      }),
      Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-2',
        date: '2026-08-15',
        shiftType: 'morning',
        startTime: '08:00',
        endTime: '16:00',
      }),
    ]);
    const byPerson = col.findByPersonnel(PersonnelId.create('p-1'));
    expect(byPerson).toHaveLength(1);
  });

  it('detects overlap', () => {
    const a1 = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    const a2 = Assignment.create({
      scheduleId: 's-1',
      personnelId: 'p-1',
      date: '2026-08-15',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    });
    expect(a1.isSameSlot(a2)).toBe(true);
  });
});
