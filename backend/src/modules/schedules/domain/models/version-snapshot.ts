import { ScheduleStatus } from '../aggregates/schedule.aggregate';

export interface ScheduleVersionSnapshot {
  id: string;
  scheduleId: string;
  version: number;
  status: ScheduleStatus;
  data: ScheduleSnapshotData;
  createdById: string | null;
  createdAt: Date;
  comment: string | null;
}

export interface ScheduleSnapshotData {
  assignments: SnapshotAssignment[];
  approvalData: SnapshotApprovalData | null;
  metadata: SnapshotMetadata;
}

export interface SnapshotAssignment {
  id: string;
  personnelId: string;
  personnelName: string;
  deviceId: string | null;
  deviceCode: string | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  personnelType: string;
  isConfirmed: boolean;
}

export interface SnapshotApprovalData {
  submittedBy: string | null;
  submittedAt: Date | null;
  submittedComment: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvalComment: string | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  archivedBy: string | null;
  archivedAt: Date | null;
}

export interface SnapshotMetadata {
  totalAssignments: number;
  totalWorkingDays: number;
  personnelCount: number;
  deviceCount: number;
  coveragePercent: number;
  generatedAt?: Date;
  algorithm?: string;
  seed?: number;
  score?: number;
}

export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  added: SnapshotAssignment[];
  removed: SnapshotAssignment[];
  modified: VersionDiffModified[];
  totalChanges: number;
}

export interface VersionDiffModified {
  assignmentId: string;
  personnelName: string;
  date: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export function createSnapshotDiff(
  from: ScheduleVersionSnapshot,
  to: ScheduleVersionSnapshot,
): VersionDiff {
  const fromMap = new Map(from.data.assignments.map((a) => [a.id, a]));
  const toMap = new Map(to.data.assignments.map((a) => [a.id, a]));

  const added: SnapshotAssignment[] = [];
  const removed: SnapshotAssignment[] = [];
  const modified: VersionDiffModified[] = [];

  for (const [id, toAssignment] of toMap) {
    const fromAssignment = fromMap.get(id);
    if (!fromAssignment) {
      added.push(toAssignment);
    } else {
      const diffs = diffAssignments(fromAssignment, toAssignment);
      modified.push(...diffs);
    }
  }

  for (const [id, fromAssignment] of fromMap) {
    if (!toMap.has(id)) {
      removed.push(fromAssignment);
    }
  }

  return {
    fromVersion: from.version,
    toVersion: to.version,
    added,
    removed,
    modified,
    totalChanges: added.length + removed.length + modified.length,
  };
}

function diffAssignments(
  a: SnapshotAssignment,
  b: SnapshotAssignment,
): VersionDiffModified[] {
  const diffs: VersionDiffModified[] = [];
  const fields: Array<keyof SnapshotAssignment> = [
    'personnelId',
    'deviceId',
    'shiftType',
    'startTime',
    'endTime',
    'kind',
  ];

  for (const field of fields) {
    const oldVal = String(a[field] ?? '');
    const newVal = String(b[field] ?? '');
    if (oldVal !== newVal) {
      diffs.push({
        assignmentId: a.id,
        personnelName: b.personnelName,
        date: b.date,
        field,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return diffs;
}
