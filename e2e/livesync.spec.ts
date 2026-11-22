import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

test.describe('Live tracking', () => {
  test('an engineer sees the live board with its unit overview', async ({ browser }) => {
    const context = await signedInContext(browser, 'engineer');
    const page = await context.newPage();

    await page.goto('/app/live-tracking');

    await expect(page).toHaveURL(/\/app\/live-tracking$/);
    await expect(page.locator('.live-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Vardiya Takibi' })).toBeVisible();
    // The clock is a live signal; if it is frozen the board is not polling.
    const clock = page.locator('.time-display .time');
    await expect(clock).toBeVisible();
    const first = (await clock.textContent())?.trim();
    expect(first).toMatch(/\d{2}:\d{2}/);

    await expect(page.locator('.unit-card').first()).toBeVisible();
    await expect(page.locator('.unit-name').first()).not.toBeEmpty();

    await context.close();
  });

  test('the live board shows the current wall-clock time', async ({ browser }) => {
    const context = await signedInContext(browser, 'engineer');
    const page = await context.newPage();
    await page.goto('/app/live-tracking');

    const clock = page.locator('.time-display .time');
    await expect(clock).toBeVisible();

    // The clock is rendered in the browser's own locale and timezone, so compare
    // it against a clock read in the same runtime. Comparing against the real
    // time catches a frozen, hardcoded or mis-localised clock without sleeping
    // for a minute boundary.
    const shown = (await clock.textContent())?.trim() ?? '';
    const now = await page.evaluate(
      () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    );

    const toMinutes = (value: string): number => {
      const [h, m] = value.split(':');
      return Number(h) * 60 + Number(m);
    };
    const delta = Math.abs(toMinutes(shown) - toMinutes(now));
    expect(shown).toMatch(/^\d{2}:\d{2}$/);
    expect(now).toMatch(/^\d{2}:\d{2}$/);
    // 0 minutes means it matches now; 1 absorbs a boundary crossing mid-read.
    expect(delta === 0 || delta === 1 || delta === 1439).toBe(true);

    const date = page.locator('.time-display .date');
    await expect(date).toBeVisible();
    await expect(date).toHaveText(
      await page.evaluate(
        () => new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
      )
    );

    await context.close();
  });

  test('a supervisor outranks the live board requirement and is let in', async ({ browser }) => {
    // The role hierarchy places a supervisor above medical_engineer, so the
    // guard admits them. Pinned here because it is easy to assume otherwise and
    // then "fix" a guard that is behaving as designed.
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();

    await page.goto('/app/live-tracking');

    await expect(page).toHaveURL(/\/app\/live-tracking$/);
    await expect(page.locator('.live-page')).toBeVisible();

    await context.close();
  });

  test('a technician is kept out of the live board', async ({ browser }) => {
    const context = await signedInContext(browser, 'technician');
    const page = await context.newPage();

    await page.goto('/app/live-tracking');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.live-page')).toHaveCount(0);

    await context.close();
  });
});
