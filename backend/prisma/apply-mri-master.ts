import { PrismaClient } from '@prisma/client';
import { applyMrMasterConfig } from './mri-master-config';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found. Run the seed first.');
    process.exit(1);
  }

  const mrUnit = await prisma.unit.findFirst({ where: { type: 'mr' } });
  if (!mrUnit) {
    console.error('MR unit not found. Run the seed first.');
    process.exit(1);
  }

  const stats = await applyMrMasterConfig(prisma, org.id, mrUnit.id);
  console.log(
    `MRI master config applied: created=${stats.created}, updated=${stats.updated}, deactivated=${stats.deactivated}`,
  );

  const devices = await prisma.device.findMany({
    where: { unitId: mrUnit.id },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, blockCode: true, isMaster: true },
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
