import { PrismaClient, ShiftType } from '@prisma/client';
import { shiftMatchKey } from './mri-master-config';

/**
 * Permanent Radyasyon Onkolojisi (ONK) master configuration (devices + shift templates).
 *
 * This is the single source of truth for the ONK unit. Devices and their
 * shift templates here are IMMUTABLE: the scheduler only reads them, and the
 * Field Supervisor toggle only controls whether OPTIONAL shifts are generated
 * on weekends/official holidays - it never modifies these templates.
 *
 * Device codes are the pre-existing RONK codes (kept to preserve referential
 * integrity and the "never delete" rule); only names/modes/shifts are set here.
 *
 * Onkoloji devices are closed on weekends and official holidays, so every
 * device runs Monday-Friday only (workDays [1,2,3,4,5]).
 *
 *   RONK-1  Linak-1       (vardiya, Pt-Ct)    Tekniker-1 07:30-15:30 (sabah),
 *                                              Tekniker-2 10:00-18:00 (gündüz),
 *                                              Tekniker-3 15:00-23:00 (ikindi),
 *                                              Tekniker-4 22:00-06:00 (gece)
 *   RONK-2  Linak-2       (vardiya, Pt-Ct)    Tekniker-1 07:30-15:30 (sabah),
 *                                              Tekniker-2 10:00-18:00 (gündüz),
 *                                              Tekniker-3 15:00-23:00 (ikindi)
 *   RONK-3  Tomoterapi    (vardiya, Pt-Ct)    Tekniker 08:00-16:00
 *   RONK-4  BT Simülatör  (poliklinik, Pt-Ct) Tekniker 08:00-20:00,
 *                                              Planlama 08:00-16:00
 *
 * Note on same-window slots: the schedule grid and the assignment model key
 * slots by (type, personnelType). BT Simülatör keeps its Tekniker + Planlama
 * slots (Sağlık Fizikçisi nöbetleri kaldırıldı; cihaz tekniker nöbetleriyle
 * çalışır). The auto-generator only fills technician/senior_technician slots;
 * planning slots are filled manually by matching-role personnel.
 */
export interface OncologyShiftDef {
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  personnelType: string;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface OncologyDeviceDef {
  code: string;
  blockCode: string;
  deviceName: string;
  mode: 'vardiya' | 'polyclinic';
  shifts: OncologyShiftDef[];
}

export const ONK_MASTER_DEVICES: OncologyDeviceDef[] = [
  {
    code: 'RONK-1',
    blockCode: 'LINAK-1',
    deviceName: 'Linak-1',
    mode: 'vardiya',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.morning,
        startTime: '07:30',
        endTime: '15:30',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '10:00',
        endTime: '18:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-3',
        type: ShiftType.evening,
        startTime: '15:00',
        endTime: '23:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-4',
        type: ShiftType.night,
        startTime: '22:00',
        endTime: '06:00',
        personnelType: 'technician',
      },
    ],
  },
  {
    code: 'RONK-2',
    blockCode: 'LINAK-2',
    deviceName: 'Linak-2',
    mode: 'vardiya',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.morning,
        startTime: '07:30',
        endTime: '15:30',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '10:00',
        endTime: '18:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-3',
        type: ShiftType.evening,
        startTime: '15:00',
        endTime: '23:00',
        personnelType: 'technician',
      },
    ],
  },
  {
    code: 'RONK-3',
    blockCode: 'TOMOTERAPİ',
    deviceName: 'Tomoterapi',
    mode: 'vardiya',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
      },
    ],
  },
  {
    code: 'RONK-4',
    blockCode: 'BT-SİM',
    deviceName: 'BT Simülatör',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Planlama',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'planning',
      },
    ],
  },
];

/**
 * Applies the master ONK configuration idempotently:
 *  - upserts every master device (name, blockCode, mode, workDays, isMaster=true)
 *  - upserts every master shift template (isMaster=true + flags)
 *  - deactivates any ONK shift template that contradicts the master set
 */
export async function applyOnkolojiMasterConfig(
  prisma: PrismaClient,
  organizationId: string,
  onkUnitId: string,
): Promise<{ created: number; updated: number; deactivated: number }> {
  const stats = { created: 0, updated: 0, deactivated: 0 };
  const requiredSkills = ['ONCOLOGY_CERTIFIED'];

  for (const def of ONK_MASTER_DEVICES) {
    const device = await prisma.device.upsert({
      where: { organizationId_code: { organizationId, code: def.code } },
      update: {
        name: def.deviceName,
        blockCode: def.blockCode,
        isMaster: true,
        unitId: onkUnitId,
        mode: def.mode,
        workDays: [1, 2, 3, 4, 5],
      },
      create: {
        code: def.code,
        name: def.deviceName,
        unitId: onkUnitId,
        mode: def.mode,
        organizationId,
        requiredSkills,
        workDays: [1, 2, 3, 4, 5],
        blockCode: def.blockCode,
        isMaster: true,
      },
    });

    const existingShifts = await prisma.shifts.findMany({
      where: { deviceId: device.id },
    });

    const wantedKeys = new Set<string>();
    for (const shiftDef of def.shifts) {
      const key = shiftMatchKey({
        deviceId: device.id,
        type: shiftDef.type,
        personnelType: shiftDef.personnelType,
        startTime: shiftDef.startTime,
        endTime: shiftDef.endTime,
      });
      wantedKeys.add(key);

      const match = existingShifts.find(
        (s) =>
          shiftMatchKey({
            deviceId: s.deviceId as string,
            type: s.type,
            personnelType: s.personnelType,
            startTime: s.startTime,
            endTime: s.endTime,
          }) === key,
      );

      const data = {
        name: shiftDef.name,
        type: shiftDef.type,
        startTime: shiftDef.startTime,
        endTime: shiftDef.endTime,
        personnelType: shiftDef.personnelType,
        optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
        optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
        isMaster: true,
        isActive: true,
        unitId: onkUnitId,
        organizationId,
        deviceId: device.id,
      };

      if (match) {
        const needsUpdate =
          match.name !== shiftDef.name ||
          match.isMaster !== true ||
          match.isActive !== true ||
          match.optionalOnWeekends !== (shiftDef.optionalOnWeekends ?? false) ||
          match.optionalOnHolidays !== (shiftDef.optionalOnHolidays ?? false);
        if (needsUpdate) {
          await prisma.shifts.update({
            where: { id: match.id },
            data: {
              name: shiftDef.name,
              optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
              optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
              isMaster: true,
              isActive: true,
              unitId: onkUnitId,
            },
          });
          stats.updated += 1;
        }
      } else {
        await prisma.shifts.create({ data });
        stats.created += 1;
      }
    }

    const stale = existingShifts.filter(
      (s) =>
        !wantedKeys.has(
          shiftMatchKey({
            deviceId: s.deviceId as string,
            type: s.type,
            personnelType: s.personnelType,
            startTime: s.startTime,
            endTime: s.endTime,
          }),
        ),
    );
    for (const s of stale) {
      if (s.isActive) {
        await prisma.shifts.update({
          where: { id: s.id },
          data: { isActive: false },
        });
        stats.deactivated += 1;
      }
    }
  }

  return stats;
}
