import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import {
  createTestApp, loginAndGetCsrf, authed, rawRequest, AuthCtx,
  ADMIN_DEMO, SUPERVISOR_DEMO,
} from './test-helpers';

const TECHNICIAN_DEMO = { email: 'technician@hospital.com', password: 'technician123' };

/**
 * Authorization (e2e): who may mutate a schedule, and which defenses apply when
 * they may not. Every case asserts a concrete status — no test is allowed to
 * pass by skipping its body.
 */
describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let supervisor: AuthCtx;
  let technician: AuthCtx;
  let unitId: string;
  let draftId: string;

  // A far-future month keeps the fixture out of operational data.
  const year = new Date().getFullYear() + 10;
  const month = ((new Date().getMonth() + 1) % 12) || 12;

  async function purge(): Promise<void> {
    const stale = await prisma.schedule.findMany({
      where: { unitId, year, month: { in: [month] } },
      select: { id: true },
    });
    const ids = stale.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.assignment.deleteMany({ where: { scheduleId: { in: ids } } });
      await prisma.schedule.deleteMany({ where: { id: { in: ids } } });
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
    supervisor = await loginAndGetCsrf(app, SUPERVISOR_DEMO.email, SUPERVISOR_DEMO.password);
    technician = await loginAndGetCsrf(app, TECHNICIAN_DEMO.email, TECHNICIAN_DEMO.password);

    const units = await authed(app, admin).get('/api/v1/units').expect(200);
    const rows = (units.body as Array<{ id: string }>) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    unitId = supervisor.user.unitId ?? rows[0].id;

    await purge();
  }, 120000);

  afterAll(async () => {
    try {
      await purge();
    } catch (error) {
      console.error('AUTHORIZATION FIXTURE CLEANUP FAILED', error instanceof Error ? error.message : String(error));
      throw error;
    }
    await app.close();
  });

  it('a hospital_admin may create and delete a draft schedule', async () => {
    const created = await authed(app, admin)
      .post('/api/v1/schedules')
      .send({ unitId, month, year })
      .expect(201);
    draftId = created.body.id as string;
    expect(draftId).toBeTruthy();

    await authed(app, admin).delete(`/api/v1/schedules/${draftId}`).expect(200);

    // The row must be gone, not merely hidden from the API.
    const row = await prisma.schedule.findUnique({ where: { id: draftId }, select: { id: true } });
    expect(row).toBeNull();
  });

  it('a technician may NOT create a schedule (403)', async () => {
    await authed(app, technician)
      .post('/api/v1/schedules')
      .send({ unitId, month, year: year + 1 })
      .expect(403);
  });

  it('a technician may NOT submit an existing schedule (403)', async () => {
    const created = await authed(app, supervisor)
      .post('/api/v1/schedules')
      .send({ unitId, month, year: year + 1 })
      .expect(201);
    const target = created.body.id as string;

    await authed(app, technician)
      .post(`/api/v1/schedules/${target}/submit`)
      .send({ comment: 'yetkisiz' })
      .expect(403);

    // The rejected request must not have changed the schedule.
    const row = await prisma.schedule.findUnique({ where: { id: target }, select: { status: true } });
    expect(row?.status).toBe('draft');
    await authed(app, admin).delete(`/api/v1/schedules/${target}`).expect(200);
  });

  it('an unauthenticated read is rejected (401)', () => {
    return request(app.getHttpServer()).get('/api/v1/schedules').expect(401);
  });

  it('an unauthenticated delete is rejected by the CSRF guard before the JWT gate (403)', () => {
    // Order matters and is asserted explicitly: the double-submit guard runs
    // first, so a request with neither cookie nor token is a 403, not a 401.
    return request(app.getHttpServer()).delete(`/api/v1/schedules/${draftId}`).expect(403);
  });

  it('a state-changing call without the CSRF double-submit token is rejected (403)', async () => {
    const created = await authed(app, admin)
      .post('/api/v1/schedules')
      .send({ unitId, month, year: year + 1 })
      .expect(201);
    const target = created.body.id as string;

    await rawRequest(app, admin).delete(`/api/v1/schedules/${target}`).expect(403);

    // The CSRF rejection must leave the schedule in place.
    const row = await prisma.schedule.findUnique({ where: { id: target }, select: { id: true } });
    expect(row).not.toBeNull();
    await authed(app, admin).delete(`/api/v1/schedules/${target}`).expect(200);
  });
});
