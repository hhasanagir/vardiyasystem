import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Schedule Workflow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
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

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);

    adminToken = loginRes.body.accessToken;
  });

  function getUnitId(): Promise<string> {
    return request(app.getHttpServer())
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${adminToken}`)
      .then((res) => res.body[0]?.id);
  }

  afterAll(async () => {
    if (scheduleId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .ok((res) => res.status < 500);
    }
    await app.close();
  });

  it('1: should create a draft schedule', async () => {
    const now = new Date();
    const year = now.getFullYear() + 20;
    const month = (now.getMonth() + 1) % 12 || 12;
    const unitId = await getUnitId();

    const res = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unitId, month, year })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('draft');
    scheduleId = res.body.id;
  });

  it('2: should submit draft schedule for review', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Onkoloji Mayıs programı' })
      .expect(201);
  });

  it('3: should approve schedule', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Onaylandı' })
      .expect(201);
  });

  it('4: should publish approved schedule', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('5: should create revision from published schedule', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/revision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('6: should rollback draft revision to version 1', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/rollback/1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'rollback attempt' })
      .expect(201);
  });
});
