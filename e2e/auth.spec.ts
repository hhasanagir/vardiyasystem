import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

/**
 * The session contract the Angular client relies on.
 *
 * `auth.browser.spec.ts` walks the visible login/logout journey; this file pins
 * the storage state itself, because the whole browser suite replays it through
 * stored sessions and a silently different key would leave every other spec
 * testing a signed-out app.
 */
test.describe('Session storage contract', () => {
  test('a successful login stores a token pair and the signed-in user', async ({ browser }) => {
    const context = await signedInContext(browser, 'technician');
    const page = await context.newPage();
    await page.goto('/app/dashboard');

    await expect(page).toHaveURL(/\/app\/dashboard$/);

    const stored = await page.evaluate(() => ({
      accessToken: window.localStorage.getItem('accessToken'),
      refreshToken: window.localStorage.getItem('refreshToken'),
      user: window.localStorage.getItem('user'),
    }));

    expect(stored.accessToken).toBeTruthy();
    expect(stored.refreshToken).toBeTruthy();
    // The token has to be a JWT, because the client reads the tenant claims
    // straight out of the payload.
    expect(stored.accessToken?.split('.')).toHaveLength(3);

    const user = JSON.parse(stored.user ?? '{}');
    expect(user.email).toBe('e2e.technician@e2e.local');
    expect(user.organizationId).toBeTruthy();
    expect(user.unitId).toBeTruthy();

    await context.close();
  });

  test('logging out removes the stored session', async ({ browser }) => {
    const context = await signedInContext(browser, 'technician');
    const page = await context.newPage();
    await page.goto('/app/dashboard');

    await page.getByLabel('Kullanıcı menüsü').click();
    await page.getByText('Çıkış Yap').click();
    await expect(page).toHaveURL(/\/login$/);

    const remaining = await page.evaluate(() => ({
      accessToken: window.localStorage.getItem('accessToken'),
      refreshToken: window.localStorage.getItem('refreshToken'),
    }));
    expect(remaining.accessToken).toBeNull();
    expect(remaining.refreshToken).toBeNull();

    // A reload must not resurrect the session from anywhere else.
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);

    await context.close();
  });

  test('a rejected login stores no session at all', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('e2e.technician@e2e.local');
    await page.locator('#password').fill('yanlis-parola');
    await page.locator('button[type=submit]').click();

    await expect(page.locator('.p-toast-message')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    const stored = await page.evaluate(() => ({
      accessToken: window.localStorage.getItem('accessToken'),
      refreshToken: window.localStorage.getItem('refreshToken'),
    }));
    expect(stored.accessToken).toBeNull();
    expect(stored.refreshToken).toBeNull();
  });

  test('an authenticated visitor is kept away from the login screen', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('#email')).toHaveCount(0);

    await context.close();
  });
});
