const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Unit IDs
  const mr = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const bt = '079400fa-e937-40d2-8cb9-03725e6f17a0';
  const ront = '4f450c7a-9bcb-40ff-963f-840e6686dc9f';
  const nukl = 'b24f1343-6579-4cd5-baf1-9789003e6723';
  const onk = '5f0b8cc2-33df-4f4c-8d52-d87e97d7bda8';

  // ======== MR: sadece supervisor ========
  console.log('=== MR ===');
  // Keep: supervisor. Deactivate: other, pharmacist, health_physicist, technician, assistant_technician
  let r = await prisma.personnelGroup.updateMany({
    where: {
      unitId: mr,
      code: {
        in: [
          'other',
          'pharmacist',
          'health_physicist',
          'technician',
          'assistant_technician',
        ],
      },
    },
    data: { isActive: false },
  });
  console.log(`  Deactivated ${r.count} groups`);

  // ======== BT: sadece supervisor ========
  console.log('=== BT ===');
  r = await prisma.personnelGroup.updateMany({
    where: {
      unitId: bt,
      code: {
        in: [
          'other',
          'pharmacist',
          'health_physicist',
          'technician',
          'assistant_technician',
        ],
      },
    },
    data: { isActive: false },
  });
  console.log(`  Deactivated ${r.count} groups`);

  // ======== RÖNTGEN: sadece supervisor ========
  console.log('=== RÖNTGEN ===');
  r = await prisma.personnelGroup.updateMany({
    where: {
      unitId: ront,
      code: {
        in: [
          'other',
          'pharmacist',
          'health_physicist',
          'technician',
          'assistant_technician',
        ],
      },
    },
    data: { isActive: false },
  });
  console.log(`  Deactivated ${r.count} groups`);

  // ======== NÜKLEER: supervisor + pharmacist + assistant_technician ========
  console.log('=== NÜKLEER ===');
  r = await prisma.personnelGroup.updateMany({
    where: {
      unitId: nukl,
      code: { in: ['other', 'health_physicist', 'technician'] },
    },
    data: { isActive: false },
  });
  console.log(`  Deactivated ${r.count} groups`);

  // ======== ONKOLOJİ: supervisor + health_physicist_1/2/3 + other(Planlama) ========
  console.log('=== ONKOLOJİ ===');
  r = await prisma.personnelGroup.updateMany({
    where: {
      unitId: onk,
      code: {
        in: [
          'pharmacist',
          'health_physicist',
          'technician',
          'assistant_technician',
        ],
      },
    },
    data: { isActive: false },
  });
  console.log(`  Deactivated ${r.count} groups`);

  console.log('\nDone! Verifying...');

  // Verify
  const groups = await prisma.personnelGroup.findMany({
    where: { isActive: true },
    include: { shiftTemplates: { where: { isActive: true } } },
    orderBy: [{ unitId: 'asc' }, { name: 'asc' }],
  });

  const unitNames = {
    [mr]: 'MR',
    [bt]: 'BT',
    [ront]: 'RÖNTGEN',
    [nukl]: 'NÜKLEER',
    [onk]: 'ONKOLOJİ',
  };
  let currentUnit = '';
  for (const g of groups) {
    const unitName = unitNames[g.unitId] || g.unitId;
    if (unitName !== currentUnit) {
      console.log(`\n--- ${unitName} ---`);
      currentUnit = unitName;
    }
    const templates = g.shiftTemplates
      .map((t) => `${t.name} (${t.shiftType} ${t.startTime}-${t.endTime})`)
      .join(', ');
    console.log(`  ${g.name} [${g.code}] → ${templates || 'no templates'}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
