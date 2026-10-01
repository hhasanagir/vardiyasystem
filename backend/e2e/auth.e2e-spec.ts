import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

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

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid admin credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.role).toBe('super_admin');
        });
    });

    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'wrong' })
        .expect(401);
    });

    it('should reject empty body', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
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
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@hospital.com', password: 'admin123' })
        .expect(200);

      const token = loginRes.body.accessToken;

      return request(app.getHttpServer())
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
