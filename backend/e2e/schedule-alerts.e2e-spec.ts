import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './test-app';

describe('Schedule Alerts (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let scheduleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const res = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    token = res.body.accessToken;

    const scheduleRes = await api(app)
      .post('/api/v1/schedules/unit/mr/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 5, year: 2026 })
      .expect(201);
    scheduleId = scheduleRes.body.schedule?.id || scheduleRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/schedules/:id/alerts should return alert array', () => {
    return api(app)
      .get(`/api/v1/schedules/${scheduleId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) {
          const alert = res.body[0];
          expect(alert).toHaveProperty('type');
          expect(alert).toHaveProperty('severity');
          expect(alert).toHaveProperty('message');
          expect(alert).toHaveProperty('unit');
          expect(['info', 'warning', 'critical']).toContain(alert.severity);
        }
      });
  });

  it('GET /api/v1/schedules/:id/alerts should fail without auth', () => {
    return api(app).get(`/api/v1/schedules/${scheduleId}/alerts`).expect(401);
  });

  it('GET /api/v1/schedules/:id/alerts should return empty for nonexistent schedule', () => {
    return api(app)
      .get('/api/v1/schedules/nonexistent-id/alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
      });
  });

  it('GET /api/v1/schedules/:id/alerts should have valid severity values', () => {
    return api(app)
      .get(`/api/v1/schedules/${scheduleId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        for (const alert of res.body) {
          expect(['info', 'warning', 'critical']).toContain(alert.severity);
          expect([
            'missing_staff',
            'understaffed',
            'double_booking',
            'overtime',
            'consecutive_night',
            'unassigned_critical',
            'workload_imbalance',
            'shift_threshold',
          ]).toContain(alert.type);
        }
      });
  });
});
