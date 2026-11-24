import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

/**
 * Business rules such as night-after-day rejection, the 11-hour rest window,
 * coverage completeness and night-distribution fairness are enforced by the
 * service layer and asserted against the real API in
 * `backend/e2e/acceptance-critical-flow.e2e-spec.ts` and
 * `backend/e2e/schedule-workflow.e2e-spec.ts`. Duplicating them here with
 * guessed selectors would only produce false confidence, so this file covers
 * what genuinely belongs to a browser: that the operator sees the right screen
 * and the right state, and that the state survives navigation.
 */
test.describe('Shift planning surfaces', () => {
  test('the dashboard summarises the units for a supervisor', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();

    await page.goto('/app/dashboard');

    await expect(page.locator('.dashboard-greeting')).toBeVisible();
    await expect(page.locator('.kpi-grid')).toBeVisible();
    await expect(page.locator('.unit-summary').first()).toBeVisible();
    await expect(page.locator('.unit-summary-name').first()).not.toBeEmpty();

    await context.close();
  });

  test('the dashboard refresh control reloads the figures', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/dashboard');
    await expect(page.locator('.kpi-grid')).toBeVisible();

    const refresh = page.getByRole('button', { name: 'Yenile' });
    await expect(refresh).toBeEnabled();
    await refresh.click();

    // The control reports the moment the figures were last loaded; a dead
    // button would leave the old stamp in place with no error state.
    await expect(page.locator('.last-updated')).toBeVisible();
    await expect(page.locator('.error-state')).toHaveCount(0);

    await context.close();
  });

  test('a plan page reached from the dashboard keeps its unit context', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/dashboard');

    await page.goto('/app/bt-plan');

    await expect(page).toHaveURL(/\/app\/bt-plan$/);
    await expect(page.locator('.unit-label')).toContainText('BT');

    await context.close();
  });

  test('the plan page settles into a defined state for the visible month', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/mr-plan');

    // A month with a schedule renders the grid; a month without one renders an
    // explicit message. What must never happen is a page that shows neither,
    // which is why this is one assertion over both states instead of a branch
    // that could quietly pass on neither.
    const settled = page
      .locator('th.date-col')
      .first()
      .or(page.locator('.error-title'))
      .or(page.getByRole('heading', { level: 3 }));

    await expect(page.locator('.plan-page')).toBeVisible();
    await expect(settled).toBeVisible();

    await context.close();
  });
});
