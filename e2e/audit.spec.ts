import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prisma, AUDIT_PERSONNEL_EMAIL } from './fixtures/browser-fixtures';
import { signedInContext } from './fixtures/auth';

/** The detection threshold the audit service applies to "rapid changes". */
const RAPID_CHANGE_THRESHOLD = 10;

async function accessTokenFrom(stateFile: string): Promise<string> {
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins[0]?.localStorage.find((item) => item.name === 'accessToken');
  if (!entry) throw new Error(`No accessToken in ${stateFile}`);
  return entry.value;
}

/**
 * Drives the real update endpoint as the supervisor until the audit service has
 * enough history to flag the account. The suspicious-activity panel is rendered
 * only when a heuristic actually fires, so the test has to produce the
 * precondition itself instead of relying on whatever traffic the database happens
 * to hold. The personnel row is a fixture and is deleted in teardown.
 */
async function flagRapidChanges(request: APIRequestContext): Promise<void> {
  const target = await prisma.personnel.findUnique({
    where: { email: AUDIT_PERSONNEL_EMAIL },
    select: { id: true },
  });
  if (!target) throw new Error('The audit fixture record is missing');

  await request.get('/api/v1/auth/csrf-token');
  const csrf = (await request.storageState()).cookies.find((c) => c.name === 'csrf-token')?.value;
  if (!csrf) throw new Error('No csrf-token cookie was issued');
  const token = await accessTokenFrom('fixtures/.auth/supervisor.json');

  for (let i = 1; i <= RAPID_CHANGE_THRESHOLD; i += 1) {
    const res = await request.put(`/api/v1/personnel/${target.id}`, {
      data: { notes: `E2E denetim güncellemesi ${i}` },
      headers: { 'x-csrf-token': csrf, authorization: `Bearer ${token}` },
    });
    if (!res.ok()) {
      throw new Error(`Personnel update ${i} failed: HTTP ${res.status()} ${await res.text()}`);
    }
  }
}

test.describe('Audit timeline', () => {
  test('the audit centre renders its aggregate statistics', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    await page.goto('/app/audit');

    await expect(page).toHaveURL(/\/app\/audit$/);
    await expect(page.locator('.stats-grid')).toBeVisible();
    await expect(page.locator('.stat-label').first()).toHaveText('Toplam İşlem');
    // The value is a number rendered by the component; an empty cell would mean
    // the audit request never resolved.
    await expect(page.locator('.stat-value').first()).not.toBeEmpty();

    await context.close();
  });

  test('flags rapid changes made by one account', async ({ browser, request }) => {
    await flagRapidChanges(request);

    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    await page.goto('/app/audit');
    await expect(page.locator('.suspicious-list')).toBeVisible();
    // The panel has to name the account that triggered the heuristic rather than
    // render an empty container. The audit history is shared with the rest of the
    // suite, so other accounts may legitimately appear flagged here too; the
    // assertion is scoped to the fixture account's own rapid-change item instead
    // of assuming the panel is globally empty.
    const supervisorFlag = page.locator('.suspicious-item', { hasText: 'E2E Süpervizör' });
    await expect(supervisorFlag).toHaveCount(1);
    await expect(supervisorFlag.locator('.suspicious-message')).toContainText(
      'E2E Süpervizör'
    );
    await expect(supervisorFlag.locator('.suspicious-message')).toContainText(
      `${RAPID_CHANGE_THRESHOLD} hızlı değişiklik`
    );
    await expect(supervisorFlag).toHaveClass(/critical|high/);

    await context.close();
  });

  test('the audit centre is closed to a technician', async ({ browser }) => {
    const context = await signedInContext(browser, 'technician');
    const page = await context.newPage();

    await page.goto('/app/audit');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.stats-grid')).toHaveCount(0);

    await context.close();
  });
});
