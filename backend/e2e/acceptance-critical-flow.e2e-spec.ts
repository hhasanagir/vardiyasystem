import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma.service';
import {
  createTestApp, loginAndGetCsrf, authed, rawRequest, AuthCtx,
  ADMIN_DEMO, SUPERVISOR_DEMO, PERSONNEL_PASSWORD,
} from './test-helpers';

const FIXTURE_PREFIX = 'p3accept';

interface AuditRow {
  action: string;
  userId: string | null;
}

interface PagedBody<T> {
  data?: T[];
}

/** Normalizes the plain-array and { data: [] } envelope shapes into one array. */
function toRows<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const paged = body as PagedBody<T> | null;
  return paged?.data ?? [];
}

describe('Acceptance: critical schedule workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let supervisor: AuthCtx; // aziz.demir@hospital.com (org-scoped supervisor, MR unit)
  let director: AuthCtx;   // imaging_director fixture with BT org+unit
  let fieldSup: AuthCtx;   // field_supervisor fixture confined to MR
  let nullDirector: AuthCtx; // imaging_director fixture with NO tenant context
  let org2Sup: AuthCtx;    // supervisor fixture in a SECOND organization

  let scheduleId: string;
  let assignmentId: string;
  let personnelId: string;
  let deviceId: string;
  let primaryOrgId: string;
  let acceptUnitId: string;
  let btUnitId: string;
  let mrUnitId: string;

  const year = new Date().getFullYear() + 20;
  const month = 6;

  /**
   * The acceptance unit owns exactly one Monday-only device with a single day
   * shift definition and one technician, so the authoritative CoverageEngine
   * requires one assignment per Monday of the month. That keeps the publish gate
   * provable end-to-end (full coverage -> publishable) without weakening it.
   */
  function requiredWorkDates(): string[] {
    const dates: string[] = [];
    for (let day = 1; day <= 30; day++) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCDay() === 1) dates.push(`${year}-06-${String(day).padStart(2, '0')}`);
    }
    return dates;
  }

  async function createFixtureUser(email: string, role: string, orgId: string | null, unitId: string | null) {
    const passwordHash = await bcrypt.hash(PERSONNEL_PASSWORD, 10);
    return prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: `P3 Accept ${role}`,
        role: role as never,
        organizationId: orgId,
        unitId,
        isActive: true,
      },
    });
  }

  /**
   * Real RBAC grant: PermissionGuard authorises @Permissions routes from
   * UserRoleAssignment -> Role -> RolePermission, so every fixture actor needs a
   * genuine role assignment at its tenant scope. No guard is weakened for tests.
   */
  async function assignRole(email: string, roleName: string, orgId: string | null, unitId: string | null) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName as never } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: role.id, organizationId: orgId, unitId },
    });
  }

  /**
   * Removes every artifact of a previous (possibly interrupted) run.
   * FK order matters: audit_logs -> assignments -> schedules -> users -> units -> orgs.
   * Runs in beforeAll AND afterAll so the spec is re-runnable.
   */
  /**
   * Removes every artifact of a previous (possibly interrupted) run.
   * FK order matters: audit_logs -> assignments -> schedules -> users ->
   * person_shift_templates/personnel_groups (auto-provisioned per unit on first
   * login) -> devices/shifts/personnel -> units -> orgs. Failures are NOT
   * swallowed: a silently skipped delete leaves residue that breaks the next run
   * with a unique-constraint error.
   */
  async function cleanupFixtures() {
    const fixtureUnitIds = await prisma.unit.findMany({
      where: { code: { in: ['P3ACCEPT-BT', 'P3ACCEPT'] } },
      select: { id: true },
    }).then((rows) => rows.map((r) => r.id));
    const knownUnitIds = [acceptUnitId, btUnitId, mrUnitId, ...fixtureUnitIds].filter((id): id is string => Boolean(id));
    const unitFilter = { unitId: { in: knownUnitIds } };

    await prisma.auditLog.deleteMany({ where: { user: { email: { startsWith: `${FIXTURE_PREFIX}.` } } } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'schedule', unitId: { in: knownUnitIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'assignment', unitId: { in: knownUnitIds } } });
    await prisma.assignment.deleteMany({ where: { schedule: { ...unitFilter, month, year: { gte: year } } } });
    await prisma.assignment.deleteMany({ where: { unitId: { in: knownUnitIds } } });
    await prisma.schedule.deleteMany({ where: { ...unitFilter, month, year: { gte: year } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${FIXTURE_PREFIX}.` } } });
    await prisma.personShiftTemplate.deleteMany({ where: unitFilter });
    await prisma.personnelGroup.deleteMany({ where: unitFilter });
    await prisma.device.deleteMany({ where: { code: 'P3ACCEPT-CT1' } });
    await prisma.shifts.deleteMany({ where: { name: 'P3 Accept Day' } });
    await prisma.personnel.deleteMany({ where: { employeeNo: 'P3ACCEPT-1' } });
    await prisma.unit.deleteMany({ where: { code: { in: ['P3ACCEPT-BT', 'P3ACCEPT'] } } });
    await prisma.organization.deleteMany({ where: { code: 'P3ACCEPT-FOREIGN' } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new Error('No seed organization found');
    primaryOrgId = org.id;

    const btUnit = await prisma.unit.findFirst({ where: { code: 'BT', organizationId: primaryOrgId } });
    const mrUnit = await prisma.unit.findFirst({ where: { code: 'MR', organizationId: primaryOrgId } });
    if (!btUnit || !mrUnit) throw new Error('BT/MR units missing in seed org');
    btUnitId = btUnit.id;
    mrUnitId = mrUnit.id;

    await cleanupFixtures();

    // Acceptance unit: one Monday-only device + one day shift + one technician,
    // so minimum coverage is exactly one assignment per Monday of the month.
    const acceptUnit = await prisma.unit.create({
      data: { name: 'P3 Accept Unit', code: 'P3ACCEPT-BT', type: 'bt', organizationId: primaryOrgId } as never,
    });
    acceptUnitId = acceptUnit.id;
    const acceptDevice = await prisma.device.create({
      data: {
        code: 'P3ACCEPT-CT1',
        name: 'P3 Accept CT',
        unitId: acceptUnitId,
        organizationId: primaryOrgId,
        workDays: [1],
        requiredSkills: [],
        isActive: true,
      } as never,
    });
    await prisma.shifts.create({
      data: {
        name: 'P3 Accept Day',
        type: 'day',
        organizationId: primaryOrgId,
        unitId: acceptUnitId,
        deviceId: acceptDevice.id,
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
        isActive: true,
      } as never,
    });
    await prisma.personnel.create({
      data: {
        name: 'P3 Accept Technician',
        role: 'technician',
        employeeNo: 'P3ACCEPT-1',
        unitId: acceptUnitId,
        organizationId: primaryOrgId,
        offDays: [],
        isActive: true,
      } as never,
    });

    // Tenant-context director (four-eyes approver) + strict field_supervisor + null-context director
    const directorEmail = `${FIXTURE_PREFIX}.director@fake.local`;
    const fieldSupEmail = `${FIXTURE_PREFIX}.fieldsup@fake.local`;
    const nullDirectorEmail = `${FIXTURE_PREFIX}.null@fake.local`;
    await createFixtureUser(directorEmail, 'imaging_director', primaryOrgId, acceptUnitId);
    await createFixtureUser(fieldSupEmail, 'field_supervisor', primaryOrgId, mrUnitId);
    await createFixtureUser(nullDirectorEmail, 'imaging_director', null, null);

    // The director also supervises the acceptance unit, which is what grants
    // schedule.submit; IMAGING_DIRECTOR covers approve/publish/archive.
    await assignRole(directorEmail, 'IMAGING_DIRECTOR', primaryOrgId, acceptUnitId);
    await assignRole(directorEmail, 'SUPERVISOR', primaryOrgId, acceptUnitId);
    await assignRole(fieldSupEmail, 'FIELD_SUPERVISOR', primaryOrgId, mrUnitId);
    await assignRole(nullDirectorEmail, 'IMAGING_DIRECTOR', null, null);

    // Second organization + unit for cross-tenant isolation
    const org2 = await prisma.organization.create({ data: { name: 'P3 Accept Foreign Org', code: 'P3ACCEPT-FOREIGN' } });
    const unit2 = await prisma.unit.create({
      data: { name: 'P3 Foreign Unit', code: 'P3ACCEPT', type: 'bt', organizationId: org2.id } as never,
    });
    const org2Email = `${FIXTURE_PREFIX}.org2@fake.local`;
    await createFixtureUser(org2Email, 'supervisor', org2.id, unit2.id);
    await assignRole(org2Email, 'SUPERVISOR', org2.id, unit2.id);

    // Authenticate every actor through the real login flow.
    supervisor = await loginAndGetCsrf(app, SUPERVISOR_DEMO.email, SUPERVISOR_DEMO.password);
    director = await loginAndGetCsrf(app, directorEmail, PERSONNEL_PASSWORD);
    fieldSup = await loginAndGetCsrf(app, fieldSupEmail, PERSONNEL_PASSWORD);
    nullDirector = await loginAndGetCsrf(app, nullDirectorEmail, PERSONNEL_PASSWORD);
    org2Sup = await loginAndGetCsrf(app, org2Email, PERSONNEL_PASSWORD);
  }, 120000);

  afterAll(async () => {
    // Teardown must not mask a test failure, but a failed cleanup is a real
    // defect (it breaks re-runs), so it is reported instead of being swallowed.
    try {
      await cleanupFixtures();
    } catch (error) {
      console.error('FIXTURE CLEANUP FAILED', error instanceof Error ? error.message : String(error));
      throw error;
    }
    await app.close();
  });

  it('1. create a DRAFT schedule in the Supervisor unit (201, draft)', async () => {
    const res = await authed(app, supervisor)
      .post('/api/v1/schedules-ddd')
      .send({ unitId: acceptUnitId, month, year });
    expect(res.status).toBe(201);
    const byId = await prisma.schedule.findUnique({ where: { id: res.body.id } });
    const byKey = await prisma.schedule.findFirst({ where: { unitId: acceptUnitId, month, year } });
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('draft');
    expect(res.body.unitId).toBe(acceptUnitId);
    expect(byId).not.toBeNull();
    expect(byKey).not.toBeNull();
    scheduleId = res.body.id;
  });

  it('2. read the schedule back (200, correct tenant content)', async () => {
    const probe = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    const listRes = await authed(app, supervisor).get(`/api/v1/schedules-ddd?unitId=${acceptUnitId}&year=${year}&month=${month}`);
    const listBody = toRows<{ id: string }>(listRes.body);
    const res = await authed(app, supervisor).get(`/api/v1/schedules-ddd/${scheduleId}`);
    expect(probe).not.toBeNull();
    expect(listRes.status).toBe(200);
    expect(listBody.map((s) => s.id)).toContain(scheduleId);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(scheduleId);
    expect(res.body.month).toBe(month);
    expect(res.body.year).toBe(year);
  });

  it('3. resolve a technician and a device in the schedule unit via the API', async () => {
    const personnel = await authed(app, supervisor).get(`/api/v1/personnel?unitId=${acceptUnitId}`).expect(200);
    const tech = (personnel.body as Array<{ id: string; role: string; employeeNo: string | null }>)
      .find((p) => p.employeeNo === 'P3ACCEPT-1');
    expect(tech).toBeTruthy();
    personnelId = tech!.id;

    const devices = await authed(app, supervisor).get(`/api/v1/units/${acceptUnitId}/devices`).expect(200);
    const device = (devices.body as Array<{ id: string; code: string }>).find((d) => d.code === 'P3ACCEPT-CT1');
    expect(device).toBeTruthy();
    deviceId = device!.id;
  });

  it('4. add a valid device-kind assignment (201) and the version advances', async () => {
    const res = await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
      .send({
        personnelId,
        deviceId,
        kind: 'device',
        date: requiredWorkDates()[0],
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      })
      .expect(201);

    const created = (res.body.assignments as Array<{ id: string }>).find((a) => a.id);
    expect(created).toBeTruthy();
    assignmentId = created!.id;
    expect(res.body.version).toBeGreaterThanOrEqual(2);
    const persisted = await prisma.schedule.findUnique({ where: { id: scheduleId }, select: { version: true } });
    expect(persisted?.version).toBe(res.body.version);
  });

  it('4b. remaining coverage slots are filled (201 each, full coverage)', async () => {
    for (const date of requiredWorkDates().slice(1)) {
      const res = await authed(app, supervisor)
        .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
        .send({
          personnelId,
          deviceId,
          kind: 'device',
          date,
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
        })
        .expect(201);
      expect(res.body.status).toBe('draft');
    }
    const assignments = await prisma.assignment.findMany({ where: { scheduleId } });
    expect(assignments.length).toBe(requiredWorkDates().length);
  });

  it('5. full-schedule validation runs without hard violations', async () => {
    const res = await authed(app, supervisor).post(`/api/v1/schedules-ddd/${scheduleId}/validate`).expect(201);
    const hard = res.body?.hardViolations?.total ?? 0;
    expect(hard).toBe(0);
  });

  it('6. duplicate assignment (same person, same day, same shift) is BLOCKED with 409', async () => {
    const res = await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
      .send({
        personnelId,
        deviceId,
        kind: 'device',
        date: requiredWorkDates()[0],
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      })
      .expect(409);
    expect(JSON.stringify(res.body).length).toBeGreaterThan(0);
    const assignments = await prisma.assignment.findMany({ where: { scheduleId } });
    expect(assignments.length).toBe(requiredWorkDates().length);
  });

  it('7. CSRF defense: a state-changing call WITHOUT the double-submit token is rejected 403', async () => {
    await rawRequest(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
      .send({
        personnelId,
        kind: 'person',
        date: `${year}-06-02`,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      })
      .expect(403);
  });

  it('8. submit for review by supervisor (201, under_review)', async () => {
    const res = await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/submit-for-review`)
      .send({ comment: 'P3 acceptance submission' })
      .expect(201);
    expect(res.body.status).toBe('under_review');
  });

  it('9a. four-eyes: the submitter cannot approve (403)', async () => {
    await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/approve`)
      .send({ comment: 'self-approval must fail' })
      .expect(403);
  });

  it('9b. approve by a tenant-context imaging_director (201, approved)', async () => {
    const res = await authed(app, director)
      .post(`/api/v1/schedules-ddd/${scheduleId}/approve`)
      .send({ comment: 'approved after review' })
      .expect(201);
    expect(res.body.status).toBe('approved');
    expect(res.body.approvalData?.approvedBy).toBe(director.user.id);
  });

  it('10. publish by director (201, published)', async () => {
    const res = await authed(app, director)
      .post(`/api/v1/schedules-ddd/${scheduleId}/publish`)
      .expect(201);
    expect(res.body.status).toBe('published');
    expect(res.body.publishedAt).toBeTruthy();
  });

  it('11. PUBLISHED LOCK: assignment mutations are rejected with 409', async () => {
    const conflict = await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
      .send({
        personnelId,
        kind: 'person',
        date: `${year}-06-03`,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      })
      .expect(409);

    await authed(app, supervisor)
      .delete(`/api/v1/schedules-ddd/${scheduleId}/assignments/${assignmentId}`)
      .expect(409);

    await authed(app, supervisor)
      .put(`/api/v1/schedules-ddd/${scheduleId}/assignments/${assignmentId}`)
      .send({ startTime: '09:00' })
      .expect(409);

    expect(conflict.body).toBeDefined();
  });

  it('12. archive by director (201, archived)', async () => {
    const res = await authed(app, director).post(`/api/v1/schedules-ddd/${scheduleId}/archive`).expect(201);
    expect(res.body.status).toBe('archived');
  });

  it('13A. ARCHIVED LOCK: mutations stay rejected with 409', async () => {
    await authed(app, supervisor)
      .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
      .send({ personnelId, kind: 'person', date: `${year}-06-05`, shiftType: 'day', startTime: '08:00', endTime: '16:00' })
      .expect(409);
  });

  it('13. audit trail contains the full mutation history with actor context', async () => {
    const admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
    const res = await authed(app, admin).get(`/api/v1/audit/entity/schedule/${scheduleId}`).expect(200);
    const events = toRows<AuditRow>(res.body);
    const actions = events.map((e) => e.action);
    for (const expected of ['SCHEDULE_CREATED', 'SCHEDULE_SUBMITTED', 'SCHEDULE_APPROVED', 'SCHEDULE_PUBLISHED']) {
      expect(actions).toContain(expected);
    }
    const createEvent = events.find((e) => e.action === 'SCHEDULE_CREATED');
    expect(createEvent?.userId).toBe(supervisor.user.id);

    // Assignment mutations are audited under their own entity type; the audit
    // interceptor records the route's :id, which is the schedule id here.
    const assignmentEvents = await authed(app, admin).get(`/api/v1/audit/entity/assignment/${scheduleId}`).expect(200);
    const assignmentRows = toRows<AuditRow>(assignmentEvents.body);
    const assignmentActions = assignmentRows.map((e) => e.action);
    expect(assignmentActions).toContain('ASSIGNMENT_CREATED');
    const assignmentEvent = assignmentRows.find((e) => e.action === 'ASSIGNMENT_CREATED');
    expect(assignmentEvent?.userId).toBe(supervisor.user.id);
  });

  it('14. true four-eyes: the director who submitted cannot approve their own schedule (403)', async () => {
    const s2 = await authed(app, director)
      .post('/api/v1/schedules-ddd')
      .send({ unitId: acceptUnitId, month, year: year + 1 })
      .expect(201);

    await authed(app, director)
      .post(`/api/v1/schedules-ddd/${s2.body.id}/submit-for-review`)
      .send({ comment: 'director submitted' })
      .expect(201);

    const selfApprove = await authed(app, director)
      .post(`/api/v1/schedules-ddd/${s2.body.id}/approve`)
      .send({ comment: 'self-approve' })
      .expect(403);
    expect(JSON.stringify(selfApprove.body)).toContain('Four-eyes');

  });

  describe('ISOLATION NEGATIVES', () => {
    it('same tenant, missing permission: a technician in the unit cannot publish (403)', async () => {
      // Same organization and unit, authenticated, but the TECHNICIAN role has no
      // schedule.publish grant. This is the direct proof that PermissionGuard
      // actually evaluates permissions instead of deferring them.
      const techEmail = `${FIXTURE_PREFIX}.tech@fake.local`;
      await createFixtureUser(techEmail, 'technician', primaryOrgId, acceptUnitId);
      await assignRole(techEmail, 'TECHNICIAN', primaryOrgId, acceptUnitId);
      const tech = await loginAndGetCsrf(app, techEmail, PERSONNEL_PASSWORD);

      await authed(app, tech).get(`/api/v1/schedules-ddd/${scheduleId}`).expect(200);
      const denied = await authed(app, tech).post(`/api/v1/schedules-ddd/${scheduleId}/publish`).expect(403);
      expect(JSON.stringify(denied.body)).toContain('Insufficient permissions');
    });

    it('cross-unit: field_supervisor of MR cannot read BT schedule (403)', () => {
      return authed(app, fieldSup).get(`/api/v1/schedules-ddd/${scheduleId}`).expect(403);
    });

    it('cross-unit: field_supervisor of MR cannot mutate BT schedule (403)', async () => {
      await authed(app, fieldSup)
        .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
        .send({ personnelId, kind: 'person', date: `${year}-06-04`, shiftType: 'day', startTime: '08:00', endTime: '16:00' })
        .expect(403);
    });

    it('cross-tenant: supervisor in another org cannot read or mutate (403)', async () => {
      await authed(app, org2Sup).get(`/api/v1/schedules-ddd/${scheduleId}`).expect(403);
      await authed(app, org2Sup)
        .post(`/api/v1/schedules-ddd/${scheduleId}/assignments`)
        .send({ personnelId, kind: 'person', date: `${year}-06-04`, shiftType: 'day', startTime: '08:00', endTime: '16:00' })
        .expect(403);
    });

    it('null tenant: imaging_director without org/unit cannot approve (fail closed) (403)', async () => {
      await authed(app, nullDirector).post(`/api/v1/schedules-ddd/${scheduleId}/approve`).send({}).expect(403);
    });

    it('unauthenticated access to a schedule is 401', async () => {
      await request(app.getHttpServer()).get(`/api/v1/schedules-ddd/${scheduleId}`).expect(401);
    });
  });
});