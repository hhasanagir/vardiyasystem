export interface QualityRecord {
  id: string;
  recordNumber: string;
  title: string;
  description: string;
  type: string;
  status: string;
  severity: string;
  source: string | null;
  reportedById: string;
  reportedByName: string;
  department: string | null;
  assetId: string | null;
  assetName: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  actions: QualityAction[];
  dueDate: string | null;
  closedAt: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityAction {
  id: string;
  recordId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}
