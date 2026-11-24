import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma.service';
import {
  createTestApp, loginAndGetCsrf, authed, AuthCtx,
  ADMIN_DEMO, PERSONNEL_PASSWORD,
} from './test-helpers';

const PREFIX = 'p3wf';
const UNIT_CODE = 'P3WF-BT';
const DEVICE_CODE = 'P3WF-CT1';
const SHIFT_NAME = 'P3 WF Day';
const EMPLOYEE_NO = 'P3WF-1';

type Status = 'draft' | 'under_review' | 'approved' | 'published' | 'archived';

describe('Schedule Workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let supervisor: AuthCtx;
  let director: AuthCtx;
  let scheduleId: string;
  let revisionVersion = 0;
  let unitId: string;
  let orgId: string;

  // June of a far-future year: Monday-only coverage stays provable while the
  // fixture can never collide with operational data.
  const year = new Date().getFullYear() + 20;
  const month = 6;

  function mondays(targetMonth = month): string[] {
    const dates: string[] = [];
    for (let day = 1; day <= 30; day++) {
      const date = new Date(Date.UTC(year, targetMonth - 1, day));
      if (date.getUTCDay() === 1) {
        dates.push(`${year}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }
    return dates;
  }

  async function createUser(email: string, role: string, unit: string | null): Promise<void> {
    const passwordHash = await bcrypt.hash(PERSONNEL_PASSWORD, 10);
    await prisma.user.create({
      data: { email, password: passwordHash, name: `P3 WF ${role}`, role: role as never, organizationId: orgId, unitId: unit, isActive: true },
    });
  }

  async function assignRole(email: string, roleName: string, unit: string | null): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName as never } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, organizationId: orgId, unitId: unit } });
  }

  /** Persisted truth for a schedule: the response envelope differs per route. */
  async function persisted(schedule: string): Promise<{ status: Status; version: number }> {
    const row = await prisma.schedule.findUniqueOrThrow({ where: { id: schedule }, select: { status: true, version: true } });
    return { status: row.status as Status, version: row.version };
  }

  /**
   * Purges every artifact of a previous (possibly interrupted) run, in FK order.
   * Failures are never swallowed: a skipped delete breaks the next run with a
   * unique-constraint error.
   */
  async function cleanupFixtures(): Promise<void> {
    const fixtureUnits = await prisma.unit.findMany({ where: { code: UNIT_CODE }, select: { id: true } });
    const unitIds = [unitId, ...fixtureUnits.map((u) => u.id)].filter((id): id is string => Boolean(id));
    const unitFilter = { unitId: { in: unitIds } };

    await prisma.auditLog.deleteMany({ where: { user: { email: { startsWith: `${PREFIX}.` } } } });
    await prisma.auditLog.deleteMany({ where: { entityType: { in: ['schedule', 'assignment'] }, unitId: { in: unitIds } } });
    await prisma.assignment.deleteMany({ where: { unitId: { in: unitIds } } });
    // The unit is fixture-owned, so every month/year of it must go: the
    // four-eyes proof schedules a second month and a stale row would keep the
    // unit delete from succeeding (schedules_unitId_fkey).
    await prisma.schedule.deleteMany({ where: unitFilter });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}.` } } });
    await prisma.personShiftTemplate.deleteMany({ where: unitFilter });
    await prisma.personnelGroup.deleteMany({ where: unitFilter });
    await prisma.device.deleteMany({ where: { code: DEVICE_CODE } });
    await prisma.shifts.deleteMany({ where: { name: SHIFT_NAME } });
    await prisma.personnel.deleteMany({ where: { employeeNo: EMPLOYEE_NO } });
    await prisma.unit.deleteMany({ where: { code: UNIT_CODE } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new Error('No seed organization found');
    orgId = org.id;

    await cleanupFixtures();

    const unit = await prisma.unit.create({
      data: { name: 'P3 WF Unit', code: UNIT_CODE, type: 'bt', organizationId: orgId } as never,
    });
    unitId = unit.id;
    const device = await prisma.device.create({
      data: {
        code: DEVICE_CODE,
        name: 'P3 WF CT',
        unitId,
        organizationId: orgId,
        workDays: [1],
        requiredSkills: [],
        isActive: true,
      } as never,
    });
    await prisma.shifts.create({
      data: {
        name: SHIFT_NAME,
        type: 'day',
        organizationId: orgId,
        unitId,
        deviceId: device.id,
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
        isActive: true,
      } as never,
    });
    await prisma.personnel.create({
      data: { name: 'P3 WF Technician', role: 'technician', employeeNo: EMPLOYEE_NO, unitId, organizationId: orgId, offDays: [], isActive: true } as never,
    });

    const supEmail = `${PREFIX}.supervisor@fake.local`;
    const dirEmail = `${PREFIX}.director@fake.local`;
    await createUser(supEmail, 'supervisor', unitId);
    await createUser(dirEmail, 'imaging_director', unitId);
    await assignRole(supEmail, 'SUPERVISOR', unitId);
    await assignRole(dirEmail, 'IMAGING_DIRECTOR', unitId);
    // The director also needs schedule.create/submit, which is a separate grant.
    await assignRole(dirEmail, 'SUPERVISOR', unitId);

    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
    supervisor = await loginAndGetCsrf(app, supEmail, PERSONNEL_PASSWORD);
    director = await loginAndGetCsrf(app, dirEmail, PERSONNEL_PASSWORD);
  }, 180000);

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } catch (error) {
      console.error('FIXTURE CLEANUP FAILED', error instanceof Error ? error.message : String(error));
      throw error;
    }
    await app.close();
  });

  it('1: a supervisor should create a draft schedule in their own unit', async () => {
    const res = await authed(app, supervisor)
      .post('/api/v1/schedules')
      .send({ unitId, month, year })
      .expect(201);

    scheduleId = res.body.id as string;
    expect(scheduleId).toBeTruthy();
    expect(await persisted(scheduleId)).toMatchObject({ status: 'draft' });
  });

  it('2: should submit the draft for review', async () => {
    await authed(app, supervisor)
      .post(`/api/v1/schedules/${scheduleId}/submit`)
      .send({ comment: 'Nöbet programı incelemeye gönderildi' })
      .expect(201);

    expect(await persisted(scheduleId)).toMatchObject({ status: 'under_review' });
  });

  it('3: a supervisor without approval rights is rejected (403)', async () => {
    await authed(app, supervisor)
      .post(`/api/v1/schedules/${scheduleId}/approve`)
      .send({ comment: 'yetkisiz onay' })
      .expect(403);

    expect(await persisted(scheduleId)).toMatchObject({ status: 'under_review' });
  });

  it('4: a different, authorised director must approve', async () => {
    await authed(app, director)
      .post(`/api/v1/schedules/${scheduleId}/approve`)
      .send({ comment: 'Onaylandı' })
      .expect(201);

    expect(await persisted(scheduleId)).toMatchObject({ status: 'approved' });
  });

  it('5: the coverage gate must block publishing an empty schedule (400)', async () => {
    const res = await authed(app, director)
      .post(`/api/v1/schedules/${scheduleId}/publish`)
      .expect(400);

    expect(String(res.body.message)).toMatch(/kapsama|kadro/i);
    expect(await persisted(scheduleId)).toMatchObject({ status: 'approved' });
  });

  it('6: filling every Monday closes the coverage gap (201 per assignment)', async () => {
    const personnel = await authed(app, supervisor).get(`/api/v1/personnel?unitId=${unitId}`).expect(200);
    const tech = (personnel.body as Array<{ id: string; employeeNo: string | null }>).find((p) => p.employeeNo === EMPLOYEE_NO);
    expect(tech).toBeTruthy();

    const devices = await authed(app, supervisor).get(`/api/v1/units/${unitId}/devices`).expect(200);
    const device = (devices.body as Array<{ id: string; code: string }>).find((d) => d.code === DEVICE_CODE);
    expect(device).toBeTruthy();

    for (const date of mondays()) {
      await authed(app, supervisor)
        .post(`/api/v1/schedules/${scheduleId}/assignments`)
        .send({
          personnelId: tech!.id,
          deviceId: device!.id,
          kind: 'device',
          date,
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
        })
        .expect(201);
    }

    const assignments = await prisma.assignment.findMany({ where: { scheduleId } });
    expect(assignments.length).toBe(mondays().length);
    expect(await persisted(scheduleId)).toMatchObject({ status: 'approved' });
  });

  it('7: should publish the fully covered schedule', async () => {
    await authed(app, director)
      .post(`/api/v1/schedules/${scheduleId}/publish`)
      .expect(201);

    expect(await persisted(scheduleId)).toMatchObject({ status: 'published' });
  });

  it('8: should create a revision from the published schedule', async () => {
    await authed(app, director)
      .post(`/api/v1/schedules/${scheduleId}/revision`)
      .expect(201);

    const state = await persisted(scheduleId);
    expect(state.status).toBe('draft');
    expect(state.version).toBeGreaterThan(1);
    // createRevision snapshots the assignment set AT this version.
    revisionVersion = state.version;
  });

  it('9: a draft revision can lose an assignment', async () => {
    const assignments = await prisma.assignment.findMany({ where: { scheduleId }, select: { id: true } });
    expect(assignments.length).toBe(mondays().length);

    await authed(app, supervisor)
      .delete(`/api/v1/schedules/${scheduleId}/assignments/${assignments[0].id}`)
      .expect(200);

    const after = await prisma.assignment.count({ where: { scheduleId } });
    expect(after).toBe(mondays().length - 1);
  });

  it('10: the revision snapshot lets a hospital_admin roll the assignment set back', async () => {
    // createRevision stored a snapshot at the revision version; rolling back to
    // that version must restore exactly the snapshot's assignment set.
    expect(revisionVersion).toBeGreaterThan(0);

    await authed(app, admin)
      .post(`/api/v1/schedules/${scheduleId}/rollback/${revisionVersion}`)
      .send({ reason: 'Atama kaybı geri alındı' })
      .expect(201);

    const assignments = await prisma.assignment.findMany({ where: { scheduleId }, select: { id: true } });
    expect(assignments.length).toBe(mondays().length);
    const after = await persisted(scheduleId);
    expect(after.version).toBeGreaterThan(revisionVersion);
  });

  it('11: four-eyes — a director who submitted cannot approve their own schedule (403)', async () => {
    // A second month isolates the four-eyes proof from the lifecycle above.
    const created = await authed(app, director)
      .post('/api/v1/schedules')
      .send({ unitId, month: 7, year })
      .expect(201);
    const own = created.body.id as string;

    await authed(app, director)
      .post(`/api/v1/schedules/${own}/submit`)
      .send({ comment: 'kendi gönderim' })
      .expect(201);

    const res = await authed(app, director)
      .post(`/api/v1/schedules/${own}/approve`)
      .send({ comment: 'kendi onayım' })
      .expect(403);

    expect(String(res.body.message)).toMatch(/four-eyes/i);
    expect(await persisted(own)).toMatchObject({ status: 'under_review' });
  });
});
