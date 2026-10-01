export interface SupervisorKpis {
  totalPersonnel: number;
  activeToday: number;
  devicesOnline: number;
  totalDevices: number;
  shiftCoverage: number;
  incidentsToday: number;
  pendingApprovals: number;
}

export interface DeviceStatusByUnit {
  unitId: string;
  unitName: string;
  active: number;
  maintenance: number;
  fault: number;
  outOfService: number;
  total: number;
}

export interface PersonnelByUnit {
  unitId: string;
  unitName: string;
  total: number;
  roles: Record<string, number>;
}

export interface TodayRosterEntry {
  id: string;
  personnelName: string;
  personnelRole: string;
  unitName: string;
  deviceName: string | null;
  shiftType: string;
  role: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface RecentIncident {
  id: string;
  issueType: string;
  severity: string;
  description: string;
  status: string;
  unitName: string;
  deviceName: string | null;
  reporterName: string;
  reportedAt: string;
}

export interface RecentAlert {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  senderName: string;
  createdAt: string;
}

export interface LowStockAlert {
  itemId: string;
  itemName: string;
  unitName: string;
  currentStock: number;
  minRequired: number;
  unit: string;
  lastUpdated: string;
}

export interface SupervisorCenterDashboard {
  kpis: SupervisorKpis;
  deviceStatusByUnit: DeviceStatusByUnit[];
  personnelByUnit: PersonnelByUnit[];
  todayRoster: TodayRosterEntry[];
  recentIncidents: RecentIncident[];
  recentAlerts: RecentAlert[];
  lowStockAlerts: LowStockAlert[];
}
