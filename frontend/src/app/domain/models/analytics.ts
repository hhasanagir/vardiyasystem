import type { AnalyticsWarningType } from '../enums';

export interface DashboardStats {
  totalShifts: number;
  nightShifts: number;
  totalHours: number;
  employeeCount: number;
  employeeWorkload: EmployeeWorkload[];
}

export interface EmployeeWorkload {
  employeeId: string;
  employeeName: string;
  totalShifts: number;
  nightShifts: number;
  totalHours: number;
}

export interface ScheduleResult {
  generated: number;
  schedules: ScheduleResultItem[];
}

export interface ScheduleResultItem {
  date: string;
  shiftId: string;
  shiftName: string;
  employeeId: string;
  employeeName: string;
}

export interface FairnessScore {
  overall: number;
  shiftDistribution: number;
  nightShiftBalance: number;
  weekendBalance: number;
  details: FairnessDetails;
}

export interface FairnessDetails {
  mostAssigned: EmployeeWorkloadSummary | null;
  leastAssigned: EmployeeWorkloadSummary | null;
  distributionGap: number;
  nightShiftGap: number;
  weekendGap: number;
}

export interface EmployeeWorkloadSummary {
  employeeId: string;
  employeeName: string;
  totalShifts: number;
  totalHours: number;
}

export interface ScheduleAnalytics {
  fairnessScore: FairnessScore;
  totalShifts: number;
  totalHours: number;
  nightShifts: number;
  emptyShifts: number;
  dateRange: { start: string; end: string };
  employeeWorkload: EmployeeWorkloadSummary[];
  warnings: AnalyticsWarning[];
}

export interface AnalyticsWarning {
  type: AnalyticsWarningType;
  severity: 'high' | 'medium' | 'low';
  message: string;
  employeeId?: string;
}

export interface DetailedEmployeeWorkload {
  employeeId: string;
  employeeName: string;
  role: string;
  totalShifts: number;
  nightShifts: number;
  weekendShifts: number;
  totalHours: number;
  percentage: number;
}

export interface UnitMetrics {
  activeMRDevices: number;
  activeBTDevices: number;
  activeRontgenDevices: number;
  activeNukleerTipDevices: number;
  onDutyPersonnel: number;
  pendingRequests: number;
  occupancyRate: number;
  riskScore: number;
}
