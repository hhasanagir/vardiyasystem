import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Schedule Notifications (e2e)', () => {
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

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    adminToken = res.body.accessToken;

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unitId: 'test-unit', month: 6, year: 2026 })
      .expect(201);
    scheduleId = createRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/notifications should return notification list', () => {
    return request(app.getHttpServer())
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
    return request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('count');
        expect(typeof res.body.count).toBe('number');
      });
  });

  it('should create notification on schedule submit', async () => {
    const beforeRes = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeCount = beforeRes.body.total;

    await request(app.getHttpServer())
      .post(`/api/v1/schedules/${scheduleId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Test submission' })
      .expect(201);

    const afterRes = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterRes.body.total).toBeGreaterThanOrEqual(beforeCount);
  });
});
