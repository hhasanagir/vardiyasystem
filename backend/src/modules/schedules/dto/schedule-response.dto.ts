import { Schedule } from '../domain/aggregates/schedule.aggregate';

export interface AssignmentResponseDto {
  id: string;
  scheduleId: string;
  personnelId: string;
  personnelName: string;
  deviceId: string | null;
  deviceCode: string | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: 'device' | 'person';
  source: string;
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

export interface ScheduleResponseDto {
  id: string;
  unitId: string;
  month: number;
  year: number;
  status: string;
  version: number;
  createdById: string | null;
  publishedAt: string | null;
  assignments: AssignmentResponseDto[];
  approvalData: {
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
  } | null;
}

export interface EnrichedAssignment {
  id: string;
  scheduleId: string;
  personnelId: string;
  personnelName: string;
  personnelRole: string | null;
  deviceId: string | null;
  deviceCode: string | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: string;
  source: string;
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

export function toScheduleResponseDto(
  schedule: Schedule,
  enrichedAssignments: EnrichedAssignment[],
): ScheduleResponseDto {
  const snapshot = schedule.toSnapshot();
  const approvalData = schedule.approvalData;

  return {
    id: schedule.id,
    unitId: schedule.unitId,
    month: schedule.month,
    year: schedule.year,
    status: schedule.status,
    version: schedule.scheduleVersion,
    createdById: schedule.createdById,
    publishedAt: schedule.publishedAt?.toISOString() ?? null,
    assignments: enrichedAssignments.map((a) => ({
      id: a.id,
      scheduleId: a.scheduleId,
      personnelId: a.personnelId,
      personnelName: a.personnelName,
      deviceId: a.deviceId,
      deviceCode: a.deviceCode,
      unitId: a.unitId,
      personnelGroupId: a.personnelGroupId,
      shiftTemplateId: a.shiftTemplateId,
      kind: a.kind as 'device' | 'person',
      source: a.source,
      date: a.date,
      shiftType: a.shiftType,
      startTime: a.startTime,
      endTime: a.endTime,
      personnelType: a.personnelType,
      isConfirmed: a.isConfirmed,
      overrideReason: a.overrideReason,
      overriddenBy: a.overriddenBy,
      overriddenAt: a.overriddenAt,
    })),
    approvalData: approvalData
      ? {
          submittedBy: approvalData.submittedBy,
          submittedAt: approvalData.submittedAt,
          submittedComment: approvalData.submittedComment,
          approvedBy: approvalData.approvedBy,
          approvedAt: approvalData.approvedAt,
          approvalComment: approvalData.approvalComment,
          rejectedBy: approvalData.rejectedBy,
          rejectedAt: approvalData.rejectedAt,
          rejectionReason: approvalData.rejectionReason,
          publishedBy: approvalData.publishedBy,
          publishedAt: approvalData.publishedAt,
          archivedBy: approvalData.archivedBy,
          archivedAt: approvalData.archivedAt,
        }
      : null,
  };
}

export function toScheduleListResponseDto(
  schedules: Schedule[],
  enrichedAssignmentsMap: Map<string, EnrichedAssignment[]>,
): ScheduleResponseDto[] {
  return schedules.map((s) =>
    toScheduleResponseDto(s, enrichedAssignmentsMap.get(s.id) ?? []),
  );
}
