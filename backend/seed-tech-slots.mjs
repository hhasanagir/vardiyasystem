import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TECH_SLOT = {
  day: { startTime: '08:00', endTime: '20:00', durationHours: 12 },
  night: { startTime: '20:00', endTime: '08:00', durationHours: 12 },
};

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: 'Radyoloji Merkezi' },
  });
  if (!org) throw new Error('Radyoloji Merkezi organizasyonu bulunamadı');

  // MR, BT and Röntgen shift templates are owned by the master configs
  // (mri-master-config.ts / radiology-master-config.ts) — skip those units here.
  const masterUnits = await prisma.unit.findMany({
    where: { type: { in: ['mr', 'bt', 'rontgen'] } },
    select: { id: true },
  });
  const masterUnitIds = new Set(masterUnits.map((u) => u.id));

  const devices = await prisma.device.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  if (!devices.length) throw new Error('Cihaz bulunamadı');

  const existing = await prisma.shifts.findMany({
    where: { organizationId: org.id, deviceId: { in: devices.map((d) => d.id) } },
  });

  let created = 0;
  let skipped = 0;
  let noSlots = 0;

  for (const device of devices) {
    if (masterUnitIds.has(device.unitId)) {
      skipped++;
      continue;
    }
    const deviceSlots = existing.filter((s) => s.deviceId === device.id);
    const types = [...new Set(deviceSlots.map((s) => s.type))];
    if (!types.length) {
      noSlots++;
      continue;
    }
    for (const type of types) {
      const dup = existing.find(
        (s) => s.deviceId === device.id && s.type === type && s.personnelType === 'technician',
      );
      if (dup) {
        skipped++;
        continue;
      }
      const slot = TECH_SLOT[type] || TECH_SLOT.day;
      await prisma.shifts.create({
        data: {
          name: 'Tekniker',
          type,
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationHours: slot.durationHours,
          organizationId: org.id,
          unitId: device.unitId,
          deviceId: device.id,
          personnelType: 'technician',
        },
      });
      created++;
    }
  }

  console.log(
    `Tekniker shift slotları: ${created} yeni eklendi, ${skipped} mevcut (atlandı), ${noSlots} cihazda slot yok`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
