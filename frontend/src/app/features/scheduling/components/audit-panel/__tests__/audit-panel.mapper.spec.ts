import { describe, it, expect } from 'vitest';
import { mapActivitiesToAuditEntries } from '../audit-panel.mapper';

describe('P3-12 — audit panel uses only real audit rows', () => {
  it('maps backend activity rows verbatim without inventing entries', () => {
    const entries = mapActivitiesToAuditEntries([
      {
        id: 'a-1',
        type: 'schedule_updated',
        message: 'Yayınlandı',
        timestamp: '2026-11-22T10:05:00.000Z',
        employeeName: 'Ada Yılmaz',
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].who).toBe('Ada Yılmaz');
    expect(entries[0].what).toBe('Yayınlandı');
    expect(entries[0].when).not.toBe('');
  });

  it('never synthesizes a row from the current schedule state', () => {
    expect(mapActivitiesToAuditEntries([])).toEqual([]);
  });

  it('falls back honestly when the actor is missing', () => {
    const [entry] = mapActivitiesToAuditEntries([
      { id: 'a-2', type: 'approval_accepted', message: 'Onaylandı', timestamp: 'invalid-date' },
    ]);
    expect(entry.who).toBe('Sistem');
    expect(entry.what).toBe('Onaylandı');
    expect(entry.when).toBe('invalid-date');
  });
});
