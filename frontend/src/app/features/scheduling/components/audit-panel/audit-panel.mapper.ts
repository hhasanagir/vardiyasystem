import type { ScheduleActivity } from '../../services/schedule-api.service';

export interface AuditEntry {
  who: string;
  what: string;
  when: string;
}

/** P3-12 — display only real audited rows; never synthesize a timeline entry. */
export function mapActivitiesToAuditEntries(activities: ScheduleActivity[]): AuditEntry[] {
  return activities.map(activity => ({
    who: activity.employeeName || 'Sistem',
    what: activity.message || activity.type,
    when: formatTimestamp(activity.timestamp),
  }));
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp || '';
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}
