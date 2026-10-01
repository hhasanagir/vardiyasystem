export interface AuditLogEntry {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  userRole: string;
  organizationId: string;
  hospitalId: string;
  unitId: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  description: string;
  ipAddress: string;
  userAgent: string;
  status: string;
  timestamp: Date;
  changes: AuditChange[];
  isFlagged: boolean;
  flagReason?: string;
}

export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export interface PaginatedAuditResponse {
  data: AuditLogEntry[];
  total: number;
  pages: number;
}

export interface AuditTimelineSummary {
  totalEntries: number;
  byAction: Record<string, number>;
  byUser: Record<string, { name: string; count: number }>;
  byEntity: Record<string, number>;
  flaggedCount: number;
  timeRange: { oldest: Date | null; newest: Date | null };
}

export interface AuditTimelineResponse {
  entries: AuditLogEntry[];
  summary: AuditTimelineSummary;
}

export interface AuditStatistics {
  period: { startDate: string; endDate: string };
  totalLogs: number;
  flaggedLogs: number;
  byAction: { action: string; label: string; count: number }[];
  byUser: { userId: string; userName: string; userEmail: string; count: number }[];
  byEntity: { entityType: string; label: string; count: number }[];
}

export interface AuditQueryFilters {
  userId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
  deviceId?: string;
  organizationId?: string;
  hospitalId?: string;
  unitId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
