export enum DutyRosterRole {
  SORUMLU_TEKNIKER = 'sorumlu_tekniker',
  TEKNIKER = 'tekniker',
  YARDIMCI_TEKNIKER = 'yardimci_tekniker',
  SUPERVISOR = 'supervisor',
  RADYOLOG = 'radyolog',
}

export interface CreateDutyRosterEntryProps {
  organizationId: string;
  unitId?: string;
  deviceId?: string;
  personnelId: string;
  date: string;
  shiftType: string;
  role: DutyRosterRole;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface UpdateDutyRosterEntryProps {
  role?: DutyRosterRole;
  startTime?: string;
  endTime?: string;
  notes?: string;
  isActive?: boolean;
}

export interface DutyRosterFilterProps {
  organizationId: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  unitId?: string;
  deviceId?: string;
  personnelId?: string;
  shiftType?: string;
  role?: DutyRosterRole;
  search?: string;
}

export interface DutyRosterEntryProps {
  id: string;
  organizationId: string;
  unitId?: string;
  deviceId?: string;
  personnelId: string;
  date: string;
  shiftType: string;
  role: string;
  startTime: string;
  endTime: string;
  notes?: string;
  isActive: boolean;
  personnel?: {
    id: string;
    name: string;
    role: string;
  };
  unit?: {
    id: string;
    name: string;
    code: string;
  };
  device?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface DutyRosterCalendarProps {
  date: string;
  entries: DutyRosterEntryProps[];
  shiftSummary: {
    day: number;
    evening: number;
    night: number;
  };
}

export interface DutyRosterReportProps {
  organizationId: string;
  startDate: string;
  endDate: string;
  generatedAt: Date;
  totalEntries: number;
  entries: DutyRosterEntryProps[];
}
