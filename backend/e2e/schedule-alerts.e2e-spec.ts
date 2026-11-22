import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { createTestApp, loginAndGetCsrf, authed, AuthCtx, ADMIN_DEMO } from './test-helpers';

const PREFIX = 'p3al';
const UNIT_CODE = 'P3AL-BT';
const DEVICE_CODE = 'P3AL-CT1';

interface AlertRow {
  type: string;
  severity: string;
  message: string;
  unit: string;
  date?: string;
  deviceId?: string;
}

const KNOWN_TYPES = new Set([
  'missing_staff', 'understaffed', 'double_booking', 'overtime', 'consecutive_night',
  'unassigned_critical', 'workload_imbalance', 'shift_threshold',
]);
const KNOWN_SEVERITIES = new Set(['info', 'warning', 'critical']);

/**
 * Schedule Alerts (e2e): the alert read model must be derived from the persisted
 * schedule, its unit's devices and its assignments - not from a published
 * fixture that happens to exist in the database.
 */
describe('Schedule Alerts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let unitId: string;
  let deviceId: string;
  let scheduleId: string;
  let assignmentId: string;

  const year = new Date().getFullYear() + 11;
  const month = ((new Date().getMonth() + 1) % 12) || 12;
  const coveredDay = 12;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);

    const units = await prisma.unit.findMany({ select: { id: true, organizationId: true }, take: 1 });
    const orgId = units[0].organizationId;

    const unit = await prisma.unit.create({
      data: { code: UNIT_CODE, name: 'P3 Alerts BT', type: 'bt', organizationId: orgId },
    });
    unitId = unit.id;

    const device = await prisma.device.create({
      data: {
        code: DEVICE_CODE,
        name: 'P3 Alerts CT',
        unitId,
        organizationId: orgId,
        workDays: [0, 1, 2, 3, 4, 5, 6],
        requiredSkills: [],
        isActive: true,
      } as never,
    });
    deviceId = device.id;

    // P3-11 — CoverageEngine enumerates REAL slots from the persisted shift
    // definitions. Without shift rows there are no slots and therefore no
    // missing_staff alarms, regardless of the device's workDays. The fixture
    // must declare the three shifts it expects to be enforced.
    await prisma.shifts.createMany({
      data: (['day', 'evening', 'night'] as const).map(type => ({
        name: `P3 Alerts ${type}`,
        type,
        organizationId: orgId,
        unitId,
        deviceId,
        personnelType: 'technician',
        isActive: true,
      })),
    });

    const personnel = await prisma.personnel.create({
      data: {
        name: 'P3 Alerts Technician',
        role: 'technician',
        employeeNo: `${PREFIX}-1`,
        email: `${PREFIX}.tech@fake.local`,
        unitId,
        organizationId: orgId,
        offDays: [],
        isActive: true,
      },
    });

    const schedule = await authed(app, admin)
      .post('/api/v1/schedules')
      .send({ unitId, month, year })
      .expect(201);
    scheduleId = schedule.body.id as string;

    const created = await prisma.assignment.findMany({
      where: { scheduleId, personnelId: personnel.id },
      select: { id: true },
    });
    expect(created).toHaveLength(0);

    const assignRes = await authed(app, admin)
      .post(`/api/v1/schedules/${scheduleId}/assignments`)
      .send({
        personnelId: personnel.id,
        deviceId,
        kind: 'device',
        date: `${year}-${String(month).padStart(2, '0')}-${coveredDay}`,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      });
    expect(assignRes.status).toBe(201);

    const rows = await prisma.assignment.findMany({
      where: { scheduleId },
      select: { id: true, date: true, shiftType: true },
    });
    expect(rows).toHaveLength(1);
    assignmentId = rows[0].id;
  }, 180000);

  afterAll(async () => {
    const problems: string[] = [];
    const step = async (label: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await step('assignments', () => prisma.assignment.deleteMany({ where: { scheduleId } }));
    await step('schedules', () => prisma.schedule.deleteMany({ where: { id: scheduleId } }));
    await step('shift templates', () => prisma.personShiftTemplate.deleteMany({ where: { unitId } }));
    await step('areas', () => prisma.area.deleteMany({ where: { unitId } }));
    await step('device incidents', () => prisma.deviceIncident.deleteMany({ where: { unitId } }));
    await step('handover notes', () => prisma.handoverNote.deleteMany({ where: { unitId } }));
    await step('shifts', () => prisma.shifts.deleteMany({ where: { unitId } }));
    await step('devices', () => prisma.device.deleteMany({ where: { unitId } }));
    await step('personnel', () => prisma.personnel.deleteMany({ where: { email: `${PREFIX}.tech@fake.local` } }));
    await step('unit', () => prisma.unit.deleteMany({ where: { code: UNIT_CODE } }));

    const remaining = {
      units: await prisma.unit.count({ where: { code: UNIT_CODE } }),
      devices: await prisma.device.count({ where: { code: DEVICE_CODE } }),
      personnel: await prisma.personnel.count({ where: { email: `${PREFIX}.tech@fake.local` } }),
    };
    expect(problems).toEqual([]);
    expect(remaining).toEqual({ units: 0, devices: 0, personnel: 0 });
    await app.close();
  });

  it('GET /api/v1/schedules/:id/alerts derives every alert from the persisted data', async () => {
    const res = await authed(app, admin).get(`/api/v1/schedules/${scheduleId}/alerts`).expect(200);
    const alerts = res.body as AlertRow[];

    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(KNOWN_TYPES.has(alert.type)).toBe(true);
      expect(KNOWN_SEVERITIES.has(alert.severity)).toBe(true);
      expect(typeof alert.message).toBe('string');
      expect(alert.message.length).toBeGreaterThan(0);
      expect(alert.unit).toBe('bt');
    }
  });

  it('the covered day shift removes exactly its own gap', async () => {
    const res = await authed(app, admin).get(`/api/v1/schedules/${scheduleId}/alerts`).expect(200);
    const alerts = res.body as AlertRow[];
    const coveredDate = `${year}-${String(month).padStart(2, '0')}-${coveredDay}`;

    // CoverageEngine enumerates one slot per persisted shift per work day;
    // the fixture covers only the day shift, so exactly the two remaining
    // shift types stay open on that date.
    const onCoveredDate = alerts.filter((a) => a.type === 'missing_staff' && a.deviceId === deviceId && a.date === coveredDate);
    expect(onCoveredDate).toHaveLength(2);
    expect(alerts.some((a) => a.type === 'missing_staff')).toBe(true);

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { date: true, shiftType: true },
    });
    expect(assignment?.date).toBe(coveredDate);
    expect(assignment?.shiftType).toBe('day');
  });

  it('the missing_staff count equals the uncovered device slots', async () => {
    const res = await authed(app, admin).get(`/api/v1/schedules/${scheduleId}/alerts`).expect(200);
    const alerts = res.body as AlertRow[];

    const devices = await prisma.device.count({ where: { unitId, isActive: true } });
    const daysInMonth = new Date(year, month, 0).getDate();
    const assignments = await prisma.assignment.count({ where: { scheduleId } });
    const expectedMissing = devices * daysInMonth * 3 - assignments;

    expect(alerts.filter((a) => a.type === 'missing_staff')).toHaveLength(expectedMissing);
    expect(assignmentId).toBeTruthy();
  });

  it('GET /api/v1/schedules/:id/alerts returns an empty list for an unknown id', async () => {
    const res = await authed(app, admin)
      .get('/api/v1/schedules/00000000-0000-0000-0000-000000000000/alerts')
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/v1/schedules/:id/alerts fails without auth (401)', () => {
    return request(app.getHttpServer()).get(`/api/v1/schedules/${scheduleId}/alerts`).expect(401);
  });
});
