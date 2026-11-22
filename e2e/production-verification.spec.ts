import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

/**
 * Release smoke: the paths a support engineer hits first. Every assertion reads
 * real rendered output — there is no `.catch()` pass, no "if the button exists"
 * branch, and no fixed sleep standing in for a wait.
 */
test.describe('Release smoke — session and access', () => {
  test('a signed-in session opens the dashboard and survives a reload', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.dashboard-greeting')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.dashboard-greeting')).toBeVisible();

    await context.close();
  });

  test('a signed-in admin reaches the approval centre', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    await page.goto('/app/approval-center');

    await expect(page).toHaveURL(/\/app\/approval-center$/);
    await expect(page.locator('.approval-layout')).toBeVisible();

    await context.close();
  });

  test('a signed-in session survives in another tab', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const first = await context.newPage();
    await first.goto('/app/dashboard');
    await expect(first.locator('.dashboard-greeting')).toBeVisible();

    const second = await context.newPage();
    await second.goto('/app/employees');

    // A deep link in a fresh tab must not fall back to the login screen while
    // the session is alive.
    await expect(second).toHaveURL(/\/app\/employees$/);
    await expect(second.locator('.personnel-page')).toBeVisible();

    await context.close();
  });
});

test.describe('Release smoke — reports and export', () => {
  test('the reports page renders and its tabs switch', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    await page.goto('/app/reports');

    await expect(page.getByRole('heading', { level: 1, name: 'Vardiya Raporları' })).toBeVisible();
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(4);
    await expect(page.locator('.tab-btn.active')).toHaveCount(1);

    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveClass(/active/);
    await expect(page.locator('.tab-btn.active')).toHaveCount(1);

    await context.close();
  });

  test('the export dialog names the month and can be cancelled', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();
    await page.goto('/app/reports');

    await page.locator('.export-btn').click();
    await expect(page.locator('.export-form')).toBeVisible();
    await expect(page.locator('.export-month')).toContainText(/\d{4}/);

    await page.locator('.btn-cancel').click();
    await expect(page.locator('.export-form')).toHaveCount(0);

    await context.close();
  });

  test('the export produces a CSV download', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();
    await page.goto('/app/reports');

    await page.locator('.export-btn').click();
    await expect(page.locator('.export-form')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.locator('.btn-export').click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/\.csv$/i);

    await context.close();
  });
});

test.describe('Release smoke — routing resilience', () => {
  test('an unknown route resolves without crashing the app', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // The route table ends with `**` → /login, and the guest guard then sends an
    // authenticated visitor back to the dashboard. The important part is that
    // the app settles on a working screen instead of a blank one.
    await page.goto('/app/there-is-no-such-page');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.dashboard-greeting')).toBeVisible();
    expect(errors).toEqual([]);

    await context.close();
  });

  test('an unknown route without a session lands on the login screen', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/app/there-is-no-such-page');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#email')).toBeVisible();

    await context.close();
  });

  test('every unit plan route resolves to a rendered plan page', async ({ browser }) => {
    const context = await signedInContext(browser, 'admin');
    const units = ['mr', 'bt', 'rontgen', 'nukleer-tip', 'onkoloji'];

    for (const unit of units) {
      const page = await context.newPage();
      await page.goto(`/app/${unit}-plan`);

      await expect(page).toHaveURL(new RegExp(`/app/${unit}-plan$`));
      await expect(page.locator('.plan-page')).toBeVisible();

      await page.close();
    }

    await context.close();
  });
});
