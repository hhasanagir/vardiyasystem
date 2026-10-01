import { PrismaClient } from '@prisma/client';
import { applyRadiologyMasterConfig } from './radiology-master-config';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found. Run the seed first.');
    process.exit(1);
  }

  const btUnit = await prisma.unit.findFirst({ where: { type: 'bt' } });
  if (!btUnit) {
    console.error('BT unit not found. Run the seed first.');
    process.exit(1);
  }

  const rontgenUnit = await prisma.unit.findFirst({
    where: { type: 'rontgen' },
  });
  if (!rontgenUnit) {
    console.error('Röntgen unit not found. Run the seed first.');
    process.exit(1);
  }

  const stats = await applyRadiologyMasterConfig(
    prisma,
    org.id,
    btUnit.id,
    rontgenUnit.id,
  );
  console.log(
    `Radiology (BT+Röntgen) master config applied: created=${stats.created}, updated=${stats.updated}, deactivated=${stats.deactivated}`,
  );

  const devices = await prisma.device.findMany({
    where: { unitId: { in: [btUnit.id, rontgenUnit.id] } },
    orderBy: { code: 'asc' },
    select: {
      code: true,
      name: true,
      blockCode: true,
      mode: true,
      isMaster: true,
    },
  });
  console.table(devices);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
