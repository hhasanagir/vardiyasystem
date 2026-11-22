import { rm } from 'node:fs/promises';
import {
  prisma,
  removeBrowserUsers,
  removePlanSchedule,
  removeAuditPersonnel,
} from './browser-fixtures';

/**
 * Leaves the database as it was found: the fixture accounts, their sessions,
 * attempts and audit rows are deleted, the plan schedule and the audit fixture
 * record are removed, and the generated storage states are dropped so no token
 * survives the run.
 */
export default async function globalTeardown(): Promise<void> {
  await rm('fixtures/.auth', { recursive: true, force: true });
  await removeBrowserUsers();
  await removePlanSchedule();
  await removeAuditPersonnel();
  await prisma.$disconnect();
  process.stdout.write('browser fixtures removed\n');
}
