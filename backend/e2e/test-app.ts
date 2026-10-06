import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';

const csrfTokenByApp = new WeakMap<INestApplication, string>();
const ipByApp = new WeakMap<INestApplication, string>();

let appCounter = 0;

/**
 * Boots AppModule with the same middleware main.ts installs.
 *
 * main.ts registers cookie-parser. Without it `req.cookies` stays undefined,
 * CsrfGuard.validateToken() always returns false and every state-changing
 * request (POST/PUT/PATCH/DELETE) fails with 403 -- which reads like an RBAC
 * failure but is not one.
 *
 * main.ts also enables `trust proxy`. Without that the throttler keys on the
 * socket address, so every spec file shares the 127.0.0.1 bucket and a suite of
 * logins exhausts the login throttle part-way through. Mirroring main.ts plus a
 * per-app X-Forwarded-For gives each spec its own bucket.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  const trustLevel = Number(process.env.TRUST_PROXY_LEVEL ?? 1);
  app.getHttpAdapter().getInstance().set('trust proxy', trustLevel);
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  appCounter += 1;
  ipByApp.set(app, `10.0.${appCounter}.1`);
  csrfTokenByApp.set(app, await readCsrfToken(app));
  return app;
}

/**
 * supertest entry point carrying the CSRF double-submit pair.
 * CsrfGuard only validates non-safe methods, so this is also safe for reads.
 *
 * supertest's `request(app)` only exposes the verb methods, so `.set()` has to
 * be applied per verb rather than once on a shared wrapper.
 */
export function api(app: INestApplication) {
  const token = csrfTokenByApp.get(app);
  if (!token) {
    throw new Error('api() requires an app built by createTestApp()');
  }
  const cookie = `${CSRF_COOKIE}=${token}`;
  const ip = ipByApp.get(app) as string;
  const server = app.getHttpServer();

  return {
    get: (url: string) =>
      request(server)
        .get(url)
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .set(CSRF_HEADER, token),
    post: (url: string) =>
      request(server)
        .post(url)
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .set(CSRF_HEADER, token),
    put: (url: string) =>
      request(server)
        .put(url)
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .set(CSRF_HEADER, token),
    patch: (url: string) =>
      request(server)
        .patch(url)
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .set(CSRF_HEADER, token),
    delete: (url: string) =>
      request(server)
        .delete(url)
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .set(CSRF_HEADER, token),
  };
}

async function readCsrfToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf-token');
  const setCookie = res.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  const cookie = setCookie?.find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  const token = cookie?.split(';')[0].split('=')[1];
  if (!token) {
    throw new Error('CSRF cookie was not issued by GET /auth/csrf-token');
  }
  return token;
}
