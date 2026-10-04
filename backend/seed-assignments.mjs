import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient: LocalClient } = require('@prisma/client');
const prisma = new LocalClient();

const MONTH = 7;
const YEAR = 2026;
const ORG_ID = 'org-001';

const SHIFT_TIMES = {
  day: { start: '08:00', end: '20:00' },
  evening: { start: '14:00', end: '20:00' },
  night: { start: '20:00', end: '08:00' },
};

async function main() {
  console.log('Seeding schedules and assignments for July 2026...');
  const units = await prisma.unit.findMany({
    where: { organizationId: ORG_ID },
  });

  for (const unit of units) {
    const existing = await prisma.schedule.findUnique({
      where: {
        unitId_month_year: { unitId: unit.id, month: MONTH, year: YEAR },
      },
    });

    let schedule = existing;
    if (!schedule) {
      schedule = await prisma.schedule.create({
        data: {
          unitId: unit.id,
          month: MONTH,
          year: YEAR,
          version: 1,
          status: 'draft',
        },
      });
      console.log(`  Created schedule for ${unit.code}`);
    }

    const devices = await prisma.device.findMany({
      where: { unitId: unit.id, isActive: true },
    });
    const personnel = await prisma.personnel.findMany({
      where: { unitId: unit.id, isActive: true },
    });

    if (devices.length === 0 || personnel.length === 0) continue;

    const shiftTypes = await prisma.shifts.findMany({
      where: {
        organizationId: ORG_ID,
        deviceId: { in: devices.map((d) => d.id) },
        isActive: true,
      },
      distinct: ['type'],
    });
    const availableShifts = shiftTypes.map((s) => s.type);

    let created = 0;
    for (let day = 1; day <= 14; day++) {
      const dateStr = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(YEAR, MONTH - 1, day).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (const device of devices) {
        for (const shiftType of availableShifts) {
          if (shiftType === 'night' && (day === 14 || day === 7)) continue;

          const personnelPool = personnel.filter(
            (p) => p.nightShiftEligible || shiftType !== 'night',
          );
          if (personnelPool.length === 0) continue;
          const person = personnelPool[created % personnelPool.length];

          const exists = await prisma.assignment.findUnique({
            where: {
              scheduleId_deviceId_date_shiftType: {
                scheduleId: schedule.id,
                deviceId: device.id,
                date: dateStr,
                shiftType,
              },
            },
          });
          if (exists) continue;

          // Avoid assigning the same person to 2 shifts the same day
          const personBusy = await prisma.assignment.findFirst({
            where: { personnelId: person.id, date: dateStr },
          });
          if (personBusy) continue;

          const times = SHIFT_TIMES[shiftType] || {
            start: '08:00',
            end: '20:00',
          };
          await prisma.assignment.create({
            data: {
              scheduleId: schedule.id,
              personnelId: person.id,
              deviceId: device.id,
              date: dateStr,
              shiftType,
              startTime: times.start,
              endTime: times.end,
              isConfirmed: true,
            },
          });
          created++;
        }
      }
    }
    console.log(
      `  +${created} assignments for ${unit.code} (${devices.length} cihaz, ${personnel.length} personel)`,
    );
  }

  console.log('Assignment seeding complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
