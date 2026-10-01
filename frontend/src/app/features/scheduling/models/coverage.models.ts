import type { VersionSnapshot } from './schedule.models';

export interface DeviceCoverage {
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  totalSlots: number;
  filledSlots: number;
  percent: number;
  missing: MissingCoverage[];
}

export interface MissingCoverage {
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
}

export function computeDeviceCoverage(
  snapshots: VersionSnapshot | null,
  deviceCodeMap: Map<string, string>,
  daysInMonth: number,
  shiftTypes: Array<{ type: string; startTime: string; endTime: string }>,
): DeviceCoverage[] {
  if (!snapshots) return [];
  const assignments = snapshots.data.assignments;
  const deviceMap = new Map<string, DeviceCoverage>();

  for (const [deviceId, code] of deviceCodeMap) {
    deviceMap.set(deviceId, {
      deviceId,
      deviceCode: code,
      deviceName: code,
      totalSlots: daysInMonth * shiftTypes.length,
      filledSlots: 0,
      percent: 0,
      missing: [],
    });
  }

  const filledSet = new Set<string>();
  for (const a of assignments) {
    if (a.deviceId && deviceMap.has(a.deviceId)) {
      filledSet.add(`${a.deviceId}-${a.date}-${a.shiftType}`);
      const dc = deviceMap.get(a.deviceId)!;
      dc.filledSlots++;
    }
  }

  for (const dc of deviceMap.values()) {
    dc.percent = dc.totalSlots > 0 ? Math.round((dc.filledSlots / dc.totalSlots) * 100) : 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `TBD`;
      for (const st of shiftTypes) {
        if (!filledSet.has(`${dc.deviceId}-${dateStr}-${st.type}`)) {
          dc.missing.push({
            date: dateStr,
            shiftType: st.type,
            startTime: st.startTime,
            endTime: st.endTime,
          });
        }
      }
    }
  }

  return Array.from(deviceMap.values()).sort((a, b) => a.percent - b.percent);
}
