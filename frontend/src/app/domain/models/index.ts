// Domain models — split into sub-modules by concern.
// The barrel re-exports everything for backward compatibility.
// New code should import from domain/models/<sub-module> directly.

import type { Schedule } from './scheduling';

export type {
  Personnel,
  PersonnelPreferences,
  Device,
  ShiftAssignment,
  Schedule,
} from './scheduling';

export type {
  PersonnelGroup,
  PersonShiftTemplate,
  PersonShiftConfigGroup,
  PersonShiftAssignment,
  PersonShiftsResponse,
  PersonShiftReportRow,
  PersonShiftReportGroupSummary,
  PersonShiftReportResponse,
} from './scheduling';

export type { User, Organization, OrganizationUnit, AuthResponse } from './auth';

export type {
  Employee,
  Shift,
  ScheduledShift,
  Rule,
  SwapRequest,
  CreateSwapRequest,
  DailyCheckItem,
  DailyCheck,
  Notification,
  PersonnelStats,
} from './operations';

export type {
  DashboardStats,
  EmployeeWorkload,
  ScheduleResult,
  ScheduleResultItem,
  FairnessScore,
  FairnessDetails,
  EmployeeWorkloadSummary,
  ScheduleAnalytics,
  AnalyticsWarning,
  DetailedEmployeeWorkload,
  UnitMetrics,
} from './analytics';

// --- Additional inline models not yet split ---

import type {
  UnitType,
  ShiftType,
  DeviceMode,
  ScheduleStatus,
  ConflictType,
  ConflictSeverity,
  ConstraintType,
  ConstraintSeverity,
  HolidayType,
} from '../enums';

export interface Constraint {
  type: ConstraintType;
  message: string;
  severity: ConstraintSeverity;
  affectedAssignments?: string[];
}

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  date?: string;
  personnelId?: string;
  deviceId?: string;
  relatedAssignments?: string[];
}

export interface FairnessMetrics {
  nightShiftDistribution: number;
  weekendAssignmentRate: number;
  holidayAssignmentRate: number;
  deviceRotationFairness: number;
  overallScore: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Constraint[];
  warnings: Constraint[];
  score: number;
}

export interface ScheduleGenerationOptions {
  respectExisting?: boolean;
  prioritizeFairness?: boolean;
  allowOvertime?: boolean;
  fillGaps?: boolean;
  minimizeChanges?: boolean;
}

export interface RebalanceResult {
  success: boolean;
  schedule: Schedule;
  changes: RebalanceChanges;
  fairnessImprovement: number;
}

export interface RebalanceChanges {
  added: string[];
  removed: string[];
  moved: Array<{ from: string; to: string; assignmentId: string }>;
}

export interface HolidayInfo {
  id?: string;
  date: string;
  name: string;
  type: HolidayType;
  year?: number;
  createdAt?: Date;
}

export interface HeatmapMetrics {
  active: number;
  idle: number;
  maintenance: number;
  critical: number;
  occupancyRate: number;
}
