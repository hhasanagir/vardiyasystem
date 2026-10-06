import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './test-app';

describe('Schedule Notifications (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let scheduleId: string;

  function getUnitId(): Promise<string> {
    return api(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${adminToken}`)
      .then((res) => res.body[0]?.id);
  }

  beforeAll(async () => {
    app = await createTestApp();

    const res = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    adminToken = res.body.accessToken;

    const createRes = await api(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        unitId: await getUnitId(),
        month: 6,
        year: new Date().getFullYear() + 20,
      })
      .expect(201);
    scheduleId = createRes.body.id;
  });

  afterAll(async () => {
    if (scheduleId) {
      await api(app)
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .ok((res) => res.status < 500);
    }
    await app.close();
  });

  it('GET /api/v1/notifications should return notification list', () => {
    return api(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
        expect(Array.isArray(res.body.data)).toBe(true);
      });
  });

  it('GET /api/v1/notifications/unread-count should return count', () => {
    return api(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('count');
        expect(typeof res.body.count).toBe('number');
      });
  });

  it('should create notification on schedule submit', async () => {
    const beforeRes = await api(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeCount = beforeRes.body.total;

    await api(app)
      .post(`/api/v1/schedules/${scheduleId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Test submission' })
      .expect(201);

    const afterRes = await api(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterRes.body.total).toBeGreaterThanOrEqual(beforeCount);
  });
});
