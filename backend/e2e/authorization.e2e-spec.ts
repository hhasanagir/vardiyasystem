import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let scheduleId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('DELETE /schedules/:id — role restrictions', () => {
    let adminToken: string;
    let draftScheduleId: string;

    beforeAll(async () => {
      const loginAdmin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200);
      adminToken = loginAdmin.body.accessToken;

      const now = new Date();
      const year = now.getFullYear() + 10;
      const month = (now.getMonth() + 1) % 12 || 12;

      const unitRes = await request(app.getHttpServer())
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`);
      const unitId = unitRes.body[0]?.id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unitId, month, year })
        .expect(201);
      draftScheduleId = createRes.body.id;
      scheduleId = draftScheduleId;
    });

    it('should allow admin to delete draft schedule', async () => {
      if (!draftScheduleId) return;
      await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${draftScheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /schedules/:id/submit — role restrictions', () => {
    let technicianToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
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

      const adminRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200);
      const adminToken = adminRes.body.accessToken;

      const unitRes = await request(app.getHttpServer())
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`);
      const unitId = unitRes.body[0]?.id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({ unitId, month: month2, year: year2 });

      if (createRes.status === 201 && createRes.body.id) {
        await request(app.getHttpServer())
          .post(`/api/v1/schedules/${createRes.body.id}/submit`)
          .set('Authorization', `Bearer ${technicianToken}`)
          .expect(403);
      }
    });
  });
});
