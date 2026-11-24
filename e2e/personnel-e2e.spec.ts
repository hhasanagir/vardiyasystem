import { test, expect } from '@playwright/test';
import { signedInContext } from './fixtures/auth';

/**
 * Personnel management needs a supervisor-level account with `personnel.read`,
 * which is exactly what the fixture account has.
 */
test.describe('Personnel management', () => {
  test('the page renders the seeded roster', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();

    await page.goto('/app/employees');

    await expect(page.locator('.personnel-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Personel Yönetimi' })).toBeVisible();
    // The grid is populated from the API, so an empty grid would mean the
    // personnel request failed or was filtered away.
    await expect(page.locator('.personnel-card').first()).toBeVisible();

    await context.close();
  });

  test('search narrows the roster to matching names', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/employees');

    const cards = page.locator('.personnel-card');
    // The grid hydrates from the API after the route settles; count only once
    // the roster is actually on the page, otherwise a slow first load reads an
    // empty list and the search below is exercised against nothing.
    await expect(cards.first()).toBeVisible();
    const before = await cards.count();
    expect(before).toBeGreaterThan(0);

    // The term has to come from a field the search actually matches: the filter
    // looks at the person's name and role, not at the avatar initials.
    const fullName = (await cards.first().locator('.person-name').textContent())?.trim() ?? '';
    const term = fullName.split(/\s+/).filter(Boolean)[0] ?? '';
    expect(term.length).toBeGreaterThan(1);

    await page.locator('input[name="searchTerm"]').fill(term);

    // The list has to shrink and every survivor has to match; an unchanged list
    // would mean the search box is not wired to the filter.
    await expect(cards.first()).toBeVisible();
    const after = await cards.count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    for (const name of await cards.locator('.person-name').allTextContents()) {
      expect(name.toLowerCase()).toContain(term.toLowerCase());
    }

    await page.locator('input[name="searchTerm"]').fill('');
    await expect(cards).toHaveCount(before);

    await context.close();
  });

  test('a search with no match shows an empty state instead of stale rows', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/employees');

    await page.locator('input[name="searchTerm"]').fill('zzzqqq-bulunamayan-kisi');

    await expect(page.locator('.personnel-card')).toHaveCount(0);

    await context.close();
  });

  test('the department filter marks exactly one tab active', async ({ browser }) => {
    const context = await signedInContext(browser, 'supervisor');
    const page = await context.newPage();
    await page.goto('/app/employees');

    const tabs = page.locator('.filter-tab');
    await expect(tabs.first()).toBeVisible();
    const count = await tabs.count();
    expect(count).toBeGreaterThan(1);

    await expect(page.locator('.filter-tab.active')).toHaveCount(1);
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(page.locator('.filter-tab.active')).toHaveCount(1);

    await context.close();
  });

  test('a technician is not allowed on the personnel page', async ({ browser }) => {
    const context = await signedInContext(browser, 'technician');
    const page = await context.newPage();

    await page.goto('/app/employees');

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.locator('.personnel-page')).toHaveCount(0);

    await context.close();
  });
});
