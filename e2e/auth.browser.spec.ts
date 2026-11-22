import { test, expect } from '@playwright/test';

/**
 * The authentication journey, driven entirely through the real login screen.
 * Nothing here is stubbed: the form posts to the API through the dev proxy and
 * the assertions read what the user actually sees.
 */
test.describe('Authentication journey', () => {
  test('login screen renders the real form', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.brand-name')).toHaveText('Vardiya');
    await expect(page.locator('.card-title')).toHaveText('Hoş geldiniz');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    // The form refuses to submit while it is empty, and unlocks once it is
    // complete — both states are asserted so a permanently disabled button
    // cannot pass.
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.fill('#email', 'admin@hospital.com');
    await page.fill('#password', 'admin123');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test('wrong password is rejected and the session stays closed', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@hospital.com');
    await page.fill('#password', 'wrong-password-for-browser-gate');
    await page.click('button[type="submit"]');

    // The API answers 401; the screen has to say so instead of navigating.
    await expect(page.locator('.p-toast-message')).toBeVisible();
    await expect(page.locator('.p-toast-message')).toContainText('Giriş Başarısız');
    await expect(page).toHaveURL(/\/login$/);

    const stored = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(stored).toBeNull();
  });

  test('valid credentials open the dashboard with the signed-in user', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@hospital.com');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    const greeting = page.locator('.dashboard-greeting');
    await expect(greeting).toBeVisible();
    // The heading renders the signed-in account's name, so a dashboard rendered
    // without a session cannot satisfy this.
    await expect(greeting).toContainText('Sistem Yöneticisi');
  });

  test('the session survives a full page reload', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@hospital.com');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/app\/dashboard$/);

    await page.reload();

    // A reload that dropped the session would bounce back to /login.
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.dashboard-greeting')).toBeVisible();
  });

  test('an unauthenticated deep link is sent to the login screen', async ({ page }) => {
    await page.goto('/app/schedules');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#email')).toBeVisible();
  });

  test('logout ends the session and re-locks the protected area', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@hospital.com');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/app\/dashboard$/);

    await page.getByLabel('Kullanıcı menüsü').click();
    await page.getByRole('menuitem', { name: 'Çıkış Yap' }).click();

    await expect(page).toHaveURL(/\/login$/);
    const stored = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(stored).toBeNull();

    await page.goto('/app/schedules');
    await expect(page).toHaveURL(/\/login$/);
  });
});
