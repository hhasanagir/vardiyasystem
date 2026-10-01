export interface PersonnelStats {
  personnelId: string;
  selectedMonth: number;
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  totalHours: number;
  weeklyHours: number;
  workloadPercentage: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  critical: boolean;
  conflicts: number;
}

export interface Employee {
  id: string;
  name: string;
  employeeNo?: string;
  email?: string;
  phone?: string;
  role: string;
  unitId?: string;
  unit?: { id: string; type: string; name: string; code: string };
  organizationId?: string;
  specialization?: string;
  experienceYears?: number;
  deviceSkills?: string[];
  nightShiftEligible?: boolean;
  offDays?: number[];
  maxWeeklyHours?: number;
  isActive?: boolean;
  employmentStatus?: string;
  startDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  stats?: PersonnelStats;
}

export interface Shift {
  id: string;
  name: string;
  type: 'day' | 'night' | 'evening';
  startTime: string;
  endTime: string;
  durationHours: number;
  organizationId: string;
  unitId?: string;
  deviceId?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduledShift {
  id: string;
  date: string;
  shiftId: string;
  shift?: {
    id: string;
    name: string;
    type: 'day' | 'night' | 'evening';
    startTime: string;
    endTime: string;
    durationHours: number;
  };
  employeeId: string;
  employee?: {
    id: string;
    name: string;
    role: string;
  };
  organizationId: string;
  status?: string;
}

export interface Rule {
  id?: string;
  name: string;
  type: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  isActive?: boolean;
  priority?: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SwapRequest {
  id: string;
  requesterId: string;
  targetPersonnelId?: string;
  fromAssignmentId: string;
  toAssignmentId?: string;
  reason?: string;
  status: string;
  approvedById?: string;
  approvedAt?: string;
  requesterShift?: ScheduledShift;
  targetShift?: ScheduledShift;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSwapRequest {
  requesterShiftId: string;
  targetEmployeeId?: string;
  reason?: string;
}

export interface DailyCheckItem {
  id: string;
  label: string;
  category: string;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

export interface DailyCheck {
  id: string;
  date: string;
  unitId: string;
  shiftType: string;
  items: DailyCheckItem[];
  createdById: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  organizationId?: string;
  type: string;
  priority?: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  senderId?: string;
  status?: string;
  isRead?: boolean;
  createdAt: string;
  updatedAt?: string;
}
