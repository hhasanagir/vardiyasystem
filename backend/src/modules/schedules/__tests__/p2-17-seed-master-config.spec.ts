import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  ONK_MASTER_DEVICES,
  applyOnkolojiMasterConfig,
} from '../../../../prisma/onkoloji-master-config';

interface DeviceUpsertArgs {
  where: { organizationId_code: { organizationId: string; code: string } };
  update: { workDays: number[]; isMaster: boolean; unitId: string; mode: string };
  create: {
    code: string;
    name: string;
    workDays: number[];
    isMaster: boolean;
    organizationId: string;
    unitId: string;
  };
}

interface ShiftCreateArgs {
  data: {
    organizationId: string;
    unitId: string;
    isMaster: boolean;
    isActive: boolean;
  };
}

const BACKEND_ROOT = process.cwd();
const seedSource = readFileSync(resolve(BACKEND_ROOT, 'prisma/seed.ts'), 'utf8');

describe('P2-17 — ONK seed/master drift', () => {
  it('keeps the canonical ONK device set as the single source of truth', () => {
    expect(ONK_MASTER_DEVICES.map(d => d.code)).toEqual(['RONK-1', 'RONK-2', 'RONK-3', 'RONK-4']);
    expect(ONK_MASTER_DEVICES.map(d => d.deviceName)).toEqual([
      'Linak-1', 'Linak-2', 'Tomoterapi', 'BT Simülatör',
    ]);
    expect(ONK_MASTER_DEVICES.map(d => d.shifts.length)).toEqual([4, 3, 1, 2]);
  });

  it('applies canonical device names, Mon-Fri workDays and master shift templates', async () => {
    const deviceUpserts: DeviceUpsertArgs[] = [];
    const shiftCreates: ShiftCreateArgs[] = [];
    const prisma = {
      device: {
        upsert: vi.fn((args: DeviceUpsertArgs) => {
          deviceUpserts.push(args);
          return Promise.resolve({ id: `device-${args.where.organizationId_code.code}` });
        }),
      },
      shifts: {
        findMany: vi.fn(() => Promise.resolve([])),
        create: vi.fn((args: ShiftCreateArgs) => {
          shiftCreates.push(args);
          return Promise.resolve({ id: `shift-${shiftCreates.length}` });
        }),
        update: vi.fn(() => Promise.resolve({ id: 'shift' })),
      },
    };

    const stats = await applyOnkolojiMasterConfig(prisma as unknown as PrismaClient, 'org-1', 'unit-onk');

    expect(stats).toEqual({ created: 10, updated: 0, deactivated: 0 });
    expect(deviceUpserts).toHaveLength(4);
    for (const args of deviceUpserts) {
      expect(args.create.workDays).toEqual([1, 2, 3, 4, 5]);
      expect(args.update.workDays).toEqual([1, 2, 3, 4, 5]);
      expect(args.create.isMaster).toBe(true);
      expect(args.create.organizationId).toBe('org-1');
      expect(args.create.unitId).toBe('unit-onk');
    }
    expect(deviceUpserts.find(a => a.where.organizationId_code.code === 'RONK-3')?.create.name)
      .toBe('Tomoterapi');
    expect(shiftCreates).toHaveLength(10);
    for (const { data } of shiftCreates) {
      expect(data).toMatchObject({
        organizationId: 'org-1',
        unitId: 'unit-onk',
        isMaster: true,
        isActive: true,
      });
    }
  });

  it('removes the inline ONK drift from the seed and calls the master config', () => {
    expect(seedSource).toContain(
      "import { applyOnkolojiMasterConfig } from './onkoloji-master-config';",
    );
    expect(seedSource).toContain(
      'applyOnkolojiMasterConfig(prisma, org.id, onkolojiUnit.id)',
    );
    expect(seedSource).not.toContain("name: 'Lineer Hızlandırıcı-1'");
    expect(seedSource).not.toContain("name: 'Simülasyon CT'");
    expect(seedSource).not.toContain('const onkolojiDevices');
    expect(seedSource).not.toContain('dayNightShift');
    expect(seedSource).not.toContain("name: 'Yardımcı Tekniker'");
  });
});
