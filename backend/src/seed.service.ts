import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { RbacSeedService } from './modules/rbac/seeds/rbac-seed.service';

import { UserRole } from '@prisma/client';

interface SeedUser {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private rbacSeedService: RbacSeedService,
  ) {}

  async onModuleInit() {
    await this.rbacSeedService.seed();
    const seedPassword = this.configService.get<string>('SEED_ADMIN_PASSWORD');
    if (seedPassword) {
      await this.ensureUsers(seedPassword);
    }
    await this.ensurePersonnelGroups();
  }

  private async ensurePersonnelGroups() {
    const defaultGroups: Array<{
      code: string;
      name: string;
      description?: string;
    }> = [
      {
        code: 'technician',
        name: 'Tekniker',
        description: 'Cihaz dışı personel nöbeti - Tekniker',
      },
      {
        code: 'assistant_technician',
        name: 'Yardımcı Tekniker',
        description: 'Cihaz dışı personel nöbeti - Yardımcı Tekniker',
      },
      {
        code: 'health_physicist',
        name: 'Sağlık Fizikçisi',
        description: 'Cihaz dışı personel nöbeti - Sağlık Fizikçisi',
      },
      {
        code: 'pharmacist',
        name: 'Farmasist',
        description: 'Cihaz dışı personel nöbeti - Farmasist',
      },
      {
        code: 'supervisor',
        name: 'Süpervizör',
        description: 'Cihaz dışı personel nöbeti - Süpervizör',
      },
      {
        code: 'other',
        name: 'Diğer',
        description: 'Diğer personel nöbeti grupları',
      },
    ];

    const defaultTemplates: Array<{
      code: string;
      shiftType: 'day' | 'evening' | 'night' | 'morning';
      startTime: string;
      endTime: string;
    }> = [
      { code: 'day', shiftType: 'day', startTime: '08:00', endTime: '16:00' },
      {
        code: 'evening',
        shiftType: 'evening',
        startTime: '16:00',
        endTime: '00:00',
      },
      {
        code: 'night',
        shiftType: 'night',
        startTime: '00:00',
        endTime: '08:00',
      },
    ];

    const units = await this.prisma.unit.findMany({
      where: { isActive: true },
      select: { id: true, organizationId: true },
    });

    for (const unit of units) {
      const existingGroups = await this.prisma.personnelGroup.findMany({
        where: { unitId: unit.id },
        select: { code: true },
      });
      const existingCodes = new Set(existingGroups.map((g) => g.code));

      for (const g of defaultGroups) {
        if (existingCodes.has(g.code)) continue;
        let group = await this.prisma.personnelGroup.findFirst({
          where: { code: g.code, unitId: unit.id },
        });
        if (!group) {
          group = await this.prisma.personnelGroup.create({
            data: {
              code: g.code,
              name: g.name,
              description: g.description,
              unitId: unit.id,
              organizationId: unit.organizationId ?? null,
              isActive: true,
            },
          });
          this.logger.log(`Personnel group created: ${g.code} (${unit.id})`);
        }

        const existingTemplates =
          await this.prisma.personShiftTemplate.findMany({
            where: { personnelGroupId: group.id },
            select: { shiftType: true, startTime: true, endTime: true },
          });
        const templateKeys = new Set(
          existingTemplates.map(
            (t) => `${t.shiftType}|${t.startTime}|${t.endTime}`,
          ),
        );
        for (const t of defaultTemplates) {
          const key = `${t.shiftType}|${t.startTime}|${t.endTime}`;
          if (templateKeys.has(key)) continue;
          await this.prisma.personShiftTemplate.create({
            data: {
              organizationId: unit.organizationId ?? null,
              unitId: unit.id,
              personnelGroupId: group.id,
              name: `${g.name} - ${t.shiftType}`,
              shiftType: t.shiftType,
              startTime: t.startTime,
              endTime: t.endTime,
              isActive: true,
            },
          });
        }
      }
    }
  }

  private async ensureUsers(defaultPassword: string) {
    const users: SeedUser[] = [
      {
        email: 'admin@vardiyaos.com',
        name: 'Admin Kullanıcı',
        role: UserRole.system_admin,
        password: defaultPassword,
      },
      {
        email: 'yonetici@vardiyaos.com',
        name: 'Yönetici',
        role: UserRole.hospital_admin,
        password: defaultPassword,
      },
      {
        email: 'goruntueleme@vardiyaos.com',
        name: 'Görüntüleme Müdürü',
        role: UserRole.imaging_director,
        password: defaultPassword,
      },
      {
        email: 'supervisor@vardiyaos.com',
        name: 'Süpervizör',
        role: UserRole.supervisor,
        password: defaultPassword,
      },
      {
        email: 'muhendis@vardiyaos.com',
        name: 'Medikal Mühendis',
        role: UserRole.medical_engineer,
        password: defaultPassword,
      },
      {
        email: 'sorumlu@vardiyaos.com',
        name: 'Sorumlu Tekniker',
        role: UserRole.senior_technician,
        password: defaultPassword,
      },
      {
        email: 'teknisyen@vardiyaos.com',
        name: 'Tekniker',
        role: UserRole.technician,
        password: defaultPassword,
      },
      {
        email: 'yardimci@vardiyaos.com',
        name: 'Yardımcı Tekniker',
        role: UserRole.assistant_technician,
        password: defaultPassword,
      },
      {
        email: 'sekreter@vardiyaos.com',
        name: 'Sekreter',
        role: UserRole.secretary,
        password: defaultPassword,
      },
      {
        email: 'misafir@vardiyaos.com',
        name: 'Misafir',
        role: UserRole.guest,
        password: defaultPassword,
      },
    ];

    for (const user of users) {
      const existing = await this.prisma.user.findUnique({
        where: { email: user.email },
      });
      const hashedPassword = await bcrypt.hash(user.password, 10);
      if (existing) {
        await this.prisma.user.update({
          where: { email: user.email },
          data: { password: hashedPassword, role: user.role, name: user.name },
        });
        this.logger.log(`User updated: ${user.email} (${user.role})`);
        continue;
      }
      await this.prisma.user.create({
        data: {
          email: user.email,
          password: hashedPassword,
          name: user.name,
          role: user.role,
        },
      });
      this.logger.log(`User created: ${user.email} (${user.role})`);
    }
  }
}
