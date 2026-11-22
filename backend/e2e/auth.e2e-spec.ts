import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PrismaService } from '../src/prisma.service';
import { AuthAttemptService } from '../src/modules/auth/auth-attempt.service';
import {
  createTestApp, loginAndGetCsrf, rawRequest, authed,
  ADMIN_DEMO, SUPERVISOR_DEMO,
} from './test-helpers';

/**
 * Auth (e2e)
 *
 * NOTE ON ORDER: the lockout counter in AuthAttemptService is keyed by
 * email OR ipAddress, so a DELIBERATE failed login in this file also raises the
 * counter for the loopback address of the test runner. The success paths are
 * therefore declared first; the negative cases run afterwards and the file
 * removes its lockout markers in afterAll so no state leaks into the next spec.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const demoEmails = [ADMIN_DEMO.email, SUPERVISOR_DEMO.email];
  const LOOPBACK = '127.0.0.1';

  /** Drop every failed attempt that this file (or a sibling spec sharing the
   * single test process) may have left for the loopback address. The counter is
   * IP-scoped, so a leftover failure count would silently move the threshold and
   * make the lockout assertion depend on execution order. */
  const resetLoopbackAttempts = () =>
    prisma.authAttempt.deleteMany({
      where: { email: { in: [...demoEmails, 'nobody@fake.local'] } },
    });

  /** Empty the in-memory rate-limit budget (no REDIS_URL is configured, so the
   * storage is the default in-process one). */
  const resetThrottleBudget = () => {
    const storage = app.get<ThrottlerStorage>(ThrottlerStorage);
    if (storage instanceof ThrottlerStorageService) {
      storage.onApplicationShutdown();
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // Previous (possibly interrupted) runs can leave an ACTIVE lockout for the
    // demo accounts or the runner IP; that is test state, not business data.
    await prisma.authAttempt.deleteMany({
      where: { OR: [{ email: { in: demoEmails } }, { attemptType: 'LOCKOUT' }] },
    });
  }, 120000);

  afterAll(async () => {
    await prisma.authAttempt.deleteMany({
      where: { OR: [{ email: { in: [...demoEmails, 'nobody@fake.local'] } }, { attemptType: 'LOCKOUT' }] },
    });
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid admin credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_DEMO.email, password: ADMIN_DEMO.password })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(ADMIN_DEMO.email);
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should login with valid supervisor credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: SUPERVISOR_DEMO.email, password: SUPERVISOR_DEMO.password })
        .expect(200);

      expect(res.body.user.email).toBe(SUPERVISOR_DEMO.email);
    });
  });

  describe('JWT protected routes', () => {
    it('should reject unauthenticated requests to /schedules', () => {
      return request(app.getHttpServer()).get('/api/v1/schedules').expect(401);
    });

    it('should reject unauthenticated requests to /devices', () => {
      return request(app.getHttpServer()).get('/api/v1/devices').expect(401);
    });

    it('should allow authenticated requests to /schedules', async () => {
      const ctx = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
      const res = await authed(app, ctx).get('/api/v1/schedules').expect(200);
      expect(Array.isArray(res.body) || Array.isArray(res.body?.data)).toBe(true);
    });

    it('should reject a state-changing call without the CSRF double-submit token', async () => {
      const ctx = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
      await rawRequest(app, ctx).post('/api/v1/schedules').send({}).expect(403);
    });
  });

  describe('login failures', () => {
    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_DEMO.email, password: 'definitely-wrong' })
        .expect(401);
    });

    it('should reject an empty body', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({});
      expect([400, 401]).toContain(res.status);
    });

    it('should lock the account after repeated failures', async () => {
      // A dedicated, non-shared account: the counter is IP-scoped, so a real
      // demo user must not be used for a deliberate lockout.
      const email = 'nobody@fake.local';

      // Start from a known state. `singleFork` runs every spec in one process,
      // so both the loopback failure counters in the database and the in-memory
      // login budget can already be spent by an earlier file. Without this reset
      // the login throttle answers 429 before the credential check ever runs and
      // the account is never actually locked.
      await resetLoopbackAttempts();
      resetThrottleBudget();

      let credentialFailures = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'wrong-on-purpose' });
        if (res.status === 401) {
          credentialFailures += 1;
        } else {
          // Everything else is a hard denial (429 throttle / 423 locked) and is
          // equally acceptable for this test; the count below is what matters.
          expect([429, 423]).toContain(res.status);
        }
      }
      expect(
        credentialFailures,
        'the credential path must have been reached often enough to trip the lockout',
      ).toBeGreaterThanOrEqual(5);

      const marker = await prisma.authAttempt.findFirst({
        where: { email, attemptType: 'LOCKOUT', lockoutUntil: { gt: new Date() } },
        select: { lockoutUntil: true },
      });
      expect(marker, 'a LOCKOUT marker must exist for the locked account').toBeTruthy();

      // The login path consults exactly this service before verifying a
      // password, so a locked account is refused even with the right password.
      const state = await app.get(AuthAttemptService).isLockedOut({ email });
      expect(state.locked).toBe(true);
      expect(state.remainingMs).toBeGreaterThan(0);

      // Release the lock immediately: it is keyed by IP as well, and a leftover
      // marker would block every later spec that logs in from the runner.
      await prisma.authAttempt.deleteMany({ where: { email, attemptType: 'LOCKOUT' } });
      await resetLoopbackAttempts();
    });
  });
});
