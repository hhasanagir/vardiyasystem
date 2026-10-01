export enum ScheduleJobType {
  GENERATE = 'schedule:generate',
  VALIDATE = 'schedule:validate',
  EXPORT = 'schedule:export',
  REPORT = 'schedule:report',
}

export enum ScheduleJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface ScheduleJobData {
  jobId: string;
  scheduleId: string;
  organizationId: string;
  userId: string;
  requestTime: string;
}

export interface ScheduleGenerateJobData extends ScheduleJobData {
  unitId: string;
  month: number;
  year: number;
}

export interface ScheduleExportJobData extends ScheduleJobData {
  format: 'pdf' | 'excel' | 'csv';
  includeStats: boolean;
}
