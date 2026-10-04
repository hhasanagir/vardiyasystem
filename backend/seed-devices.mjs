import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let prisma;
try {
  const { PrismaClient: LocalClient } = require('@prisma/client');
  prisma = new LocalClient();
} catch {
  prisma = new PrismaClient();
}

const ORG_ID = 'org-001';

const UNITS = {
  mr: { id: 'unit-mr', label: 'MR' },
  bt: { id: 'unit-bt', label: 'BT' },
  rontgen: { id: 'unit-rontgen', label: 'RÖNTGEN' },
  nukleer: { id: 'unit-nukleer', label: 'NÜKLEER' },
  onkoloji: { id: 'unit-onkoloji', label: 'ONKOLOJİ' },
  supervizor: { id: 'unit-supervizor', label: 'SUPERVIZOR' },
};

const SHIFT_TYPES = {
  mr: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '20:00', hours: 12 },
    { name: 'Gece', type: 'night', start: '20:00', end: '08:00', hours: 12 },
  ],
  bt: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '20:00', hours: 12 },
    { name: 'Gece', type: 'night', start: '20:00', end: '08:00', hours: 12 },
  ],
  rontgen: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '20:00', hours: 12 },
    { name: 'Gece', type: 'night', start: '20:00', end: '08:00', hours: 12 },
  ],
  nukleer: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '20:00', hours: 12 },
  ],
  onkoloji: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '14:00', hours: 6 },
    { name: 'İkindi', type: 'evening', start: '14:00', end: '20:00', hours: 6 },
    { name: 'Gece', type: 'night', start: '20:00', end: '08:00', hours: 12 },
  ],
  supervizor: [
    { name: 'Gündüz', type: 'day', start: '08:00', end: '20:00', hours: 12 },
    { name: 'Gece', type: 'night', start: '20:00', end: '08:00', hours: 12 },
  ],
};

const DEVICE_NAMES = {
  mr: [
    'Siemens Magnetom Aera 1.5T',
    'GE Signa Pioneer 3T',
    'Philips Ingenia 1.5T',
    'Canon Vantage Titan 3T',
    'Siemens Magnetom Skyra 3T',
    'GE Signa Voyager 1.5T',
    'Philips Achieva 3T',
    'Siemens Magnetom Avanto 1.5T',
  ],
  bt: [
    'Siemens Somatom Force',
    'GE Revolution EVO',
    'Philips iCT 256',
    'Canon Aquilion ONE',
    'Siemens Somatom Go.Top',
    'GE Optima CT660',
    'Siemens Somatom Definition AS',
  ],
  rontgen: [
    'Philips DigitalDiagnost C50',
    'GE Definium 8000',
    'Siemens Ysio Max',
    'Canon AeroDR',
    'Siemens Luminos Agile',
    'GE OEC 9900 Elite',
    'Siemens Cios Spin',
    'Philips Veradius Unity',
    'Carestream DRX-Evolution',
    'Siemens Multix Fusion',
    'GE Proteus XR/a',
    'Siemens Luminos dRF',
  ],
  nukleer: [
    'GE Discovery NM/CT 670',
    'Siemens Symbia T6',
    'Philips BrightView XCT',
    'Siemens Symbia Intevo',
    'GE NM 830',
    'Canon Lucida Gamma',
  ],
  onkoloji: [
    'Varian TrueBeam',
    'Elekta Versa HD',
    'Siemens Artiste',
    'GE Discovery RT',
  ],
  supervizor: ['Süpervizör Terminalli', 'Kontrol Noktası'],
};

const PERSONNEL_NAMES = {
  mr: [
    { name: 'Ahmet Yılmaz', role: 'technician' },
    { name: 'Mehmet Demir', role: 'senior_technician' },
    { name: 'Ayşe Kaya', role: 'technician' },
    { name: 'Fatma Şahin', role: 'assistant_technician' },
    { name: 'Mustafa Çelik', role: 'technician' },
    { name: 'Zeynep Aydın', role: 'assistant_technician' },
  ],
  bt: [
    { name: 'Emre Öztürk', role: 'technician' },
    { name: 'Elif Arslan', role: 'senior_technician' },
    { name: 'Burak Doğan', role: 'technician' },
    { name: 'Merve Kılıç', role: 'assistant_technician' },
    { name: 'Kerem Aslan', role: 'technician' },
  ],
  rontgen: [
    { name: 'Selin Yıldız', role: 'technician' },
    { name: 'Onur Korkmaz', role: 'senior_technician' },
    { name: 'Gizem Erdoğan', role: 'technician' },
    { name: 'Berk Çetin', role: 'assistant_technician' },
    { name: 'Derya Güneş', role: 'technician' },
    { name: 'Tolga Koç', role: 'assistant_technician' },
    { name: 'İrem Baş', role: 'technician' },
    { name: 'Can Tekin', role: 'technician' },
  ],
  nukleer: [
    { name: 'Serkan Eren', role: 'technician' },
    { name: 'Pınar Solmaz', role: 'senior_technician' },
    { name: 'Yusuf Karaca', role: 'technician' },
    { name: 'Deniz Uçar', role: 'assistant_technician' },
  ],
  onkoloji: [
    { name: 'Cem Aktaş', role: 'medical_engineer' },
    { name: 'Seda Yalçın', role: 'technician' },
    { name: 'Umut Özkan', role: 'senior_technician' },
    { name: 'Bahar Demirel', role: 'technician' },
  ],
  supervizor: [
    { name: 'Murat Tuncay', role: 'supervisor' },
    { name: 'Esra Taş', role: 'supervisor' },
  ],
};

async function main() {
  console.log('Seeding devices, shifts, and personnel...');

  for (const [unitType, unitInfo] of Object.entries(UNITS)) {
    const unit = await prisma.unit.findUnique({ where: { id: unitInfo.id } });
    if (!unit) {
      console.log(`  !! Unit ${unitInfo.id} not found, skipping`);
      continue;
    }

    const shiftTypes = SHIFT_TYPES[unitType];
    const deviceNames = DEVICE_NAMES[unitType];
    const personnelNames = PERSONNEL_NAMES[unitType];

    // Create devices
    let deviceCount = 0;
    for (let i = 0; i < deviceNames.length; i++) {
      const code = `${unitInfo.label}-${String(i + 1).padStart(2, '0')}`;
      const existing = await prisma.device.findFirst({
        where: { unitId: unit.id, code },
      });
      let device;
      if (existing) {
        device = existing;
        console.log(`  Device ${code} already exists, skipping`);
      } else {
        device = await prisma.device.create({
          data: {
            code,
            name: deviceNames[i],
            unitId: unit.id,
            organizationId: ORG_ID,
            mode: unitType === 'nukleer' ? 'polyclinic' : 'vardiya',
            requiredSkills: [unitType === 'onkoloji' ? 'linac' : 'imaging'],
            workDays: [1, 2, 3, 4, 5],
            startHour: 8,
            endHour: 20,
            isActive: true,
          },
        });
        deviceCount++;
        console.log(`  Created device ${code} (${deviceNames[i]})`);
      }

      // Create shift definitions for this device
      for (const shift of shiftTypes) {
        const exists = await prisma.shifts.findFirst({
          where: {
            organizationId: ORG_ID,
            deviceId: device.id,
            type: shift.type,
          },
        });
        if (!exists) {
          await prisma.shifts.create({
            data: {
              name: shift.name,
              type: shift.type,
              startTime: shift.start,
              endTime: shift.end,
              durationHours: shift.hours,
              organizationId: ORG_ID,
              unitId: unit.id,
              deviceId: device.id,
              personnelType: 'technician',
              isActive: true,
            },
          });
          console.log(`  Created shift ${shift.type} for ${code}`);
        }
      }
    }
    if (deviceCount > 0)
      console.log(`  +${deviceCount} devices created for ${unitType}`);

    // Create personnel
    for (const p of personnelNames) {
      const email = `${p.name.toLowerCase().replace(/\s+/g, '.').replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')}@vardiyaos.com`;
      const existing = await prisma.personnel.findFirst({ where: { email } });
      if (!existing) {
        await prisma.personnel.create({
          data: {
            name: p.name,
            role: p.role,
            email,
            unitId: unit.id,
            skills: [unitType === 'onkoloji' ? 'linac' : 'imaging'],
            deviceSkills: ['imaging'],
            nightShiftEligible: true,
            employmentStatus: 'active',
            maxWeeklyHours: 48,
            isActive: true,
          },
        });
        console.log(`  Created personnel ${p.name} (${p.role})`);
      }
    }
  }

  console.log('Seeding complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
