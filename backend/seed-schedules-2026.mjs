import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MONTH = 7;
const YEAR = 2026;

const ASSISTANT_TECHS = {
  MR: [
    'Yusuf Erdoğan',
    'Hakan Çelik',
    'Burak Kaya',
    'Mert Aydın',
    'Emirhan Yıldırım',
    'Arda Güneş',
    'Furkan Demirtaş',
    'Kerem Akbulut',
  ],
  BT: [
    'Emre Şahin',
    'Kaan Yıldız',
    'Berkay Doğan',
    'Can Öztürk',
    'Ege Arslan',
    'Umut Koç',
    'Alper Tekin',
    'Batuhan Şen',
  ],
  RONTGEN: [
    'Mustafa Acar',
    'İbrahim Güneş',
    'Halil Karaca',
    'Ramazan Kurt',
    'Serkan Polat',
    'Tolga Arslan',
    'Volkan Demir',
    'Cem Koç',
    'Adem Şahin',
    'Mehmetcan Yavuz',
    'Ömer Faruk Çetin',
    'Muhammed Ali Kaya',
    'Selim Özdemir',
    'Kadir Erdoğan',
  ],
  NUKLEER: ['Deniz Yalçın', 'Barış Aksoy', 'Mertcan Erdem', 'Yiğit Savaş'],
  RONK: ['Efe Duran', 'Koray Sezer', 'Emrecan Toprak'],
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ /g, '.')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g');
}

async function createAssistantTechnicians(orgId, unit, names) {
  const created = [];
  for (const name of names) {
    const email = `${slugify(name)}@hospital.com`;
    const existing = await prisma.personnel.findFirst({
      where: { OR: [{ email }, { name }] },
    });
    if (existing) {
      await prisma.personnel.update({
        where: { id: existing.id },
        data: { role: 'assistant_technician', unitId: unit.id, isActive: true },
      });
      created.push(existing.id);
      continue;
    }
    const p = await prisma.personnel.create({
      data: {
        name,
        role: 'assistant_technician',
        unitId: unit.id,
        email,
        skills: [],
        seniority: 1,
        specialization: unit.name,
        experienceYears: 1,
        deviceSkills: [],
        nightShiftEligible: true,
        employmentStatus: 'active',
        startDate: new Date('2024-01-01'),
        isActive: true,
        offDays: [],
        maxWeeklyHours: 40,
      },
    });
    created.push(p.id);
  }
  return created;
}

function isHoliday(dateStr) {
  const holidays2026 = new Set(['2026-07-15']);
  return holidays2026.has(dateStr);
}

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

async function main() {
  console.log('Seeding July 2026 schedules and assignments...');

  const org = await prisma.organization.findFirst({
    where: { code: 'HOSPITAL-001' },
  });
  if (!org) {
    console.error('Organization HOSPITAL-001 not found. Run seed.ts first.');
    process.exit(1);
  }

  const units = await prisma.unit.findMany({
    where: { organizationId: org.id },
  });

  for (const unit of units) {
    let schedule = await prisma.schedule.findUnique({
      where: {
        unitId_month_year: { unitId: unit.id, month: MONTH, year: YEAR },
      },
    });
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
    }

    const devices = await prisma.device.findMany({
      where: { unitId: unit.id, isActive: true },
    });
    if (devices.length === 0) {
      console.log(
        `  Schedule for ${unit.code}: 0 devices, skipped assignments`,
      );
      continue;
    }

    const techNames = ASSISTANT_TECHS[unit.code] || [];
    if (techNames.length === 0) {
      console.log(
        `  Schedule for ${unit.code}: no assistant tech pool, skipped`,
      );
      continue;
    }
    const techIds = await createAssistantTechnicians(org.id, unit, techNames);

    const shiftDefs = await prisma.shifts.findMany({
      where: {
        organizationId: org.id,
        deviceId: { in: devices.map((d) => d.id) },
        isActive: true,
      },
    });

    const techPool = await prisma.personnel.findMany({
      where: { id: { in: techIds } },
    });

    const existingAssignments = await prisma.assignment.findMany({
      where: { scheduleId: schedule.id },
    });
    const occupiedSlots = new Set(
      existingAssignments.map((a) => `${a.deviceId}|${a.date}|${a.shiftType}`),
    );
    const personSlots = new Set(
      existingAssignments.map(
        (a) => `${a.personnelId}|${a.date}|${a.shiftType}`,
      ),
    );

    let created = 0;
    let skipped = 0;
    const busyByDay = new Map();
    const rotator = new Map();

    for (let day = 1; day <= 31; day++) {
      const dateStr = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(YEAR, MONTH - 1, day);
      const holiday = isHoliday(dateStr);
      const weekend = isWeekend(date);
      const busy = busyByDay.get(dateStr) || new Set();

      for (const device of devices) {
        const defs = shiftDefs.filter((s) => s.deviceId === device.id);
        for (const def of defs) {
          if (device.mode === 'polyclinic' && (weekend || holiday)) {
            skipped++;
            continue;
          }

          const slotKey = `${device.id}|${dateStr}|${def.type}`;
          if (occupiedSlots.has(slotKey)) {
            skipped++;
            continue;
          }

          let start = (rotator.get(device.id) || 0) % techPool.length;
          let candidate = null;
          for (let i = 0; i < techPool.length; i++) {
            const idx = (start + i) % techPool.length;
            const t = techPool[idx];
            const pKey = `${t.id}|${dateStr}|${def.type}`;
            if (!busy.has(t.id) && !personSlots.has(pKey)) {
              candidate = t;
              start = idx + 1;
              break;
            }
          }
          rotator.set(device.id, start);
          if (!candidate) {
            skipped++;
            continue;
          }

          const assignment = await prisma.assignment.create({
            data: {
              scheduleId: schedule.id,
              personnelId: candidate.id,
              deviceId: device.id,
              date: dateStr,
              shiftType: def.type,
              startTime: def.startTime || '08:00',
              endTime: def.endTime || '20:00',
              isConfirmed: true,
            },
          });
          occupiedSlots.add(slotKey);
          personSlots.add(`${candidate.id}|${dateStr}|${def.type}`);
          busy.add(candidate.id);
          busyByDay.set(dateStr, busy);
          created++;
        }
      }
    }

    console.log(
      `  ${unit.code}: +${created} assignments (${devices.length} devices, ${techPool.length} assistant techs, ${skipped} skipped)`,
    );
  }

  console.log('Schedule seeding complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
