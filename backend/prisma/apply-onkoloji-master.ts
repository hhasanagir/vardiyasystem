import { PrismaClient } from '@prisma/client';
import { applyOnkolojiMasterConfig } from './onkoloji-master-config';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found. Run the seed first.');
    process.exit(1);
  }

  const onkUnit = await prisma.unit.findFirst({ where: { type: 'onkoloji' } });
  if (!onkUnit) {
    console.error('Onkoloji unit not found. Run the seed first.');
    process.exit(1);
  }

  const stats = await applyOnkolojiMasterConfig(prisma, org.id, onkUnit.id);
  console.log(
    `Onkoloji master config applied: created=${stats.created}, updated=${stats.updated}, deactivated=${stats.deactivated}`,
  );

  const devices = await prisma.device.findMany({
    where: { unitId: onkUnit.id },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      blockCode: true,
      mode: true,
      isMaster: true,
      workDays: true,
    },
  });
  console.table(devices);

  for (const d of devices) {
    const shifts = await prisma.shifts.findMany({
      where: { deviceId: d.id },
      orderBy: [{ type: 'asc' }, { startTime: 'asc' }],
      select: {
        type: true,
        startTime: true,
        endTime: true,
        personnelType: true,
        name: true,
        isActive: true,
        isMaster: true,
      },
    });
    console.log(
      `\n${d.code} | ${d.name} | mode=${d.mode} | master=${d.isMaster}`,
    );
    shifts.forEach((s) =>
      console.log(
        `   ${s.type} ${s.startTime}-${s.endTime} ${s.personnelType} active=${s.isActive} master=${s.isMaster} "${s.name}"`,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
