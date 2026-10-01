export type ScheduleStatus = 'draft' | 'generated' | 'validated' | 'under_review' | 'approved' | 'published' | 'archived' | 'rejected';

export type AssignmentKind = 'device' | 'person';
export type AssignmentSource = 'manual' | 'auto-generated' | 'override' | 'swap' | 'template' | 'import';

export interface Schedule {
  id: string;
  unitId: string;
  month: number;
  year: number;
  status: ScheduleStatus;
  version: number;
  createdById: string | null;
  publishedAt: string | null;
  assignments: AssignmentDTO[];
  approvalData: ApprovalData | null;
}

export interface AssignmentDTO {
  id: string;
  scheduleId: string;
  personnelId: string;
  personnelName?: string;
  deviceId: string | null;
  deviceCode?: string | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: AssignmentKind;
  source: AssignmentSource;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  personnelType: string;
  isConfirmed: boolean;
  overrideReason: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
}

export interface ApprovalData {
  submittedBy: string | null;
  submittedAt: string | null;
  submittedComment: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
}

export interface VersionSnapshot {
  id: string;
  scheduleId: string;
  version: number;
  status: ScheduleStatus;
  data: {
    assignments: SnapshotAssignment[];
    approvalData: ApprovalData | null;
    metadata: SnapshotMetadata;
  };
  createdById: string | null;
  createdAt: string;
  comment: string | null;
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

export interface SnapshotMetadata {
  totalAssignments: number;
  totalWorkingDays: number;
  personnelCount: number;
  deviceCount: number;
  coveragePercent: number;
  generatedAt?: string;
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
