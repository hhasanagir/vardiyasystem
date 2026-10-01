import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = process.env.SEED_PERSONNEL_PASSWORD || '123456';

interface PersonnelRow {
  name: string;
  unitCode: string;
  title: string;
}

const personnelList: PersonnelRow[] = [
  {
    name: 'Mehmet Aslan',
    unitCode: 'MR',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  { name: 'Sezer Köklü', unitCode: 'MR', title: 'Tıbbi Görüntüleme Teknikeri' },
  { name: 'Uğur Aslan', unitCode: 'MR', title: 'Tıbbi Görüntüleme Teknikeri' },
  {
    name: 'Umutcan Yılmaz',
    unitCode: 'MR',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  { name: 'Onur Çeçen', unitCode: 'MR', title: 'Tıbbi Görüntüleme Teknikeri' },
  { name: 'Aziz Demir', unitCode: 'MR', title: 'Saha Sorumlusu' },
  {
    name: 'Furkan Tokan',
    unitCode: 'BT',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  {
    name: 'Semih Yıldız',
    unitCode: 'BT',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  {
    name: 'Seda Nur Demir',
    unitCode: 'BT',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  {
    name: 'Sema Nur Demir',
    unitCode: 'BT',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  { name: 'Ali Damar', unitCode: 'BT', title: 'Tıbbi Görüntüleme Teknikeri' },
  {
    name: 'Oğuz Osman Esen',
    unitCode: 'RONTGEN',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  {
    name: 'Eren Güleç',
    unitCode: 'RONTGEN',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  {
    name: 'Ahmet Vural',
    unitCode: 'RONTGEN',
    title: 'Tıbbi Görüntüleme Teknikeri',
  },
  { name: 'Fatma Ay', unitCode: 'RONTGEN', title: 'Saha Sorumlusu' },
  { name: 'Hasan Basri Yıldız', unitCode: 'NUKLEER', title: 'Saha Sorumlusu' },
  { name: 'Bünyamin Çalışkan', unitCode: 'RONK', title: 'Saha Sorumlusu' },
  { name: 'Yalçın Ciner', unitCode: 'MR', title: 'Süpervizör' },
  { name: 'İsmail Toraman', unitCode: 'MR', title: 'Süpervizör' },
  { name: 'Uğur Şentürk', unitCode: 'MR', title: 'Baştekniker' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ /g, '.')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g')
    .replace(/î/g, 'i');
}

function roleFromTitle(title: string): string {
  if (title.includes('Süpervizör')) return 'supervisor';
  if (title.includes('Baştekniker')) return 'head_technician';
  if (title.includes('Saha Sorumlusu')) return 'field_supervisor';
  return 'technician';
}

function userRoleFromTitle(title: string): string {
  if (title.includes('Süpervizör')) return 'supervisor';
  if (title.includes('Baştekniker')) return 'senior_technician';
  if (title.includes('Saha Sorumlusu')) return 'supervisor';
  return 'technician';
}

async function main() {
  console.log('Seeding real personnel...');

  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found. Run seed.ts first.');
    process.exit(1);
  }
  console.log(`Organization: ${org.name} (${org.code})`);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  let count = 0;

  for (const [idx, p] of personnelList.entries()) {
    const unit = await prisma.unit.findUnique({
      where: {
        organizationId_code: { organizationId: org.id, code: p.unitCode },
      },
    });
    if (!unit) {
      console.warn(`  Unit ${p.unitCode} not found, skipping ${p.name}`);
      continue;
    }

    const email = `${slugify(p.name)}@hospital.com`;
    const employeeNo = `EMP-${String(idx + 1).padStart(4, '0')}`;
    const role = roleFromTitle(p.title);

    const existing = await prisma.personnel.findFirst({
      where: { OR: [{ employeeNo }, { name: p.name }] },
    });

    if (existing) {
      await prisma.personnel.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          role,
          unitId: unit.id,
          employeeNo,
          specialization: unit.name,
          isActive: true,
        },
      });
    } else {
      await prisma.personnel.create({
        data: {
          name: p.name,
          role,
          unitId: unit.id,
          email,
          employeeNo,
          phone: `05${String(5000000000 + idx).slice(0, 9)}`,
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
    }

    await prisma.user.upsert({
      where: { email },
      update: {
        name: p.name,
        role: userRoleFromTitle(p.title) as any,
        organizationId: org.id,
        unitId: unit.id,
        isActive: true,
      },
      create: {
        email,
        password: passwordHash,
        name: p.name,
        role: userRoleFromTitle(p.title) as any,
        organizationId: org.id,
        unitId: unit.id,
        isActive: true,
      },
    });

    console.log(
      `  ${idx + 1}. ${p.name.padEnd(22)} ${p.unitCode.padEnd(10)} ${p.title.padEnd(30)} -> ${role}`,
    );
    count++;
  }

  console.log(`\nDone! ${count} personnel inserted/updated.`);
  console.log(`Default password for all: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
