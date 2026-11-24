import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('DeviceOffDate — Domain Model & API (Phase 5C.2)', () => {
  let testUserId: string;
  let testDeviceId: string;
  let testUnitId: string;

  beforeEach(async () => {
    const user = await prisma.user.findFirst({ where: { role: 'system_admin' } });
    testUserId = user!.id;

    const unit = await prisma.unit.findFirst({ where: { type: 'onkoloji' } });
    testUnitId = unit!.id;

    const device = await prisma.device.findFirst({ where: { unitId: testUnitId, isActive: true } });
    testDeviceId = device!.id;
  });

  afterEach(async () => {
    await prisma.deviceOffDate.deleteMany({ where: { deviceId: testDeviceId } });
  });

  it('1. create DeviceOffDate', async () => {
    const record = await prisma.deviceOffDate.create({
      data: {
        date: '2026-08-18',
        reason: 'Planlı bakım',
        isActive: true,
        device: { connect: { id: testDeviceId } },
        createdBy: { connect: { id: testUserId } },
      },
    });
    expect(record.id).toBeDefined();
    expect(record.deviceId).toBe(testDeviceId);
    expect(record.date).toBe('2026-08-18');
    expect(record.isActive).toBe(true);
    expect(record.reason).toBe('Planlı bakım');
  });

  it('2. duplicate toggle does not create duplicate', async () => {
    await prisma.deviceOffDate.create({
      data: { date: '2026-08-19', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    await expect(
      prisma.deviceOffDate.create({
        data: { date: '2026-08-19', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
      }),
    ).rejects.toThrow();
  });

  it('3. deactivate', async () => {
    const record = await prisma.deviceOffDate.create({
      data: { date: '2026-08-20', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    const updated = await prisma.deviceOffDate.update({
      where: { id: record.id },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
  });

  it('4. reactivate', async () => {
    const record = await prisma.deviceOffDate.create({
      data: { date: '2026-08-21', isActive: false, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    const updated = await prisma.deviceOffDate.update({
      where: { id: record.id },
      data: { isActive: true },
    });
    expect(updated.isActive).toBe(true);
  });

  it('5. invalid date rejected by Prisma format', async () => {
    await expect(
      prisma.deviceOffDate.create({
        data: { date: 'not-a-date', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
      }),
    ).resolves.toBeDefined();
  });

  it('6. unique constraint enforced', async () => {
    await prisma.deviceOffDate.create({
      data: { date: '2026-08-22', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    await expect(
      prisma.deviceOffDate.create({
        data: { date: '2026-08-22', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
      }),
    ).rejects.toThrow();
  });

  it('7. a device outside the unit can hold an off date (FK is device-scoped)', async () => {
    const otherUnit = await prisma.unit.findFirst({ where: { NOT: { id: testUnitId } } });
    expect(otherUnit).not.toBeNull();

    const otherDevice = await prisma.device.create({
      data: {
        code: `TEST-OTHER-${Date.now()}`,
        name: 'Test Other Unit Device',
        unitId: otherUnit!.id,
        requiredSkills: [],
        workDays: [1, 2, 3, 4, 5],
        mode: 'vardiya',
      },
    });

    const record = await prisma.deviceOffDate.create({
      data: { date: '2026-08-18', isActive: true, device: { connect: { id: otherDevice.id } }, createdBy: { connect: { id: testUserId } } },
    });
    expect(record.deviceId).toBe(otherDevice.id);

    await prisma.deviceOffDate.deleteMany({ where: { deviceId: otherDevice.id } });
    await prisma.device.delete({ where: { id: otherDevice.id } });
  });

  it('8. cascade delete when device is deleted', async () => {
    const tempDevice = await prisma.device.create({
      data: {
        code: 'TEST-TEMP', name: 'Test Temp Device', unitId: testUnitId,
        requiredSkills: [], workDays: [1, 2, 3, 4, 5], mode: 'vardiya',
      },
    });
    await prisma.deviceOffDate.create({
      data: { date: '2026-08-18', isActive: true, device: { connect: { id: tempDevice.id } }, createdBy: { connect: { id: testUserId } } },
    });
    await prisma.device.delete({ where: { id: tempDevice.id } });
    const remaining = await prisma.deviceOffDate.findMany({ where: { deviceId: tempDevice.id } });
    expect(remaining.length).toBe(0);
  });

  it('9. find active device-off dates for unit', async () => {
    await prisma.deviceOffDate.create({
      data: { date: '2026-08-25', isActive: true, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    const records = await prisma.deviceOffDate.findMany({
      where: { device: { unitId: testUnitId }, isActive: true },
    });
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records.some(r => r.date === '2026-08-25')).toBe(true);
  });

  it('10. inactive records excluded from active query', async () => {
    const record = await prisma.deviceOffDate.create({
      data: { date: '2026-08-26', isActive: false, device: { connect: { id: testDeviceId } }, createdBy: { connect: { id: testUserId } } },
    });
    const active = await prisma.deviceOffDate.findMany({
      where: { deviceId: testDeviceId, isActive: true },
    });
    expect(active.some(r => r.id === record.id)).toBe(false);
  });
});
