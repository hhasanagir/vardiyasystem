import { test, expect } from '@playwright/test';

/**
 * Role enforcement as the browser actually experiences it: a real session, the
 * real guard, and the real redirect. The API is the second line of defence and is
 * already covered by the backend suite — this spec proves the client cannot even
 * render a page the account has no business seeing.
 */
async function signedIn(browser: import('@playwright/test').Browser, who: 'supervisor' | 'technician' | 'engineer') {
  return browser.newContext({ storageState: `fixtures/.auth/${who}.json` });
}

test.describe('Role-based access in the browser', () => {
  test('a technician is bounced off a supervisor-only route', async ({ browser }) => {
    const context = await signedIn(browser, 'technician');
    const page = await context.newPage();

    await page.goto('/app/approval-center');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.approval-layout')).toHaveCount(0);
    await expect(page.locator('.dashboard-greeting')).toBeVisible();

    await context.close();
  });

  test('a supervisor reaches the approval center', async ({ browser }) => {
    const context = await signedIn(browser, 'supervisor');
    const page = await context.newPage();

    await page.goto('/app/approval-center');

    await expect(page).toHaveURL(/\/app\/approval-center$/);
    await expect(page.locator('.approval-layout')).toBeVisible();

    await context.close();
  });

  test('a medical engineer reaches live tracking', async ({ browser }) => {
    const context = await signedIn(browser, 'engineer');
    const page = await context.newPage();

    await page.goto('/app/live-tracking');

    await expect(page).toHaveURL(/\/app\/live-tracking$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Vardiya Takibi' })).toBeVisible();

    await context.close();
  });

  test('a technician cannot reach live tracking either', async ({ browser }) => {
    const context = await signedIn(browser, 'technician');
    const page = await context.newPage();

    await page.goto('/app/live-tracking');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Vardiya Takibi' })).toHaveCount(0);

    await context.close();
  });
});
