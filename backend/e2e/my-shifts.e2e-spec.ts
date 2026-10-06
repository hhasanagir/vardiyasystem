import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './test-app';

describe('My Shifts Dashboard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let techToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const adminRes = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    adminToken = adminRes.body.accessToken;

    const techRes = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@hospital.com', password: 'technician123' })
      .expect(200);
    techToken = techRes.body.accessToken;

    await api(app)
      .post('/api/v1/schedules/unit/mr/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 5, year: 2026 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/me/shifts should return shifts array', () => {
    return api(app)
      .get('/api/v1/me/shifts')
      .query({ month: 5, year: 2026 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('shifts');
        expect(Array.isArray(res.body.shifts)).toBe(true);
        expect(res.body).toHaveProperty('personnel');
        expect(res.body).toHaveProperty('month');
        expect(res.body).toHaveProperty('year');
      });
  });

  it('GET /api/v1/me/summary should return summary object', () => {
    return api(app)
      .get('/api/v1/me/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('today');
        expect(res.body).toHaveProperty('week');
        expect(res.body).toHaveProperty('upcoming');
        expect(res.body).toHaveProperty('summary');
        expect(res.body.summary).toHaveProperty('totalShifts');
        expect(res.body.summary).toHaveProperty('totalHours');
        expect(res.body.summary).toHaveProperty('nightShifts');
        expect(res.body.summary).toHaveProperty('weekendShifts');
        expect(res.body.summary).toHaveProperty('overtimeHours');
      });
  });

  it('GET /api/v1/me/summary for technician returns valid data', () => {
    return api(app)
      .get('/api/v1/me/summary')
      .set('Authorization', `Bearer ${techToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('summary');
        expect(typeof res.body.summary.totalShifts).toBe('number');
        expect(typeof res.body.summary.totalHours).toBe('number');
      });
  });

  it('GET /api/v1/me/shifts should fail without auth', () => {
    return api(app)
      .get('/api/v1/me/shifts')
      .query({ month: 5, year: 2026 })
      .expect(401);
  });

  it('GET /api/v1/me/summary should fail without auth', () => {
    return api(app).get('/api/v1/me/summary').expect(401);
  });
});
