export interface MaintenanceRecord {
  id: string;
  workOrderNumber: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  assetId: string | null;
  assetName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  unitId: string | null;
  unitName: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  partsUsed: string[];
  notes: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceDashboard {
  openCount: number;
  inProgressCount: number;
  completedCount: number;
  totalCount: number;
}
