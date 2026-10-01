import { PrismaClient, ShiftType } from '@prisma/client';
import { shiftMatchKey } from './mri-master-config';

/**
 * Permanent BT (Tomografi) + Röntgen master configuration (devices + shift templates).
 *
 * This is the single source of truth for the BT and Röntgen units. Devices and
 * their shift templates here are IMMUTABLE: the scheduler only reads them, and the
 * Field Supervisor toggle only controls whether OPTIONAL assistant shifts are
 * generated on weekends/official holidays - it never modifies these templates.
 *
 * BT blocks:
 *   BT-1 B          B Blok Fujifilm Tomografi        - Tekniker 08:30-16:30
 *   BT-2 B          B Blok Philips Tomografi         - Tekniker 08-20 + 20-08
 *   BT-3 C          C Blok Fujifilm Tomografi        - Tekniker 08:30-16:30
 *   BT-4 E          E Blok Canon Tomografi           - Tekniker 08-20 + 20-08
 *   BT-5 F          F Blok Fujifilm Tomografi        - Tekniker 08-20 + 20-08
 *   BT-6 Erişkin A. Erişkin Acil Fujifilm Tomografi  - Tekniker 08-20 + 20-08,
 *                                                     Tomografi Yardımcı Tekniker 08-20 + 20-08
 *   BT-7 Travma A.  Travma Acil Fujifilm Tomografi   - Tekniker 08-20 + 20-08
 *
 * Röntgen blocks:
 *   RÖ-1  A         A Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-2  B         B Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-3  B         B Blok Shimadzu Röntgen-2          - Tekniker 08:30-16:30
 *   RÖ-4  B         B Blok Shimadzu Röntgen-3          - Tekniker 08:30-16:30
 *   RÖ-5  B         B Blok IMS GIOTTO CLASS Mamografi  - Tekniker 08:30-16:30
 *   RÖ-6  Erişkin A. Erişkin Acil Shimadzu Röntgen-1    - Tekniker 08-20 + 20-08
 *   RÖ-7  Erişkin A. Erişkin Acil Shimadzu Röntgen-2    - Tekniker 11-18 + 18-06
 *   RÖ-8  Travma A.  Travma Acil Mobil Röntgen-1        - Tekniker 08-20 + 20-08
 *   RÖ-9  B         B Blok Fsionary Kemik Dansitometri - Tekniker 08:30-16:30
 *   RÖ-10 C         C Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-11 C         C Blok Shimadzu Röntgen-2          - Tekniker 08:30-16:30
 *   RÖ-12 C         C Blok Shimadzu Röntgen-3          - Tekniker 08:30-16:30
 *   RÖ-13 D         D Blok Skopi-1                     - Tekniker 08:30-16:30
 *   RÖ-14 D         D Blok IMS GIOTTO CLASS Mamografi  - Tekniker 08:30-16:30
 *   RÖ-15 D         D Blok Fsionary Kemik Dansitometri - Tekniker 08:30-16:30
 *   RÖ-16 E         E Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-17 E         E Blok Shimadzu Röntgen-2          - Tekniker 08:30-16:30
 *   RÖ-18 F         F Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-19 F         F Blok Shimadzu Röntgen-2          - Tekniker 08:30-16:30
 *   RÖ-20 F         F Blok IMS GIOTTO CLASS Mamografi  - Tekniker 08:30-16:30
 *   RÖ-21 F         F Blok Fsionary Kemik Dansitometri - Tekniker 08:30-16:30
 *   RÖ-22 H         H Blok Shimadzu Röntgen-1          - Tekniker 08:30-16:30
 *   RÖ-23 H         H Blok Fsionary Kemik Dansitometri - Tekniker 08:30-16:30
 *   RÖ-24 Travma A.  Travma Acil Shimadzu Röntgen-1     - Tekniker 08-20 + 20-08
 *   RÖ-25 Travma A.  Travma Acil Mobil Röntgen-2        - Tekniker 08-20 + 20-08
 *   RÖ-26 Travma A.  Travma Acil Mobil Röntgen-3        - Tekniker 08-20 + 20-08
 */
export interface RadiologyShiftDef {
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  personnelType: string;
  blockId?: string;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface RadiologyDeviceDef {
  code: string;
  blockCode: string;
  deviceName: string;
  mode: 'vardiya' | 'polyclinic';
  shifts: RadiologyShiftDef[];
}

const TECH = 'technician';
const ASSISTANT = 'assistant_technician';

function singleDay(start: string, end: string): RadiologyShiftDef[] {
  return [
    {
      name: 'Tekniker',
      type: ShiftType.day,
      startTime: start,
      endTime: end,
      personnelType: TECH,
    },
  ];
}

function dayNight(
  dayStart: string,
  dayEnd: string,
  nightStart: string,
  nightEnd: string,
): RadiologyShiftDef[] {
  return [
    {
      name: 'Tekniker',
      type: ShiftType.day,
      startTime: dayStart,
      endTime: dayEnd,
      personnelType: TECH,
    },
    {
      name: 'Tekniker',
      type: ShiftType.night,
      startTime: nightStart,
      endTime: nightEnd,
      personnelType: TECH,
    },
  ];
}

export const BT_MASTER_DEVICES: RadiologyDeviceDef[] = [
  {
    code: 'BT-1',
    blockCode: 'B',
    deviceName: 'B Blok Fujifilm Tomografi',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'BT-2',
    blockCode: 'B',
    deviceName: 'B Blok Philips Tomografi',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'BT-3',
    blockCode: 'C',
    deviceName: 'C Blok Fujifilm Tomografi',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'BT-4',
    blockCode: 'E',
    deviceName: 'E Blok Canon Tomografi',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'BT-5',
    blockCode: 'F',
    deviceName: 'F Blok Fujifilm Tomografi',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'BT-6',
    blockCode: 'Erişkin Acil',
    deviceName: 'Erişkin Acil Fujifilm Tomografi',
    mode: 'vardiya',
    shifts: [
      ...dayNight('08:00', '20:00', '20:00', '08:00'),
      {
        name: 'Tomografi Yardımcı Tekniker',
        type: ShiftType.day,
        startTime: '08:00',
        endTime: '20:00',
        personnelType: ASSISTANT,
      },
      {
        name: 'Tomografi Yardımcı Tekniker',
        type: ShiftType.night,
        startTime: '20:00',
        endTime: '08:00',
        personnelType: ASSISTANT,
      },
    ],
  },
  {
    code: 'BT-7',
    blockCode: 'Travma Acil',
    deviceName: 'Travma Acil Fujifilm Tomografi',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
];

export const RONTGEN_MASTER_DEVICES: RadiologyDeviceDef[] = [
  {
    code: 'RÖ-1',
    blockCode: 'A',
    deviceName: 'A Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-2',
    blockCode: 'B',
    deviceName: 'B Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-3',
    blockCode: 'B',
    deviceName: 'B Blok Shimadzu Röntgen-2',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-4',
    blockCode: 'B',
    deviceName: 'B Blok Shimadzu Röntgen-3',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-5',
    blockCode: 'B',
    deviceName: 'B Blok IMS GIOTTO CLASS Mamografi',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-6',
    blockCode: 'Erişkin Acil',
    deviceName: 'Erişkin Acil Shimadzu Röntgen-1',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'RÖ-7',
    blockCode: 'Erişkin Acil',
    deviceName: 'Erişkin Acil Shimadzu Röntgen-2',
    mode: 'vardiya',
    shifts: dayNight('11:00', '18:00', '18:00', '06:00'),
  },
  {
    code: 'RÖ-8',
    blockCode: 'Travma Acil',
    deviceName: 'Travma Acil Mobil Röntgen-1',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'RÖ-9',
    blockCode: 'B',
    deviceName: 'B Blok Fsionary Kemik Dansitometri',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-10',
    blockCode: 'C',
    deviceName: 'C Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-11',
    blockCode: 'C',
    deviceName: 'C Blok Shimadzu Röntgen-2',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-12',
    blockCode: 'C',
    deviceName: 'C Blok Shimadzu Röntgen-3',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-13',
    blockCode: 'D',
    deviceName: 'D Blok Skopi-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-14',
    blockCode: 'D',
    deviceName: 'D Blok IMS GIOTTO CLASS Mamografi',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-15',
    blockCode: 'D',
    deviceName: 'D Blok Fsionary Kemik Dansitometri',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-16',
    blockCode: 'E',
    deviceName: 'E Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-17',
    blockCode: 'E',
    deviceName: 'E Blok Shimadzu Röntgen-2',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-18',
    blockCode: 'F',
    deviceName: 'F Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-19',
    blockCode: 'F',
    deviceName: 'F Blok Shimadzu Röntgen-2',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-20',
    blockCode: 'F',
    deviceName: 'F Blok IMS GIOTTO CLASS Mamografi',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-21',
    blockCode: 'F',
    deviceName: 'F Blok Fsionary Kemik Dansitometri',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-22',
    blockCode: 'H',
    deviceName: 'H Blok Shimadzu Röntgen-1',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-23',
    blockCode: 'H',
    deviceName: 'H Blok Fsionary Kemik Dansitometri',
    mode: 'polyclinic',
    shifts: singleDay('08:30', '16:30'),
  },
  {
    code: 'RÖ-24',
    blockCode: 'Travma Acil',
    deviceName: 'Travma Acil Shimadzu Röntgen-1',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'RÖ-25',
    blockCode: 'Travma Acil',
    deviceName: 'Travma Acil Mobil Röntgen-2',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
  {
    code: 'RÖ-26',
    blockCode: 'Travma Acil',
    deviceName: 'Travma Acil Mobil Röntgen-3',
    mode: 'vardiya',
    shifts: dayNight('08:00', '20:00', '20:00', '08:00'),
  },
];

/**
 * Applies the master BT/Röntgen configuration idempotently:
 *  - upserts every master device (name, blockCode, mode, workDays, isMaster=true)
 *  - upserts every master shift template (isMaster=true + flags)
 *  - deactivates any BT/Röntgen shift template that contradicts the master set
 */
export async function applyRadiologyMasterConfig(
  prisma: PrismaClient,
  organizationId: string,
  btUnitId: string,
  rontgenUnitId: string,
): Promise<{ created: number; updated: number; deactivated: number }> {
  const stats = { created: 0, updated: 0, deactivated: 0 };

  async function applyUnit(
    unitId: string,
    defs: RadiologyDeviceDef[],
    requiredSkills: string[],
  ) {
    for (const def of defs) {
      const device = await prisma.device.upsert({
        where: { organizationId_code: { organizationId, code: def.code } },
        update: {
          name: def.deviceName,
          blockCode: def.blockCode,
          isMaster: true,
          unitId,
          mode: def.mode,
          workDays:
            def.mode === 'polyclinic' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
        },
        create: {
          code: def.code,
          name: def.deviceName,
          unitId,
          mode: def.mode,
          organizationId,
          requiredSkills,
          workDays:
            def.mode === 'polyclinic' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
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
          unitId,
          organizationId,
          deviceId: device.id,
        };

        if (match) {
          const needsUpdate =
            match.name !== shiftDef.name ||
            match.isMaster !== true ||
            match.isActive !== true ||
            match.blockId !== (shiftDef.blockId ?? null) ||
            match.optionalOnWeekends !==
              (shiftDef.optionalOnWeekends ?? false) ||
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
                unitId,
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
  }

  await applyUnit(btUnitId, BT_MASTER_DEVICES, ['BT_CERTIFIED']);
  await applyUnit(rontgenUnitId, RONTGEN_MASTER_DEVICES, ['XRAY_CERTIFIED']);

  return stats;
}
