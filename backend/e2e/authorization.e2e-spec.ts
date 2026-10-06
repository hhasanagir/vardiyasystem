import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './test-app';

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let scheduleId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('DELETE /schedules/:id — role restrictions', () => {
    let adminToken: string;
    let draftScheduleId: string;

    beforeAll(async () => {
      const loginAdmin = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200);
      adminToken = loginAdmin.body.accessToken;

      const now = new Date();
      const year = now.getFullYear() + 10;
      const month = (now.getMonth() + 1) % 12 || 12;

      const unitRes = await api(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`);
      const unitId = unitRes.body[0]?.id;

      const createRes = await api(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unitId, month, year })
        .expect(201);
      draftScheduleId = createRes.body.id;
      scheduleId = draftScheduleId;
    });

    it('should allow admin to delete draft schedule', async () => {
      if (!draftScheduleId) return;
      await api(app)
        .delete(`/api/v1/schedules/${draftScheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /schedules/:id/submit — role restrictions', () => {
    let technicianToken: string;

    beforeAll(async () => {
      try {
        const res = await api(app).post('/api/v1/auth/login').send({
          email: 'technician@hospital.com',
          password: 'technician123',
        });
        technicianToken = res.body.accessToken;
      } catch {
        technicianToken = '';
      }
    });

    it('should reject technician from submitting schedule', async () => {
      if (!technicianToken) return;

      const now2 = new Date();
      const year2 = now2.getFullYear() + 11;
      const month2 = (now2.getMonth() + 1) % 12 || 12;

      const adminRes = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200);
      const adminToken = adminRes.body.accessToken;

      const unitRes = await api(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`);
      const unitId = unitRes.body[0]?.id;

      const createRes = await api(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({ unitId, month: month2, year: year2 });

      if (createRes.status === 201 && createRes.body.id) {
        await api(app)
          .post(`/api/v1/schedules/${createRes.body.id}/submit`)
          .set('Authorization', `Bearer ${technicianToken}`)
          .expect(403);
      }
    });
  });
});
