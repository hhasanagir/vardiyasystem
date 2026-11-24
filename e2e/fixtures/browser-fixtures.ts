import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { UnitType, UserRole } from '@prisma/client';

/**
 * Browser acceptance fixtures.
 *
 * The accounts are created straight through Prisma (the same database the API
 * uses) because a browser run needs a known password and a known role, and
 * public registration only issues accounts behind an invite code. Every account
 * is attached to a real unit, so it carries a tenant and is subject to the same
 * tenant filtering as production — an account without a tenant would be refused
 * by `TenantContextInterceptor` and would test nothing.
 *
 * The backend modules are resolved from the backend's own `node_modules`,
 * because that is where the Prisma client and bcrypt live.
 */
const backendRequire = createRequire(join(__dirname, '..', '..', 'backend', 'package.json'));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = backendRequire('@prisma/client') as typeof import('@prisma/client');
const bcrypt = backendRequire('bcrypt') as typeof import('bcrypt');

export const prisma = new PrismaClient();

export type BrowserUserSpec = {
  key: string;
  email: string;
  name: string;
  role: UserRole;
  unitType: UnitType;
};

export type BrowserUser = BrowserUserSpec & { password: string; id: string };

/** Roles the browser suite needs; the system admin already exists in the seed. */
export const BROWSER_USERS: BrowserUserSpec[] = [
  {
    key: 'supervisor',
    email: 'e2e.supervisor@e2e.local',
    name: 'E2E Süpervizör',
    role: 'supervisor',
    unitType: 'supervizor',
  },
  {
    key: 'technician',
    email: 'e2e.technician@e2e.local',
    name: 'E2E Tekniker',
    role: 'technician',
    unitType: 'mr',
  },
  {
    key: 'engineer',
    email: 'e2e.engineer@e2e.local',
    name: 'E2E Mühendis',
    role: 'medical_engineer',
    unitType: 'mr',
  },
];

/** Seeded account used for the cross-tenant (system) flows. */
export const ADMIN = { key: 'admin', email: 'admin@hospital.com', password: 'admin123' };

/**
 * The plan grid only renders when a schedule exists for the month on screen, and
 * this database ships with no schedules at all. A draft schedule for October
 * gives the plan page something real to render — including the 29 October
 * national holiday — and is removed again in teardown.
 */
export const PLAN_FIXTURE = { unitType: 'mr' as UnitType, month: 10, year: 2026 };

/**
 * The audit page's suspicious-activity panel is only rendered when a detection
 * heuristic actually fires, and "rapid changes" needs ten updates by one account
 * within the hour. A dedicated personnel row gives the audit spec a record it may
 * edit repeatedly through the real API without touching seeded data, and it is
 * removed again in teardown.
 */
export const AUDIT_PERSONNEL_EMAIL = 'e2e.audit.target@e2e.local';

export async function ensureAuditPersonnel(): Promise<{ id: string }> {
  const unit = await unitByType('mr');
  const row = await prisma.personnel.upsert({
    where: { email: AUDIT_PERSONNEL_EMAIL },
    create: {
      name: 'E2E Denetim Kaydı',
      role: 'technician',
      employeeNo: 'E2E-AUDIT-01',
      email: AUDIT_PERSONNEL_EMAIL,
      unitId: unit.id,
      organizationId: unit.organizationId,
      skills: [],
      certifications: [],
      deviceSkills: [],
    },
    update: { unitId: unit.id, organizationId: unit.organizationId, isActive: true },
    select: { id: true },
  });
  return row;
}

export async function removeAuditPersonnel(): Promise<void> {
  const rows = await prisma.personnel.findMany({
    where: { email: AUDIT_PERSONNEL_EMAIL },
    select: { id: true },
  });
  const ids = rows.map((p) => p.id);
  if (ids.length === 0) return;

  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.personnel.deleteMany({ where: { id: { in: ids } } });
}

export async function ensurePlanSchedule(): Promise<void> {
  const unit = await unitByType(PLAN_FIXTURE.unitType);
  const data = {
    unitId: unit.id,
    organizationId: unit.organizationId,
    month: PLAN_FIXTURE.month,
    year: PLAN_FIXTURE.year,
    status: 'draft' as const,
    version: 1,
  };

  await prisma.schedule.upsert({
    where: {
      unitId_month_year: {
        unitId: unit.id,
        month: PLAN_FIXTURE.month,
        year: PLAN_FIXTURE.year,
      },
    },
    create: data,
    update: data,
  });
}

export async function removePlanSchedule(): Promise<void> {
  const unit = await prisma.unit.findFirst({
    where: { type: PLAN_FIXTURE.unitType },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  if (!unit) return;

  const schedule = await prisma.schedule.findFirst({
    where: { unitId: unit.id, month: PLAN_FIXTURE.month, year: PLAN_FIXTURE.year },
    select: { id: true },
  });
  if (!schedule) return;

  await prisma.assignment.deleteMany({ where: { scheduleId: schedule.id } });
  await prisma.schedule.deleteMany({ where: { id: schedule.id } });
}

async function unitByType(type: UnitType) {
  const unit = await prisma.unit.findFirst({
    where: { type },
    orderBy: { name: 'asc' },
    select: { id: true, organizationId: true },
  });
  if (!unit) {
    throw new Error(`Browser fixtures need a "${type}" unit, none exists in this database`);
  }
  return unit;
}

/**
 * The client resolves route permissions from `/rbac/me/permissions`, which reads
 * `user_role_assignments` — not the legacy `user.role` column. Without an
 * assignment the account would be refused every `rbacGuard` route and the specs
 * would be testing a stripped-down user instead of a real one.
 */
async function roleIdByUserRole(role: UserRole) {
  // `User.role` is the legacy lowercase enum while the RBAC table stores the
  // uppercase name (the same mapping the backend's legacyRoleToRbacName does).
  const rbacName = role.toUpperCase();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM roles WHERE name = ${rbacName}::"RbacRoleName" LIMIT 1
  `;
  return rows[0]?.id;
}

async function assignRole(userId: string, role: UserRole, unitId: string, organizationId: string | null) {
  const roleId = await roleIdByUserRole(role);
  if (!roleId) {
    throw new Error(`No RBAC role row exists for "${role}", the seed is incomplete`);
  }

  await prisma.userRoleAssignment.create({
    data: {
      userId,
      roleId,
      unitId,
      organizationId,
      assignedBy: 'browser-e2e',
      isActive: true,
    },
  });
}

/** Idempotent: safe to run against a database that already has the fixtures. */
export async function ensureBrowserUsers(): Promise<{ users: BrowserUser[]; password: string }> {
  const password = `pw-${randomBytes(9).toString('base64url')}`;
  const hashed = await bcrypt.hash(password, 10);
  const created: BrowserUser[] = [];

  for (const user of BROWSER_USERS) {
    const unit = await unitByType(user.unitType);
    const data = {
      name: user.name,
      password: hashed,
      role: user.role,
      isActive: true,
      unitId: unit.id,
      organizationId: unit.organizationId,
    };
    const row = await prisma.user.upsert({
      where: { email: user.email },
      create: { email: user.email, ...data },
      update: data,
      select: { id: true, email: true, role: true, unitId: true, organizationId: true },
    });
    await assignRole(row.id, user.role, unit.id, unit.organizationId);
    created.push({ ...user, password, id: row.id });
  }

  return { users: created, password };
}

/** Removes the fixtures and every row that referenced them. */
export async function removeBrowserUsers(): Promise<void> {
  const emails = BROWSER_USERS.map((u) => u.email);
  const rows = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = rows.map((u) => u.id);

  if (ids.length > 0) {
    // Order matters: rows that reference the user go first, then the attempts
    // the lockout counter reads, then the account itself.
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authAttempt.deleteMany({
      where: { OR: [{ email: { in: emails } }, { userId: { in: ids } }] },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
