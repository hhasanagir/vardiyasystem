import type { VersionSnapshot } from '../../models';

export interface VersionListItem {
  num: number;
  status: string;
  meta: string;
}

/**
 * P3-12 — snapshots are the only source of historical version metadata.
 * Missing snapshots are reported as such; no score or status is invented.
 */
export function mapSnapshotsToVersions(
  versions: number[],
  snapshots: Array<VersionSnapshot | null>,
  currentStatus?: string,
): VersionListItem[] {
  return versions.map((num, index) => {
    const snapshot = snapshots[index];
    if (!snapshot) {
      return { num, status: num === 1 ? 'kayıt yok' : 'anlık görüntü yok', meta: 'Doğrulanmış geçmiş veri yok' };
    }
    const who = snapshot.createdById || 'Sistem';
    const when = formatTimestamp(snapshot.createdAt);
    return {
      num,
      status: num === versions[0] && currentStatus ? currentStatus : snapshot.status,
      meta: `${who} · ${when}`,
    };
  });
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp || '';
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}
