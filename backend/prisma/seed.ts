import { PrismaClient, ShiftType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { applyMrMasterConfig } from './mri-master-config';
import { applyRadiologyMasterConfig } from './radiology-master-config';
import { applyNukleerMasterConfig } from './nukleer-master-config';

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123';
const ADMIN2_PASSWORD = process.env.SEED_ADMIN_2_PASSWORD || 'Admin123!';
const TECHNICIAN_PASSWORD =
  process.env.SEED_TECHNICIAN_PASSWORD || 'technician123';

async function main() {
  console.log('Seeding database...');

  const admin1Hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin2Hash = await bcrypt.hash(ADMIN2_PASSWORD, 10);

  const admin1 = await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {},
    create: {
      email: 'admin@hospital.com',
      password: admin1Hash,
      name: 'Sistem Yöneticisi',
      role: 'system_admin',
    },
  });
  console.log(`Seeded user: ${admin1.email}`);

  const admin2 = await prisma.user.upsert({
    where: { email: 'admin@vardiyaos.com' },
    update: {},
    create: {
      email: 'admin@vardiyaos.com',
      password: admin2Hash,
      name: 'Admin Kullanıcı',
      role: 'system_admin',
    },
  });
  console.log(`Seeded user: ${admin2.email}`);

  const techUser = await prisma.user.upsert({
    where: { email: 'technician@hospital.com' },
    update: {},
    create: {
      email: 'technician@hospital.com',
      password: await bcrypt.hash(TECHNICIAN_PASSWORD, 10),
      name: 'Teknisyen',
      role: 'technician',
    },
  });
  console.log(`Seeded user: ${techUser.email}`);

  const org = await prisma.organization.upsert({
    where: { code: 'HOSPITAL-001' },
    update: {},
    create: {
      name: 'Radyoloji Merkezi',
      code: 'HOSPITAL-001',
    },
  });

  const hospitalGroup = await prisma.hospitalGroup.upsert({
    where: { code: 'ACME' },
    update: {},
    create: { name: 'ACME Sağlık Grubu', code: 'ACME' },
  });
  await prisma.$executeRawUnsafe(
    'UPDATE hospital_groups SET path = text2ltree(code) WHERE id = $1 AND path IS NULL',
    hospitalGroup.id,
  );

  const hospital = await prisma.hospital.upsert({
    where: { code: 'HST-001' },
    update: {},
    create: {
      groupId: hospitalGroup.id,
      name: 'Radyoloji Merkezi',
      code: 'HST-001',
    },
  });
  await prisma.$executeRawUnsafe(
    "UPDATE hospitals SET path = text2ltree(replace(lower((SELECT code FROM hospital_groups WHERE id = $1)), '-', '_') || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
    hospitalGroup.id,
    hospital.code,
    hospital.id,
  );

  await prisma.organization.update({
    where: { id: org.id },
    data: { hospitalId: hospital.id },
  });

  const medGorDirectorate = await prisma.directorate.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'MED_GOR' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'Medikal Görüntüleme',
      code: 'MED_GOR',
    },
  });

  const nuksDirectorate = await prisma.directorate.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'NUKS_TIP' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'Nükleer Tıp ve Radyasyon Onkolojisi',
      code: 'NUKS_TIP',
    },
  });

  for (const d of [medGorDirectorate, nuksDirectorate]) {
    await prisma.$executeRawUnsafe(
      "UPDATE directorates SET path = text2ltree(replace(lower((SELECT code FROM hospitals WHERE id = $1)), '-', '_') || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
      d.hospitalId,
      d.code,
      d.id,
    );
  }

  const deptRad = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'RADYOLOJI' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      directorateId: medGorDirectorate.id,
      name: 'Radyoloji',
      code: 'RADYOLOJI',
    },
  });

  const deptNukleer = await prisma.department.upsert({
    where: {
      hospitalId_code: { hospitalId: hospital.id, code: 'NUKLEER_TIP' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      directorateId: nuksDirectorate.id,
      name: 'Nükleer Tıp',
      code: 'NUKLEER_TIP',
    },
  });

  const deptOnkoloji = await prisma.department.upsert({
    where: {
      hospitalId_code: { hospitalId: hospital.id, code: 'RADYONKOLOJI' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      directorateId: nuksDirectorate.id,
      name: 'Radyasyon Onkolojisi',
      code: 'RADYONKOLOJI',
    },
  });

  const deptGirisimsel = await prisma.department.upsert({
    where: { hospitalId_code: { hospitalId: hospital.id, code: 'GIRISIMSEL' } },
    update: {},
    create: {
      hospitalId: hospital.id,
      directorateId: medGorDirectorate.id,
      name: 'Girişimsel Radyoloji',
      code: 'GIRISIMSEL',
    },
  });

  for (const d of [deptRad, deptNukleer, deptOnkoloji, deptGirisimsel]) {
    await prisma.$executeRawUnsafe(
      "UPDATE departments SET path = text2ltree(replace(lower((SELECT code FROM hospitals WHERE id = $1)), '-', '_') || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
      d.hospitalId,
      d.code,
      d.id,
    );
  }

  const deptMap: Record<string, string> = {
    mr: deptRad.id,
    bt: deptRad.id,
    rontgen: deptRad.id,
    nukleer: deptNukleer.id,
    onkoloji: deptOnkoloji.id,
    supervizor: deptRad.id,
  };

  const mrUnit = await prisma.unit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MR' } },
    update: {},
    create: {
      name: 'MR (Manyetik Rezonans)',
      code: 'MR',
      type: 'mr',
      organizationId: org.id,
      departmentId: deptRad.id,
      hospitalId: hospital.id,
    },
  });

  const btUnit = await prisma.unit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'BT' } },
    update: {},
    create: {
      name: 'BT (Bilgisayarlı Tomografi)',
      code: 'BT',
      type: 'bt',
      organizationId: org.id,
    },
  });

  const rontgenUnit = await prisma.unit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RONTGEN' } },
    update: {},
    create: {
      name: 'Röntgen',
      code: 'RONTGEN',
      type: 'rontgen',
      organizationId: org.id,
    },
  });

  const nukleerUnit = await prisma.unit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'NUKLEER' } },
    update: {},
    create: {
      name: 'Nükleer Tıp',
      code: 'NUKLEER',
      type: 'nukleer',
      organizationId: org.id,
    },
  });

  const onkolojiUnit = await prisma.unit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RONK' } },
    update: {},
    create: {
      name: 'Radyasyon Onkolojisi',
      code: 'RONK',
      type: 'onkoloji',
      organizationId: org.id,
    },
  });

  const supervizorUnit = await prisma.unit.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: 'SUPERVIZOR' },
    },
    update: {},
    create: {
      name: 'Süpervizör Birimi',
      code: 'SUPERVIZOR',
      type: 'supervizor',
      organizationId: org.id,
      departmentId: deptRad.id,
      hospitalId: hospital.id,
    },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'mr'::"UnitType" AND "departmentId" IS NULL`,
    deptRad.id,
    hospital.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'bt'::"UnitType" AND "departmentId" IS NULL`,
    deptRad.id,
    hospital.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'rontgen'::"UnitType" AND "departmentId" IS NULL`,
    deptRad.id,
    hospital.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'nukleer'::"UnitType" AND "departmentId" IS NULL`,
    deptNukleer.id,
    hospital.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'onkoloji'::"UnitType" AND "departmentId" IS NULL`,
    deptOnkoloji.id,
    hospital.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE units SET "departmentId" = $1, "hospitalId" = $2
     WHERE type = 'supervizor'::"UnitType" AND "departmentId" IS NULL`,
    deptRad.id,
    hospital.id,
  );
  const allUnits = await prisma.unit.findMany({
    where: { organizationId: org.id },
  });
  for (const u of allUnits) {
    await prisma.$executeRawUnsafe(
      "UPDATE units SET path = text2ltree(replace(lower((SELECT code FROM hospitals WHERE id = $1)), '-', '_') || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
      hospital.id,
      u.code,
      u.id,
    );
  }

  const areaData: {
    unitId: string;
    name: string;
    code: string;
    type: string;
  }[] = [];
  for (const u of allUnits) {
    areaData.push({
      unitId: u.id,
      name: `${u.name} - Tarama Alanı 1`,
      code: `${u.code}_SCAN1`,
      type: 'scanning',
    });
    areaData.push({
      unitId: u.id,
      name: `${u.name} - Kontrol Odası`,
      code: `${u.code}_CTRL`,
      type: 'control',
    });
    areaData.push({
      unitId: u.id,
      name: `${u.name} - Hazırlık Alanı`,
      code: `${u.code}_PREP`,
      type: 'preparation',
    });
  }

  const createdAreas: any[] = [];
  for (const a of areaData) {
    const area = await prisma.area.upsert({
      where: { unitId_code: { unitId: a.unitId, code: a.code } },
      update: {},
      create: {
        unitId: a.unitId,
        name: a.name,
        code: a.code,
        type: a.type as any,
      },
    });
    createdAreas.push(area);
  }

  for (const a of createdAreas) {
    const unit = allUnits.find((u: any) => u.id === a.unitId);
    if (unit) {
      await prisma.$executeRawUnsafe(
        "UPDATE areas SET path = text2ltree((SELECT path::text FROM units WHERE id = $1) || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
        a.unitId,
        a.code,
        a.id,
      );
    }
  }

  const roomNames = ['Oda-1', 'Oda-2'];
  const createdRooms: any[] = [];
  for (const area of createdAreas) {
    for (const roomName of roomNames) {
      const code = `${area.code}_${roomName.replace('-', '')}`;
      const room = await prisma.room.upsert({
        where: { areaId_code: { areaId: area.id, code } },
        update: {},
        create: {
          areaId: area.id,
          name: `${area.name} - ${roomName}`,
          code,
          type: 'patient_exam' as any,
        },
      });
      createdRooms.push(room);
    }
  }

  for (const r of createdRooms) {
    const area = createdAreas.find((a: any) => a.id === r.areaId);
    if (area) {
      await prisma.$executeRawUnsafe(
        "UPDATE rooms SET path = text2ltree((SELECT path::text FROM areas WHERE id = $1) || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
        r.areaId,
        r.code,
        r.id,
      );
    }
  }

  const allRooms = await prisma.room.findMany();
  for (const dev of await prisma.device.findMany({
    where: { organizationId: org.id },
  })) {
    const matchingRoom = allRooms.find((r: any) =>
      r.code.startsWith(dev.unitId.slice(0, 8)),
    );
    if (matchingRoom) {
      await prisma.$executeRawUnsafe(
        "UPDATE devices SET path = text2ltree((SELECT path::text FROM rooms WHERE id = $1) || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
        matchingRoom.id,
        dev.code,
        dev.id,
      );
    }
  }

  const DEMO_TECHNICIAN_PASSWORD =
    process.env.SEED_DEMO_TECHNICIAN_PASSWORD || '123456';

  const demoTechnician = await prisma.user.upsert({
    where: { email: 'tekniker@test.local' },
    update: {},
    create: {
      email: 'tekniker@test.local',
      password: await bcrypt.hash(DEMO_TECHNICIAN_PASSWORD, 10),
      name: 'Demo Tekniker',
      role: 'technician',
      organizationId: org.id,
      unitId: rontgenUnit.id,
    },
  });
  console.log(
    `Seeded user: ${demoTechnician.email} (${demoTechnician.role}, unit: Röntgen)`,
  );

  type DeviceSeed = {
    code: string;
    name: string;
    mode: 'vardiya' | 'polyclinic';
  };

  const mrDevices: DeviceSeed[] = [
    { code: 'MR-A', name: 'A Blok Açık MR', mode: 'vardiya' },
    { code: 'MR-B', name: 'B Blok Philips MR', mode: 'vardiya' },
    { code: 'MR-C', name: 'B Blok Fuji MR', mode: 'vardiya' },
    { code: 'MR-D', name: 'C Blok Philips 3T MR', mode: 'vardiya' },
    { code: 'MR-E', name: 'C Blok Fuji MR', mode: 'vardiya' },
    { code: 'MR-F', name: 'D Blok Fuji MR', mode: 'vardiya' },
    { code: 'MR-G', name: 'F Blok Philips MR', mode: 'vardiya' },
    { code: 'MR-H', name: 'Erişkin Acil MR', mode: 'vardiya' },
  ];

  for (const device of mrDevices) {
    await prisma.device.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: device.code },
      },
      update: { isActive: true },
      create: {
        code: device.code,
        name: device.name,
        unitId: mrUnit.id,
        mode: device.mode,
        organizationId: org.id,
        requiredSkills: ['MR_CERTIFIED'],
        workDays:
          device.mode === 'polyclinic'
            ? [1, 2, 3, 4, 5]
            : [0, 1, 2, 3, 4, 5, 6],
      },
    });
  }

  // NOTE: BT (Tomografi) and Röntgen devices + shift templates are managed by
  // applyRadiologyMasterConfig() (radiology-master-config.ts) — do not add
  // BT/Röntgen entries here.
  const radiologyMasterStats = await applyRadiologyMasterConfig(
    prisma,
    org.id,
    btUnit.id,
    rontgenUnit.id,
  );
  console.log(
    `Radiology (BT+Röntgen) master config applied: created=${radiologyMasterStats.created}, updated=${radiologyMasterStats.updated}, deactivated=${radiologyMasterStats.deactivated}`,
  );

  // NOTE: Nükleer Tıp (NT) devices + shift templates are managed by
  // applyNukleerMasterConfig() (nukleer-master-config.ts) — do not add
  // NT entries here.
  const nukleerMasterStats = await applyNukleerMasterConfig(
    prisma,
    org.id,
    nukleerUnit.id,
  );
  console.log(
    `Nükleer Tıp master config applied: created=${nukleerMasterStats.created}, updated=${nukleerMasterStats.updated}, deactivated=${nukleerMasterStats.deactivated}`,
  );

  const onkolojiDevices: DeviceSeed[] = [
    { code: 'RONK-1', name: 'Lineer Hızlandırıcı-1', mode: 'vardiya' },
    { code: 'RONK-2', name: 'Lineer Hızlandırıcı-2', mode: 'vardiya' },
    { code: 'RONK-3', name: 'Lineer Hızlandırıcı-3', mode: 'vardiya' },
    { code: 'RONK-4', name: 'Simülasyon CT', mode: 'polyclinic' },
  ];

  for (const device of onkolojiDevices) {
    await prisma.device.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: device.code },
      },
      update: { isActive: true },
      create: {
        code: device.code,
        name: device.name,
        unitId: onkolojiUnit.id,
        mode: device.mode,
        organizationId: org.id,
        requiredSkills: ['ONCOLOGY_CERTIFIED'],
        workDays:
          device.mode === 'polyclinic'
            ? [1, 2, 3, 4, 5]
            : [0, 1, 2, 3, 4, 5, 6],
      },
    });
  }

  const personnelNames = [
    'Ahmet Yılmaz',
    'Mehmet Kaya',
    'Ayşe Demir',
    'Fatma Şahin',
    'Ali Öztürk',
    'Zeynep Çelik',
    'Hüseyin Koç',
    'Elif Arslan',
    'İbrahim Doğan',
    'Hatice Korkmaz',
    'Murat Yıldırım',
    'Emine Yıldız',
    'Mustafa Aydın',
    'Şükran Özkan',
    'Ahmet Acar',
    'Fatma Gül',
    'Ali Şimşek',
    'Zehra Yavuz',
    'Hakan Aktaş',
    'Ayşegül Çakır',
    'Ömer Karadeniz',
    'Derya Yalçın',
    'Burak Ateş',
    'Seda Kurşun',
    'Caner Polat',
    'Merve Özdemir',
    'Gökhan Şen',
    'Büşra Kılıç',
    'Oğuzhan Arslan',
    'Pınar Ay',
  ];

  const roles = [
    'technician',
    'technician',
    'technician',
    'supervisor',
    'senior_technician',
    'technician',
    'technician',
    'technician',
    'medical_engineer',
    'secretary',
  ];
  const specializations: Record<string, string> = {
    MR: 'MR Görüntüleme',
    BT: 'BT Görüntüleme',
    rontgen: 'Röntgen Görüntüleme',
    nukleer: 'Nükleer Tıp Görüntüleme',
    onkoloji: 'Radyasyon Onkolojisi',
  };

  const units = [mrUnit, btUnit, rontgenUnit, nukleerUnit, onkolojiUnit];
  const skills = [
    'MR_CERTIFIED',
    'BT_CERTIFIED',
    'XRAY_CERTIFIED',
    'NUCLEAR_CERTIFIED',
    'ONCOLOGY_CERTIFIED',
    '',
  ];

  for (let i = 0; i < personnelNames.length; i++) {
    const unit = units[i % units.length];
    const skill = skills[Math.floor(i / 5)];
    const role = roles[i % roles.length];
    const unitName = specializations[unit.type] || unit.name;

    await prisma.personnel.upsert({
      where: { id: `personnel-${i + 1}` },
      update: {},
      create: {
        id: `personnel-${i + 1}`,
        name: personnelNames[i],
        email: `${personnelNames[i].toLowerCase().replace(/ /g, '.').replace(/[ı]/g, 'i').replace(/[ş]/g, 's').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c').replace(/[ü]/g, 'u').replace(/[ğ]/g, 'g')}@hospital.com`,
        unitId: unit.id,
        skills: [skill],
        seniority: Math.floor(Math.random() * 15) + 1,
        role,
        employeeNo: `EMP-${String(i + 1).padStart(4, '0')}`,
        phone: `05${String(5000000000 + i).slice(0, 9)}`,
        specialization: unitName,
        experienceYears: Math.floor(Math.random() * 15) + 1,
        deviceSkills: [skill.replace('_CERTIFIED', '')],
        nightShiftEligible: i % 3 !== 0,
        employmentStatus: i < 3 ? 'on_leave' : 'active',
        startDate: new Date(2024, i % 12, 1),
        notes: i % 4 === 0 ? `Kıdemli ${unitName} teknisyeni` : undefined,
      },
    });
  }

  const holidays2026 = [
    { date: '2026-01-01', name: 'Yılbaşı', type: 'national', year: 2026 },
    {
      date: '2026-04-23',
      name: 'Ulusal Egemenlik ve Çocuk Bayramı',
      type: 'national',
      year: 2026,
    },
    {
      date: '2026-05-01',
      name: 'Emek ve Dayanışma Günü',
      type: 'national',
      year: 2026,
    },
    {
      date: '2026-05-19',
      name: "Atatürk'ü Anma ve Gençlik ve Spor Bayramı",
      type: 'national',
      year: 2026,
    },
    {
      date: '2026-06-15',
      name: 'Kurban Bayramı Arifesi',
      type: 'religious',
      year: 2026,
    },
    {
      date: '2026-06-16',
      name: 'Kurban Bayramı 1. Gün',
      type: 'religious',
      year: 2026,
    },
    {
      date: '2026-06-17',
      name: 'Kurban Bayramı 2. Gün',
      type: 'religious',
      year: 2026,
    },
    {
      date: '2026-06-18',
      name: 'Kurban Bayramı 3. Gün',
      type: 'religious',
      year: 2026,
    },
    {
      date: '2026-06-19',
      name: 'Kurban Bayramı 4. Gün',
      type: 'religious',
      year: 2026,
    },
    {
      date: '2026-07-15',
      name: 'Demokrasi ve Milli Birlik Günü',
      type: 'national',
      year: 2026,
    },
    { date: '2026-08-30', name: 'Zafer Bayramı', type: 'national', year: 2026 },
    {
      date: '2026-10-29',
      name: 'Cumhuriyet Bayramı',
      type: 'national',
      year: 2026,
    },
  ];

  for (const holiday of holidays2026) {
    await prisma.holiday.upsert({
      where: { date: holiday.date },
      update: {},
      create: holiday,
    });
  }

  const mrDevicesList = await prisma.device.findMany({
    where: { unitId: mrUnit.id },
    take: 3,
  });
  const rontgenDevicesList = await prisma.device.findMany({
    where: { unitId: rontgenUnit.id },
    take: 3,
  });

  const demoIncidents = [
    {
      issueType: 'arıza',
      severity: 'high',
      description:
        'Cihaz açılışta hata veriyor, görüntü alınamıyor. Acil müdahale gerekli.',
      deviceId: mrDevicesList[0]?.id || null,
      unitId: mrUnit.id,
      userId: demoTechnician.id,
    },
    {
      issueType: 'bakım ihtiyacı',
      severity: 'medium',
      description: 'Periyodik bakım zamanı gelmiş. Filtreler değişmeli.',
      deviceId: rontgenDevicesList[1]?.id || null,
      unitId: rontgenUnit.id,
      userId: admin1.id,
    },
    {
      issueType: 'görüntü kalitesi sorunu',
      severity: 'critical',
      description: 'Görüntülerde artefakt var. Detaylı inceleme gerekiyor.',
      deviceId: mrDevicesList[1]?.id || null,
      unitId: mrUnit.id,
      userId: demoTechnician.id,
    },
    {
      issueType: 'cihaz offline',
      severity: 'high',
      description: 'Cihaz ağa bağlanamıyor, tüm çevrimiçi işlemler durdu.',
      deviceId: rontgenDevicesList[0]?.id || null,
      unitId: rontgenUnit.id,
      userId: demoTechnician.id,
    },
    {
      issueType: 'kalibrasyon problemi',
      severity: 'medium',
      description:
        'Haftalık kalibrasyon doğrulaması başarısız. Tekrar kalibrasyon gerekli.',
      deviceId: mrDevicesList[2]?.id || null,
      unitId: mrUnit.id,
      userId: admin1.id,
    },
  ];

  for (const inc of demoIncidents) {
    await prisma.deviceIncident.create({ data: inc });
  }
  console.log(`Seeded ${demoIncidents.length} demo device incidents`);

  await prisma.$executeRawUnsafe(
    `UPDATE devices SET path = text2ltree(
       (SELECT path::text FROM rooms WHERE id = devices."roomId") || '.' || replace(lower(code), '-', '_')
     )
     WHERE path IS NULL AND "roomId" IS NOT NULL`,
  );
  if (!createdRooms.length) {
    for (const u of allUnits) {
      await prisma.$executeRawUnsafe(
        "UPDATE units SET path = text2ltree(replace(lower((SELECT code FROM hospitals WHERE id = $1)), '-', '_') || '.' || replace(lower($2), '-', '_')) WHERE id = $3 AND path IS NULL",
        hospital.id,
        u.code,
        u.id,
      );
    }
  }
  console.log('Updated hierarchy ltree paths');

  function singleDayShift(start: string, end: string, duration: number) {
    return {
      type: ShiftType.day as ShiftType,
      startTime: start,
      endTime: end,
      durationHours: duration,
    };
  }
  function dayNightShift(dayStart: string, nightStart: string) {
    return [
      {
        type: ShiftType.day as ShiftType,
        startTime: dayStart,
        endTime: '20:00',
        durationHours: 12,
      },
      {
        type: ShiftType.night as ShiftType,
        startTime: nightStart,
        endTime: '08:00',
        durationHours: 12,
      },
    ];
  }

  const assistantTechShiftDefs: Array<{
    deviceCode: string;
    shifts: Array<{
      type: ShiftType;
      startTime: string;
      endTime: string;
      durationHours: number;
    }>;
  }> = [
    // NOTE: MRI device+shift templates are managed by applyMrMasterConfig()
    // (mri-master-config.ts) — do not add MR entries here.
    // NOTE: BT (Tomografi) and Röntgen device+shift templates are managed by
    // applyRadiologyMasterConfig() (radiology-master-config.ts) — do not add
    // BT/Röntgen entries here.
    // NOTE: Nükleer Tıp device+shift templates are managed by
    // applyNukleerMasterConfig() (nukleer-master-config.ts) — do not add
    // NT entries here.
    // Onkoloji devices
    { deviceCode: 'RONK-1', shifts: dayNightShift('08:00', '20:00') },
    { deviceCode: 'RONK-2', shifts: dayNightShift('08:00', '20:00') },
    { deviceCode: 'RONK-3', shifts: dayNightShift('08:00', '20:00') },
    { deviceCode: 'RONK-4', shifts: [singleDayShift('08:00', '17:00', 9)] },
  ];

  for (const entry of assistantTechShiftDefs) {
    const device = await prisma.device.findFirst({
      where: { code: entry.deviceCode, organizationId: org.id },
    });
    if (!device) {
      console.warn(
        `Device ${entry.deviceCode} not found, skipping assistant tech shifts`,
      );
      continue;
    }
    for (const shiftDef of entry.shifts) {
      const existing = await prisma.shifts.findFirst({
        where: {
          name: 'Yardımcı Tekniker',
          organizationId: org.id,
          deviceId: device.id,
          type: shiftDef.type,
        },
      });
      if (!existing) {
        await prisma.shifts.create({
          data: {
            name: 'Yardımcı Tekniker',
            type: shiftDef.type,
            startTime: shiftDef.startTime,
            endTime: shiftDef.endTime,
            durationHours: shiftDef.durationHours,
            organizationId: org.id,
            unitId: device.unitId,
            deviceId: device.id,
            personnelType: 'assistant_technician',
          },
        });
      }
    }
  }
  console.log('Seeded assistant technician shifts');

  const mrMasterStats = await applyMrMasterConfig(prisma, org.id, mrUnit.id);
  console.log(
    `MRI master config applied: created=${mrMasterStats.created}, updated=${mrMasterStats.updated}, deactivated=${mrMasterStats.deactivated}`,
  );

  console.log('Seeding completed!');
  console.log('Admin user: admin@hospital.com');
  console.log('Technician user: technician@hospital.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
