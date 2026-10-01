import { PrismaClient, ShiftType } from '@prisma/client';

/**
 * Permanent MRI master configuration (devices + shift templates).
 *
 * This is the single source of truth for the MRI unit. Devices and their
 * shift templates here are IMMUTABLE: the scheduler only reads them, and the
 * Field Supervisor toggle only controls whether OPTIONAL assistant shifts are
 * generated on weekends/official holidays — it never modifies these templates.
 *
 * Blocks:
 *   A    A Blok Fujifilm Açık MR 1.2 Tesla        — Teknisyen 08-20 + 20-08, Yardımcı 10-20 (optional weekend/holiday)
 *   B    B Blok Philips MR 1.5T + Fujifilm MR 1.5T — Teknisyen 08-20 + 20-08 each, shared Yardımcı day+night (every day)
 *   C    C Blok Philips MR 3T + Fujifilm MR 1.5T   — Teknisyen 08-20 + 20-08 each, shared Yardımcı day+night (every day)
 *   D    D Blok Fujifilm MR 1.5T                  — Teknisyen 08-20 + 20-08, Yardımcı 10-20 (optional weekend/holiday)
 *   F    F Blok Philips MR 1.5T                   — Teknisyen 08-20 + 20-08, Yardımcı 10-20 (optional weekend/holiday)
 *   ACIL Erişkin Acil Philips MR 1.5T             — Teknisyen 08-20 + 20-08, Yardımcı day+night (every day)
 *
 * Shared assistant shifts are attached to the block's first device and carry
 * blockId = 'B' | 'C'. The scheduler creates ONE assignment for them per day.
 */
export interface MasterShiftDef {
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  personnelType: string;
  blockId?: string;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface MasterDeviceDef {
  code: string;
  blockCode: string;
  deviceName: string;
  shifts: MasterShiftDef[];
}

export const MR_MASTER_DEVICES: MasterDeviceDef[] = [
  {
    code: 'MR-A',
    blockCode: 'A',
    deviceName: 'A Blok Fujifilm Açık MR 1.2 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker',
        type: ShiftType.day,
        startTime: '10:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
        optionalOnWeekends: true,
        optionalOnHolidays: true,
      },
    ],
  },
  {
    code: 'MR-B',
    blockCode: 'B',
    deviceName: 'B Blok Philips MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker (Paylaşımlı)',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
        blockId: 'B',
      },
      {
        name: 'Yardımcı Tekniker (Paylaşımlı)',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'assistant_technician',
        blockId: 'B',
      },
    ],
  },
  {
    code: 'MR-C',
    blockCode: 'B',
    deviceName: 'B Blok Fujifilm MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
    ],
  },
  {
    code: 'MR-D',
    blockCode: 'C',
    deviceName: 'C Blok Philips MR 3 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker (Paylaşımlı)',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
        blockId: 'C',
      },
      {
        name: 'Yardımcı Tekniker (Paylaşımlı)',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'assistant_technician',
        blockId: 'C',
      },
    ],
  },
  {
    code: 'MR-E',
    blockCode: 'C',
    deviceName: 'C Blok Fujifilm MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
    ],
  },
  {
    code: 'MR-F',
    blockCode: 'D',
    deviceName: 'D Blok Fujifilm MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker',
        type: ShiftType.day,
        startTime: '10:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
        optionalOnWeekends: true,
        optionalOnHolidays: true,
      },
    ],
  },
  {
    code: 'MR-G',
    blockCode: 'F',
    deviceName: 'F Blok Philips MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker',
        type: ShiftType.day,
        startTime: '10:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
        optionalOnWeekends: true,
        optionalOnHolidays: true,
      },
    ],
  },
  {
    code: 'MR-H',
    blockCode: 'ACIL',
    deviceName: 'Erişkin Acil Philips MR 1.5 Tesla',
    shifts: [
      {
        name: 'Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'technician',
      },
      {
        name: 'Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
      {
        name: 'Yardımcı Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: 'assistant_technician',
      },
      {
        name: 'Yardımcı Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: 'assistant_technician',
      },
    ],
  },
];

export function shiftMatchKey(s: {
  deviceId: string;
  type: string;
  personnelType: string | null;
  startTime: string | null;
  endTime: string | null;
}): string {
  return `${s.deviceId}|${s.type}|${s.personnelType || 'technician'}|${s.startTime}|${s.endTime}`;
}

/**
 * Applies the master MRI configuration idempotently:
 *  - upserts the 8 master devices (name, blockCode, isMaster=true)
 *  - upserts every master shift template (isMaster=true + flags)
 *  - deactivates any MR shift template that contradicts the master set
 *    (e.g. the old per-device assistant rows on MR-C/MR-E, or MR-D 10:00-20:00)
 */
export async function applyMrMasterConfig(
  prisma: PrismaClient,
  organizationId: string,
  mrUnitId: string,
): Promise<{ created: number; updated: number; deactivated: number }> {
  const stats = { created: 0, updated: 0, deactivated: 0 };

  for (const def of MR_MASTER_DEVICES) {
    const device = await prisma.device.upsert({
      where: { organizationId_code: { organizationId, code: def.code } },
      update: {
        name: def.deviceName,
        blockCode: def.blockCode,
        isMaster: true,
        unitId: mrUnitId,
      },
      create: {
        code: def.code,
        name: def.deviceName,
        unitId: mrUnitId,
        mode: 'vardiya',
        organizationId,
        requiredSkills: ['MR_CERTIFIED'],
        workDays: [0, 1, 2, 3, 4, 5, 6],
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
        blockId: shiftDef.blockId ?? null,
        optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
        optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
        isMaster: true,
        isActive: true,
        unitId: mrUnitId,
        organizationId,
        deviceId: device.id,
      };

      if (match) {
        const needsUpdate =
          match.name !== shiftDef.name ||
          match.isMaster !== true ||
          match.isActive !== true ||
          match.blockId !== (shiftDef.blockId ?? null) ||
          match.optionalOnWeekends !== (shiftDef.optionalOnWeekends ?? false) ||
          match.optionalOnHolidays !== (shiftDef.optionalOnHolidays ?? false);
        if (needsUpdate) {
          await prisma.shifts.update({
            where: { id: match.id },
            data: {
              name: shiftDef.name,
              blockId: shiftDef.blockId ?? null,
              optionalOnWeekends: shiftDef.optionalOnWeekends ?? false,
              optionalOnHolidays: shiftDef.optionalOnHolidays ?? false,
              isMaster: true,
              isActive: true,
              unitId: mrUnitId,
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
