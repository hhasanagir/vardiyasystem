import { describe, it, expect } from 'vitest';
import { mapSnapshotsToVersions } from '../version-panel.mapper';
import type { VersionSnapshot } from '../../../models';

function snapshot(version: number, status: string, createdAt: string): VersionSnapshot {
  return {
    id: `snap-${version}`,
    scheduleId: 's-1',
    version,
    status: status as VersionSnapshot['status'],
    data: { assignments: [], approvalData: null, metadata: {} as VersionSnapshot['data']['metadata'] },
    createdById: `user-${version}`,
    createdAt,
    comment: null,
  };
}

describe('P3-12 — version panel uses real snapshot metadata', () => {
  it('shows real statuses/actors instead of fabricated scores', () => {
    const items = mapSnapshotsToVersions(
      [2, 1],
      [snapshot(2, 'published', '2026-11-22T10:00:00.000Z'), snapshot(1, 'draft', '2026-11-21T10:00:00.000Z')],
      'published',
    );

    expect(items[0]).toMatchObject({ num: 2, status: 'published' });
    expect(items[0].meta).toContain('user-2');
    expect(items[1]).toMatchObject({ num: 1, status: 'draft' });
    for (const item of items) {
      expect(item).not.toHaveProperty('score');
      expect(JSON.stringify(item)).not.toContain('puan');
    }
  });

  it('reports a missing snapshot instead of inventing status or score', () => {
    const [item] = mapSnapshotsToVersions([1], [null]);
    expect(item.status).toBe('kayıt yok');
    expect(item.meta).toBe('Doğrulanmış geçmiş veri yok');
    expect(item).not.toHaveProperty('score');
  });
});
