import { PrismaClient, ShiftType } from '@prisma/client';
import { shiftMatchKey } from './mri-master-config';

/**
 * Permanent Nükleer Tıp (NT) master configuration (devices + shift templates).
 *
 * This is the single source of truth for the Nükleer Tıp unit. Devices and their
 * shift templates here are IMMUTABLE: the scheduler only reads them, and the
 * Field Supervisor toggle only controls whether OPTIONAL shifts are generated
 * on weekends/official holidays - it never modifies these templates.
 *
 * Device codes are the pre-existing NT codes (kept to preserve referential
 * integrity and the "never delete" rule); only names/modes/shifts are set here.
 *
 *   NT-1  SPECT-B blok    (poliklinik, Pt-Ct + Cmt)  Tekniker-1 08:00-16:00,
 *                                                     Tekniker-2 11:30-19:30
 *   NT-2  SPECT-CT-B BLOK (poliklinik, Pt-Ct + Cmt)  Tekniker-1 09:00-17:00,
 *                                                     Tekniker-2 12:00-20:00
 *   NT-3  SPECT-F blok    (poliklinik, Pt-Ct + Cmt)  Tekniker-1 08:00-16:00,
 *                                                     Tekniker-2 11:30-19:30
 *   NT-4  SPECT-CT-F BLOK (poliklinik, Pt-Ct + Cmt)  Tekniker-1 09:00-17:00,
 *                                                     Tekniker-2 12:00-20:00
 *   NT-5  PET-CT          (poliklinik, Pt-Ct + Cmt)  Tekniker-1/2/3 07:30/08:30/09:30
 *   NT-6  PET             (poliklinik, Pt-Ct + Cmt)  Tekniker-1/2/3/4 07:30/08:30/09:30/10:30
 *
 * Saturday rule: only the Nükleer Tıp unit works on Saturdays (Pazar kapalı,
 * resmi tatiller kapalı). All other polyclinic units (BT, Röntgen, RONK-4)
 * stay Monday-Friday via their own workDays.
 *
 * Note on same-window slots: the schedule grid and the assignment model key
 * slots by (type, personnelType). Every staggered day slot above carries a
 * distinct personnelType discriminator (technician, technician_2, ...) so the
 * @@unique([scheduleId, deviceId, date, shiftType, personnelType]) constraint
 * stays satisfiable. The auto-generator fills all technician_* slots.
 */
export interface NukleerShiftDef {
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  durationHours: number;
  personnelType: string;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface NukleerDeviceDef {
  code: string;
  blockCode: string;
  deviceName: string;
  mode: 'vardiya' | 'polyclinic';
  shifts: NukleerShiftDef[];
}

export const NUKLEER_MASTER_DEVICES: NukleerDeviceDef[] = [
  {
    code: 'NT-1',
    blockCode: 'B',
    deviceName: 'SPECT-B blok',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '16:00',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '11:30',
        endTime: '19:30',
        durationHours: 8,
        personnelType: 'technician_2',
      },
    ],
  },
  {
    code: 'NT-2',
    blockCode: 'B',
    deviceName: 'SPECT-CT-B BLOK',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '09:00',
        endTime: '17:00',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '12:00',
        endTime: '20:00',
        durationHours: 8,
        personnelType: 'technician_2',
      },
    ],
  },
  {
    code: 'NT-3',
    blockCode: 'F',
    deviceName: 'SPECT-F blok',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '16:00',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '11:30',
        endTime: '19:30',
        durationHours: 8,
        personnelType: 'technician_2',
      },
    ],
  },
  {
    code: 'NT-4',
    blockCode: 'F',
    deviceName: 'SPECT-CT-F BLOK',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '09:00',
        endTime: '17:00',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '12:00',
        endTime: '20:00',
        durationHours: 8,
        personnelType: 'technician_2',
      },
    ],
  },
  {
    code: 'NT-5',
    blockCode: 'F',
    deviceName: 'PET-CT',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '07:30',
        endTime: '15:30',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '08:30',
        endTime: '16:30',
        durationHours: 8,
        personnelType: 'technician_2',
      },
      {
        name: 'Tekniker-3',
        type: ShiftType.day,
        startTime: '09:30',
        endTime: '17:30',
        durationHours: 8,
        personnelType: 'technician_3',
      },
    ],
  },
  {
    code: 'NT-6',
    blockCode: 'F',
    deviceName: 'PET',
    mode: 'polyclinic',
    shifts: [
      {
        name: 'Tekniker-1',
        type: ShiftType.day,
        startTime: '07:30',
        endTime: '15:30',
        durationHours: 8,
        personnelType: 'technician',
      },
      {
        name: 'Tekniker-2',
        type: ShiftType.day,
        startTime: '08:30',
        endTime: '16:30',
        durationHours: 8,
        personnelType: 'technician_2',
      },
      {
        name: 'Tekniker-3',
        type: ShiftType.day,
        startTime: '09:30',
        endTime: '17:30',
        durationHours: 8,
        personnelType: 'technician_3',
      },
      {
        name: 'Tekniker-4',
        type: ShiftType.day,
        startTime: '10:30',
        endTime: '18:30',
        durationHours: 8,
        personnelType: 'technician_4',
      },
    ],
  },
];

/**
 * Applies the master Nükleer Tıp configuration idempotently:
 *  - upserts every master device (name, blockCode, mode, workDays, isMaster=true)
 *  - upserts every master shift template (isMaster=true + flags)
 *  - deactivates any NT shift template that contradicts the master set
 *
 * Nükleer Tıp works Monday-Saturday (Sunday + official holidays closed).
 */
export async function applyNukleerMasterConfig(
  prisma: PrismaClient,
  organizationId: string,
  nukleerUnitId: string,
): Promise<{ created: number; updated: number; deactivated: number }> {
  const stats = { created: 0, updated: 0, deactivated: 0 };
  const requiredSkills = ['NUCLEAR_CERTIFIED'];
  const workDays = [1, 2, 3, 4, 5, 6];

  for (const def of NUKLEER_MASTER_DEVICES) {
    const device = await prisma.device.upsert({
      where: { organizationId_code: { organizationId, code: def.code } },
      update: {
        name: def.deviceName,
        blockCode: def.blockCode,
        isMaster: true,
        isActive: true,
        unitId: nukleerUnitId,
        mode: def.mode,
        workDays,
      },
      create: {
        code: def.code,
        name: def.deviceName,
        unitId: nukleerUnitId,
        mode: def.mode,
        organizationId,
        requiredSkills,
        workDays,
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
        durationHours: shiftDef.durationHours,
        personnelType: shiftDef.personnelType,
        optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
        optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
        isMaster: true,
        isActive: true,
        unitId: nukleerUnitId,
        organizationId,
        deviceId: device.id,
      };

      if (match) {
        const needsUpdate =
          match.name !== shiftDef.name ||
          match.durationHours !== shiftDef.durationHours ||
          match.isMaster !== true ||
          match.isActive !== true ||
          match.optionalOnWeekends !== (shiftDef.optionalOnWeekends ?? false) ||
          match.optionalOnHolidays !== (shiftDef.optionalOnHolidays ?? false);
        if (needsUpdate) {
          await prisma.shifts.update({
            where: { id: match.id },
            data: {
              name: shiftDef.name,
              durationHours: shiftDef.durationHours,
              optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
              optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
              isMaster: true,
              isActive: true,
              unitId: nukleerUnitId,
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
