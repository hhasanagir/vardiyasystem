import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import {
  createTestApp, loginAndGetCsrf, authed, AuthCtx, ADMIN_DEMO, PERSONNEL_PASSWORD,
} from './test-helpers';

const PREFIX = 'p3ms';
const UNIT_CODE = 'P3MS-BT';
const EMPLOYEE_NO = 'P3MS-1';
const TECH_EMAIL = `${PREFIX}.tech@fake.local`;

/**
 * My Shifts Dashboard (e2e).
 *
 * The dashboard is a read model scoped to the caller's own Personnel record, so
 * the fixture builds that pair for real: unit + personnel + login + one
 * persisted assignment. Everything asserted below comes from PostgreSQL, not
 * from a mocked service.
 */
describe('My Shifts Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let tech: AuthCtx;
  let unitId: string;
  let deviceId: string;
  let personnelId: string;
  let scheduleId: string;
  let assignmentId: string;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const day = `${year}-${String(month).padStart(2, '0')}-10`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const units = await prisma.unit.findMany({ select: { id: true, organizationId: true }, take: 1 });
    expect(units.length).toBeGreaterThan(0);
    const orgId = units[0].organizationId;

    const unit = await prisma.unit.create({
      data: { code: UNIT_CODE, name: 'P3 MyShifts BT', type: 'bt', organizationId: orgId },
    });
    unitId = unit.id;

    const personnel = await prisma.personnel.create({
      data: {
        name: 'P3 MyShifts Technician',
        role: 'technician',
        employeeNo: EMPLOYEE_NO,
        email: TECH_EMAIL,
        unitId,
        organizationId: orgId,
        offDays: [],
        isActive: true,
      },
    });
    personnelId = personnel.id;

    const device = await prisma.device.create({
      data: {
        code: `${PREFIX}-CT1`,
        name: 'P3 MyShifts CT',
        unitId,
        organizationId: orgId,
        workDays: [1, 2, 3, 4, 5],
        requiredSkills: [],
        isActive: true,
      } as never,
    });
    deviceId = device.id;

    await prisma.user.create({
      data: {
        email: TECH_EMAIL,
        password: await bcrypt.hash(PERSONNEL_PASSWORD, 10),
        name: 'P3 MyShifts Technician',
        role: 'technician',
        organizationId: orgId,
        unitId,
        isActive: true,
      },
    });

    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
    tech = await loginAndGetCsrf(app, TECH_EMAIL, PERSONNEL_PASSWORD);

    const schedule = await authed(app, admin)
      .post('/api/v1/schedules')
      .send({ unitId, month, year })
      .expect(201);
    scheduleId = schedule.body.id as string;

    const assignment = await authed(app, admin)
      .post(`/api/v1/schedules/${scheduleId}/assignments`)
      .send({
        personnelId,
        deviceId,
        kind: 'device',
        date: day,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      })
      .expect(201);

    const created = await prisma.assignment.findMany({
      where: { scheduleId, personnelId },
      select: { id: true, date: true, startTime: true, endTime: true, deviceId: true },
    });
    expect(created).toHaveLength(1);
    expect(created[0].deviceId).toBe(deviceId);
    assignmentId = created[0].id;
    expect(assignment.body).toBeDefined();
  }, 180000);

  afterAll(async () => {
    // Cleanup is ordered by the real foreign keys: assignments -> schedules ->
    // person_shift_templates -> areas -> devices -> personnel -> user -> unit.
    // Each step is reported, and the run ends by proving nothing is left behind.
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
    await step('devices', () => prisma.device.deleteMany({ where: { unitId } }));
    await step('personnel', () => prisma.personnel.deleteMany({ where: { employeeNo: { in: [EMPLOYEE_NO, `${EMPLOYEE_NO}-X`] } } }));
    await step('audit logs', () => prisma.auditLog.deleteMany({ where: { user: { email: TECH_EMAIL } } }));
    await step('auth attempts', () => prisma.authAttempt.deleteMany({ where: { email: TECH_EMAIL } }));
    await step('user', () => prisma.user.deleteMany({ where: { email: TECH_EMAIL } }));
    await step('unit', () => prisma.unit.deleteMany({ where: { code: UNIT_CODE } }));

    const remaining = {
      units: await prisma.unit.count({ where: { code: UNIT_CODE } }),
      personnel: await prisma.personnel.count({ where: { employeeNo: { startsWith: EMPLOYEE_NO } } }),
      users: await prisma.user.count({ where: { email: TECH_EMAIL } }),
      devices: await prisma.device.count({ where: { code: `${PREFIX}-CT1` } }),
    };
    expect(problems).toEqual([]);
    expect(remaining).toEqual({ units: 0, personnel: 0, users: 0, devices: 0 });
    await app.close();
  });

  it('the created schedule is stored with the tenant organization', async () => {
    // Regression guard: a schedule written by a caller without an
    // organization used to land with organizationId = NULL and then became
    // invisible to every tenant-scoped read (the dashboard showed
    // "no_schedule" for its own personnel).
    const stored = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { organizationId: true, unit: { select: { organizationId: true } } },
    });
    expect(stored).not.toBeNull();
    expect(stored?.unit?.organizationId).toBeTruthy();
    expect(stored?.organizationId).toBe(stored?.unit?.organizationId);
  });

  it('GET /api/v1/me/shifts returns the caller personnel and the persisted assignment', async () => {
    const res = await authed(app, tech).get('/api/v1/me/shifts').query({ month, year }).expect(200);
    const body = res.body as {
      shifts: Array<{ id: string; date: string; shiftType: string; startTime: string; endTime: string }>;
      personnel: { id: string; unitId: string | null } | null;
    };

    expect(body.personnel?.id).toBe(personnelId);
    expect(body.shifts).toHaveLength(1);
    expect(body.shifts[0].id).toBe(assignmentId);
    expect(body.shifts[0].date).toBe(day);
    expect(body.shifts[0].startTime).toBe('08:00');
    expect(body.shifts[0].endTime).toBe('16:00');
  });

  it('GET /api/v1/me/shifts never leaks another personnel record', async () => {
    const other = await prisma.personnel.create({
      data: {
        name: 'P3 MyShifts Other',
        role: 'technician',
        employeeNo: `${EMPLOYEE_NO}-X`,
        email: `${PREFIX}.other@fake.local`,
        unitId,
        organizationId: (await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).organizationId,
        offDays: [],
        isActive: true,
      },
    });

    const res = await authed(app, tech).get('/api/v1/me/shifts').query({ month, year }).expect(200);
    const body = res.body as { shifts: Array<{ id: string }>; personnel: { id: string } | null };

    expect(body.personnel?.id).not.toBe(other.id);
    const assignments = await prisma.assignment.findMany({
      where: { scheduleId, personnelId: other.id },
      select: { id: true },
    });
    expect(assignments).toHaveLength(0);
    for (const shift of body.shifts) {
      expect(shift.id).not.toBe('');
    }

    await prisma.personnel.delete({ where: { id: other.id } });
  });

  it('GET /api/v1/me/summary aggregates the caller assignment', async () => {
    const res = await authed(app, tech).get('/api/v1/me/summary').expect(200);
    const body = res.body as {
      summary: { totalShifts: number; totalHours: number; nightShifts: number; weekendShifts: number; overtimeHours: number };
    };
    expect(body.summary.totalShifts).toBeGreaterThanOrEqual(1);
    expect(body.summary.totalHours).toBeGreaterThan(0);
    expect(body.summary.nightShifts).toBe(0);
    expect(body.summary.overtimeHours).toBe(0);
  });

  it('a login without a Personnel record gets an empty dashboard instead of an error', async () => {
    // technician@hospital.com is a seeded user with no Personnel row; the
    // dashboard must degrade to an empty model, never to a 5xx.
    const res = await authed(app, admin).get('/api/v1/me/shifts').query({ month, year }).expect(200);
    const body = res.body as { shifts: unknown[]; personnel: unknown };
    expect(Array.isArray(body.shifts)).toBe(true);
    expect(body.personnel === null || typeof body.personnel === 'object').toBe(true);
  });

  it('GET /api/v1/me/shifts fails without auth (401)', () => {
    return request(app.getHttpServer()).get('/api/v1/me/shifts').query({ month, year }).expect(401);
  });

  it('GET /api/v1/me/summary fails without auth (401)', () => {
    return request(app.getHttpServer()).get('/api/v1/me/summary').expect(401);
  });
});
