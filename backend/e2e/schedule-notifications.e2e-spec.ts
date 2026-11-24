import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import {
  createTestApp, loginAndGetCsrf, authed, rawRequest, AuthCtx,
  ADMIN_DEMO, PERSONNEL_PASSWORD,
} from './test-helpers';

const PREFIX = 'p3nt';
const RECIPIENT_EMAIL = `${PREFIX}.recipient@fake.local`;
const OTHER_EMAIL = `${PREFIX}.other@fake.local`;

/**
 * Schedule Notifications (e2e): the notification read model must reflect the
 * persisted notifications of the *caller* - no cross-user leak, and the
 * read/unread transitions must be durable.
 */
describe('Schedule Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let recipient: AuthCtx;
  let other: AuthCtx;
  let orgId: string;
  let notificationId: string;
  let otherNotificationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);

    const units = await prisma.unit.findMany({ select: { id: true, organizationId: true }, take: 1 });
    orgId = units[0].organizationId as string;

    const passwordHash = await bcrypt.hash(PERSONNEL_PASSWORD, 10);
    for (const email of [RECIPIENT_EMAIL, OTHER_EMAIL]) {
      await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: `P3 Notifications ${email}`,
          role: 'technician',
          organizationId: orgId,
          isActive: true,
        },
      });
    }
    recipient = await loginAndGetCsrf(app, RECIPIENT_EMAIL, PERSONNEL_PASSWORD);
    other = await loginAndGetCsrf(app, OTHER_EMAIL, PERSONNEL_PASSWORD);

    const mine = await prisma.notification.create({
      data: {
        organizationId: orgId,
        type: 'SCHEDULE_APPROVED',
        priority: 'HIGH',
        title: 'P3 schedule approved',
        message: 'Your schedule was approved',
        senderId: admin.user.id,
        status: 'SENT',
        recipients: { create: [{ userId: recipient.user.id, isRead: false }] },
      },
      select: { id: true },
    });
    notificationId = mine.id;

    const theirs = await prisma.notification.create({
      data: {
        organizationId: orgId,
        type: 'SCHEDULE_CHANGED',
        priority: 'NORMAL',
        title: 'P3 schedule changed',
        message: 'A schedule you do not own changed',
        senderId: admin.user.id,
        status: 'SENT',
        recipients: { create: [{ userId: other.user.id, isRead: false }] },
      },
      select: { id: true },
    });
    otherNotificationId = theirs.id;
  }, 180000);

  afterAll(async () => {
    const problems: string[] = [];
    const step = async (label: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await step('notification recipients', () => prisma.notificationRecipient.deleteMany({
      where: { notificationId: { in: [notificationId, otherNotificationId] } },
    }));
    await step('notifications', () => prisma.notification.deleteMany({
      where: { id: { in: [notificationId, otherNotificationId] } },
    }));
    await step('audit logs', () => prisma.auditLog.deleteMany({ where: { user: { email: { in: [RECIPIENT_EMAIL, OTHER_EMAIL] } } } }));
    await step('auth attempts', () => prisma.authAttempt.deleteMany({ where: { email: { in: [RECIPIENT_EMAIL, OTHER_EMAIL] } } }));
    await step('users', () => prisma.user.deleteMany({ where: { email: { in: [RECIPIENT_EMAIL, OTHER_EMAIL] } } }));

    expect(problems).toEqual([]);
    expect(await prisma.notification.count({ where: { id: { in: [notificationId, otherNotificationId] } } })).toBe(0);
    expect(await prisma.user.count({ where: { email: { in: [RECIPIENT_EMAIL, OTHER_EMAIL] } } })).toBe(0);
    await app.close();
  });

  it('GET /api/v1/notifications returns only the caller notifications', async () => {
    const res = await authed(app, recipient).get('/api/v1/notifications').expect(200);
    const body = res.body as { data: Array<{ id: string; title: string }>; total: number };

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    const ids = body.data.map((n) => n.id);
    expect(ids).toContain(notificationId);
    expect(ids).not.toContain(otherNotificationId);
  });

  it('the unread count matches the caller unread rows', async () => {
    const res = await authed(app, recipient).get('/api/v1/notifications/unread-count').expect(200);
    expect(typeof res.body.count).toBe('number');

    const unread = await prisma.notificationRecipient.count({
      where: { userId: recipient.user.id, isRead: false, isDeleted: false },
    });
    expect(res.body.count).toBe(unread);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('marking a notification as read is durable and affects only the caller', async () => {
    await authed(app, recipient).post(`/api/v1/notifications/${notificationId}/read`).expect(200);

    const row = await prisma.notificationRecipient.findFirst({
      where: { notificationId, userId: recipient.user.id },
      select: { isRead: true, readAt: true },
    });
    expect(row?.isRead).toBe(true);
    expect(row?.readAt).toBeTruthy();

    const otherRow = await prisma.notificationRecipient.findFirst({
      where: { notificationId: otherNotificationId, userId: other.user.id },
      select: { isRead: true },
    });
    expect(otherRow?.isRead).toBe(false);
  });

  it('a user cannot read a notification they are not a recipient of', async () => {
    const res = await authed(app, recipient).get(`/api/v1/notifications/${otherNotificationId}`).expect(200);
    expect(res.body.data).toBeNull();
  });

  it('a state-changing notification call without the CSRF token is rejected (403)', () => {
    return rawRequest(app, recipient).post(`/api/v1/notifications/${notificationId}/read`).expect(403);
  });

  it('GET /api/v1/notifications fails without auth (401)', () => {
    return request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });

  it('GET /api/v1/notifications/unread-count fails without auth (401)', () => {
    return request(app.getHttpServer()).get('/api/v1/notifications/unread-count').expect(401);
  });
});
