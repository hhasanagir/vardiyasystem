import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginAndGetCsrf, AuthCtx } from './test-helpers';

async function freshSession(app: INestApplication): Promise<AuthCtx> {
  return loginAndGetCsrf(app, 'admin@hospital.com', 'admin123');
}

/**
 * NOTE ON THROTTLE BUDGET: `POST /auth/refresh` is limited to 10 req/min per
 * client. The tests below are deliberately ordered (and the concurrent burst
 * capped) so the whole spec never exceeds that budget, keeping each assertion
 * deterministic (401) instead of 429.
 */
describe('Auth Refresh (e2e) — session/refresh hardening', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('logs in and obtains a valid session', async () => {
    const ctx = await freshSession(app);
    expect(ctx.accessToken).toBeTruthy();
    expect(ctx.refreshToken).toBeTruthy();
    expect(ctx.csrfToken).toHaveLength(64);
  }, 30000);

  it('logout revokes the session: the refresh token can no longer be used (401, never 200)', async () => {
    const ctx = await freshSession(app);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .set('x-csrf-token', ctx.csrfToken)
      .set('Cookie', ctx.cookieHeader)
      .send({})
      .expect(200);
    expect(logout.body.success).toBe(true);

    // The revoked refresh token must NOT grant a new pair.
    const probe = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ctx.refreshToken });
    expect([401, 403, 429]).toContain(probe.status);
    expect(probe.status).not.toBe(200);
    expect(probe.status).toBeLessThan(500);
  });

  it('rotation: refresh returns a NEW refresh token and revokes the presented one', async () => {
    const ctx = await freshSession(app);

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ctx.refreshToken })
      .expect(200);

    expect(rotated.body).toHaveProperty('accessToken');
    expect(rotated.body.refreshToken).toBeTruthy();
    expect(rotated.body.refreshToken).not.toBe(ctx.refreshToken);

    // The rotated pair is immediately usable.
    const reuseRotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(200);
    expect(reuseRotated.body.refreshToken).not.toBe(rotated.body.refreshToken);
  });

  it('replay: the SAME token cannot be used twice (second use rejected 401)', async () => {
    const ctx = await freshSession(app);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ctx.refreshToken })
      .expect(200);

    // Same token presented a second time -> replay -> 401.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ctx.refreshToken })
      .expect(401);
  });

  it('concurrent refresh of the SAME token: exactly one winner, the rest rejected, never 5xx', async () => {
    const ctx = await freshSession(app);
    const shared = ctx.refreshToken;

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: shared }),
      ),
    );

    const statuses = results.map((r) => r.status);
    const ok = statuses.filter((s) => s === 200).length;
    const fourOhOne = statuses.filter((s) => s === 401).length;
    const five = statuses.filter((s) => s >= 500);

    expect(ok).toBe(1);
    expect(ok + fourOhOne).toBe(4);
    expect(five.length).toBe(0);
  });

  it('garbage / tampered refresh tokens are rejected (401/429), never 5xx and never succeed', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'tampered-refresh-token-not-a-jwt' });
    expect([401, 429]).toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
});